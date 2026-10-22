import { ArrivalPanel } from '@/components/arrival-panel';
import { CodeHandoverForm } from '@/components/code-handover-form';
import { DeliveryHandover } from '@/components/delivery-handover';
import { Text, TextInput } from '@/components/scaled-text';
import { Fonts } from '@/constants/theme';
import { SkoFyApi } from '@/services/api';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Camera, CheckCircle, DoorOpen, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

const DROP_OFF_WAIT_MINUTES = 60; // settings.DROP_OFF_WAIT_MINUTES
const MAX_HANDOVER_PHOTOS = 6;
const MAX_UPDATE_PHOTOS = 4;

type Shot = { uri: string; mimeType: string };
type Coords = { latitude: number; longitude: number };

interface Props {
  /** The job as the server has it (GET /jobs/{id}). */
  job: any;
  getCoords: () => Promise<Coords | null>;
  onChanged: () => void;
  onComplete: () => void;
  onCustomerAbsent: (message?: string) => void;
  onMessage: (kind: 'success' | 'error' | 'info' | 'warning', title: string, message: string) => void;
}

const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// A job priced up front (docs/JOB_SHAPE_DESIGN.md phase 4), step by step for
// the provider: wait for the booking → check in with the customer's code →
// photos at hand-over → an update at least once a day → hand back with the
// customer's code → complete. Each step is one card; only the next one shows.
export function CareJobPanel({ job, getCoords, onChanged, onComplete, onCustomerAbsent, onMessage }: Props) {
  const steps: string[] = job?.steps ?? [];
  const venue: string = job?.shape?.venue ?? 'CUSTOMER_PLACE';
  const paid = job?.payment_status === 'HELD' || job?.payment_status === 'PAID';
  const price = job?.upfront_price;

  if (!job) return <ActivityIndicator color="#111827" style={{ marginVertical: 12 }} />;

  const summary = (
    <View style={s.card}>
      <Text style={s.title}>{paid ? 'Booked ✓' : 'Waiting for the booking'}</Text>
      {price && <Text style={s.body}>{price.text}</Text>}
      {job.scheduled_at && (
        <Text style={s.body}>
          {venue === 'PROVIDER_PLACE' ? 'Drop-off' : 'Starts'}: {when(job.scheduled_at)}
          {job.shape?.ends_at ? `  ·  ${venue === 'PROVIDER_PLACE' ? 'Pick-up' : 'Ends'}: ${when(job.shape.ends_at)}` : ''}
        </Text>
      )}
      {!paid && <Text style={s.muted}>The customer pays when they book — it's held safely and paid to you when the job is done.</Text>}
    </View>
  );

  if (job.status === 'ACCEPTED') {
    if (!paid) return summary;
    const checkIn = (
      <CodeHandoverForm
        title={venue === 'PROVIDER_PLACE' ? 'Check them in' : 'Start the job'}
        body={venue === 'PROVIDER_PLACE'
          ? 'When the customer arrives, ask for the 4-digit code on their screen.'
          : "Once you're there, ask the customer for the 4-digit code on their screen."}
        requestLabel="Ask for the code"
        confirmLabel={venue === 'PROVIDER_PLACE' ? 'Check in' : 'Start'}
        requestedMessage="The customer now sees a 4-digit code in their app."
        placeName={venue === 'PROVIDER_PLACE' ? 'your place' : 'the job'}
        onRequest={() => SkoFyApi.jobs.requestCheckInCode(job.id)}
        onVerify={(code, lat, lng) => SkoFyApi.jobs.checkIn(job.id, code, lat, lng)}
        onDone={onChanged}
      />
    );
    return (
      <View style={s.wrap}>
        {summary}
        {venue === 'CUSTOMER_PLACE' && (
          <ArrivalPanel
            jobId={job.id}
            arrivedAt={job.arrived_at}
            customerExpected
            getCoords={getCoords}
            onArrived={onChanged}
            onCustomerAbsent={onCustomerAbsent}
            onError={(title, message) => onMessage('error', title, message)}
          />
        )}
        {checkIn}
        {venue === 'PROVIDER_PLACE' && (
          <MissedDropOff job={job} getCoords={getCoords} onDone={onCustomerAbsent} onMessage={onMessage} />
        )}
      </View>
    );
  }

  if (job.status !== 'IN_PROGRESS') return null;

  if (steps.includes('HANDOVER_PHOTOS') && !job.handover_at) {
    return (
      <PhotoStep
        title="Photos at hand-over"
        body="Take a few photos of what you're looking after, as it was handed to you. The customer sees them — it protects you both."
        max={MAX_HANDOVER_PHOTOS}
        confirmLabel="Save hand-over photos"
        onSubmit={async (shots) => {
          const c = await getCoords();
          if (!c) throw new Error('Turn on location to save the hand-over.');
          await SkoFyApi.jobs.handOver(job.id, c.latitude, c.longitude, shots);
        }}
        onDone={() => { onMessage('success', 'Saved', 'The customer can see the photos.'); onChanged(); }}
        onMessage={onMessage}
      />
    );
  }

  const handedBack = !steps.includes('HANDBACK_CODE') || !!job.delivered_at;
  return (
    <View style={s.wrap}>
      {steps.includes('PERIODIC_UPDATES') && !handedBack && <CareUpdates jobId={job.id} onMessage={onMessage} />}
      {handedBack ? (
        <TouchableOpacity style={s.complete} onPress={onComplete}>
          <CheckCircle size={20} color="#fff" />
          <Text style={s.completeText}>Mark as Completed</Text>
        </TouchableOpacity>
      ) : (
        <DeliveryHandover jobId={job.id} kind="care" onDelivered={onChanged} />
      )}
    </View>
  );
}

// At your place, the customer never brought it: after the wait, report it —
// the booking is called off and you're paid for the spot you kept.
function MissedDropOff({ job, getCoords, onDone, onMessage }: {
  job: any; getCoords: () => Promise<Coords | null>;
  onDone: (message?: string) => void; onMessage: Props['onMessage'];
}) {
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!job.scheduled_at) return null;
  const leftMin = Math.ceil((new Date(job.scheduled_at).getTime() + DROP_OFF_WAIT_MINUTES * 60000 - now) / 60000);

  const report = async () => {
    setBusy(true);
    try {
      const c = await getCoords();
      if (!c) {
        onMessage('error', 'Location Required', 'Turn on location — this only counts at your place.');
        return;
      }
      const result: any = await SkoFyApi.jobs.reportCustomerAbsent(job.id, c.latitude, c.longitude);
      onDone(result?.message);
    } catch (err: any) {
      onMessage('error', 'Could Not Send', err?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.notice}>
      <Text style={s.noticeText}>
        {leftMin > 0
          ? `If they haven't come ${leftMin} min from now, you can report it — you're paid for the spot you kept.`
          : "They didn't come? Report it — the booking is called off and you're paid for the spot you kept."}
      </Text>
      <TouchableOpacity style={[s.absent, (leftMin > 0 || busy) && s.dim]} disabled={leftMin > 0 || busy} onPress={report}>
        <DoorOpen size={16} color="#B91C1C" />
        <Text style={s.absentText}>They didn't come</Text>
      </TouchableOpacity>
    </View>
  );
}

// Photos taken in the app (never from the library — they're proof).
function PhotoStep({ title, body, max, confirmLabel, onSubmit, onDone, onMessage, withNote = false }: {
  title: string; body: string; max: number; confirmLabel: string; withNote?: boolean;
  onSubmit: (shots: Shot[], note: string) => Promise<unknown>; onDone: () => void; onMessage: Props['onMessage'];
}) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const take = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      onMessage('error', 'Camera needed', 'Allow the camera to take the photos.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    const asset = shot.canceled ? null : shot.assets?.[0];
    if (asset) setShots((prev) => [...prev, { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' }].slice(0, max));
  };

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(shots, note);
      setShots([]);
      setNote('');
      onDone();
    } catch (err: any) {
      onMessage('error', 'Not saved', err?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.card}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.muted}>{body}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {shots.map((p, i) => (
          <View key={p.uri}>
            <Image source={{ uri: p.uri }} style={s.photo} contentFit="cover" />
            <TouchableOpacity style={s.remove} onPress={() => setShots((prev) => prev.filter((_, j) => j !== i))}>
              <X size={12} color="#fff" />
            </TouchableOpacity>
          </View>
        ))}
        {shots.length < max && (
          <TouchableOpacity style={[s.photo, s.addPhoto]} onPress={take}>
            <Camera size={22} color="#6B7280" />
            <Text style={s.addText}>Take photo</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      {withNote && (
        <TextInput
          style={s.note}
          placeholder="A line for the customer (optional) — e.g. Ate well, had a long walk."
          placeholderTextColor="#9CA3AF"
          value={note}
          onChangeText={setNote}
          maxLength={500}
          multiline
        />
      )}
      <TouchableOpacity style={[s.primary, (shots.length === 0 || busy) && s.dim]} disabled={shots.length === 0 || busy} onPress={submit}>
        {busy ? <ActivityIndicator color="#111827" /> : <Text style={s.primaryText}>{confirmLabel}</Text>}
      </TouchableOpacity>
    </View>
  );
}

// At least one photo update a day while it's in your care — the customer is
// told if one is very late (app/domain/care_updates.py).
function CareUpdates({ jobId, onMessage }: { jobId: string; onMessage: Props['onMessage'] }) {
  const [last, setLast] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const load = () => {
    SkoFyApi.jobs.careRecord(jobId).then((r) => {
      setCount(r.updates.length);
      setLast(r.updates[0]?.created_at ?? null);
    }).catch(() => {});
  };
  useEffect(load, [jobId]);

  return (
    <PhotoStep
      title="Send an update"
      body={last
        ? `Last update ${when(last)} (${count} so far). Send at least one a day — a photo and a line.`
        : 'Send at least one update a day — a photo and a line. Customers love these.'}
      max={MAX_UPDATE_PHOTOS}
      withNote
      confirmLabel="Send update"
      onSubmit={(shots, note) => SkoFyApi.jobs.postCareUpdate(jobId, note, shots)}
      onDone={() => { onMessage('success', 'Sent', 'The customer can see your update.'); load(); }}
      onMessage={onMessage}
    />
  );
}

const s = StyleSheet.create({
  wrap: { gap: 12 },
  card: { padding: 14, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', gap: 8 },
  title: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: '#111827' },
  body: { fontSize: 13.5, lineHeight: 19, fontFamily: Fonts.poppins, color: '#111827' },
  muted: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppins, color: '#6B7280' },
  photo: { width: 84, height: 84, borderRadius: 10, backgroundColor: '#F3F4F6' },
  addPhoto: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: '#D1D5DB', gap: 2 },
  addText: { fontSize: 11, lineHeight: 14, fontFamily: Fonts.poppins, color: '#6B7280' },
  remove: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  note: { minHeight: 60, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', fontSize: 13.5, fontFamily: Fonts.poppins, color: '#111827', textAlignVertical: 'top' },
  primary: { paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: '#FFCE48' },
  primaryText: { fontSize: 14.5, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: '#111827' },
  complete: { height: 52, borderRadius: 16, backgroundColor: '#10B981', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  completeText: { fontSize: 15, fontFamily: Fonts.poppinsBold, color: '#fff' },
  notice: { padding: 12, borderRadius: 14, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', gap: 8 },
  noticeText: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.poppins, color: '#92400E' },
  absent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  absentText: { fontSize: 13.5, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: '#B91C1C' },
  dim: { opacity: 0.45 },
});
