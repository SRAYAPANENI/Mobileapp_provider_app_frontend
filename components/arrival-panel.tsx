import { Text } from '@/components/scaled-text';
import { Fonts } from '@/constants/theme';
import { SkoFyApi } from '@/services/api';
import { DoorOpen, MapPinCheck, Timer } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';

const WAIT_MINUTES = 15;

/** Waiting on a Pickup & Delivery trip (skofy-backend app/domain/trip_wait.py):
 *  one cap for the pickup and the drop-off together. */
export interface TripWait {
  per_minute: number; free_minutes: number; max_minutes: number; hold: number; text: string;
  stage: 'PICKUP' | 'ON_THE_WAY' | 'DROPOFF' | 'DONE';
  free_until: string | null; used_before: number; minutes: number; charge: number; final: boolean;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** What waiting so far is worth, counted on the phone between refreshes —
 *  the server's count (whole minutes after the free ones) is what's charged. */
function waitedSoFar(wait: TripWait, arrivedAt: string, now: number) {
  const whole = Math.floor((now - new Date(arrivedAt).getTime()) / 60000);
  const here = Math.min(Math.max(whole - wait.free_minutes, 0), Math.max(wait.max_minutes - wait.used_before, 0));
  const minutes = wait.used_before + here;
  return { here, minutes, charge: Math.round(minutes * wait.per_minute * 100) / 100 };
}

interface Props {
  jobId: string;
  /** When "I'm here" was recorded (server), if it was. */
  arrivedAt: string | null | undefined;
  /** The customer is meant to be there (a job at their place). */
  customerExpected: boolean;
  getCoords: () => Promise<{ latitude: number; longitude: number } | null>;
  onArrived: () => void;
  /** With the server's message — it differs for a booking paid up front. */
  onCustomerAbsent: (message?: string) => void;
  /** A trip with waiting agreed: "I'm here" starts the clock. */
  wait?: TripWait | null;
  /** Which stop of a delivery this is — the drop-off has its own "I'm here". */
  stop?: 'pickup' | 'dropoff';
  onError: (title: string, message: string) => void;
}

// "I'm here" at the job — checked against its location — tells the customer
// and starts the wait. After the wait, "Customer not here" cancels the job
// and the visiting fee is the provider's (docs/MONEY_RULES_DESIGN.md §3).
export function ArrivalPanel({ jobId, arrivedAt, customerExpected, getCoords, onArrived, onCustomerAbsent, onError, wait, stop = 'pickup' }: Props) {
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!arrivedAt) return;
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [arrivedAt]);

  const withCoords = async (action: (lat: number, lng: number) => Promise<any>, after: (result: any) => void) => {
    setBusy(true);
    try {
      const coords = await getCoords();
      if (!coords) {
        onError('Location Required', 'Turn on location — this only counts at the job.');
        return;
      }
      after(await action(coords.latitude, coords.longitude));
    } catch (err: any) {
      onError(err?.error_code === 'NOT_AT_LOCATION' ? 'Not at the Job Yet' : 'Could Not Send', err?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!arrivedAt) {
    return (
      <TouchableOpacity
        style={[s.arrive, busy && { opacity: 0.6 }]}
        disabled={busy}
        onPress={() => withCoords((lat, lng) => (stop === 'dropoff'
          ? SkoFyApi.jobs.arrivedAtDropoff(jobId, lat, lng)
          : SkoFyApi.jobs.markArrived(jobId, lat, lng)), onArrived)}
      >
        {busy ? <ActivityIndicator color="#111827" /> : <MapPinCheck size={18} color="#111827" />}
        <Text style={s.arriveText}>{stop === 'dropoff' ? "I'm at the drop-off" : "I'm here"}</Text>
      </TouchableOpacity>
    );
  }

  if (!customerExpected) {
    // Only this stop's clock: the pickup's until it's collected, then the drop-off's.
    if (!wait || wait.stage !== (stop === 'dropoff' ? 'DROPOFF' : 'PICKUP')) return null;
    const so = waitedSoFar(wait, arrivedAt, now);
    return (
      <View style={s.card}>
        <View style={s.row}>
          <Timer size={15} color="#92400E" />
          <Text style={s.title}>
            {so.minutes > 0 ? `Waiting: ${so.minutes} min · $${so.charge.toFixed(2)}` : 'Waiting is free for now'}
          </Text>
        </View>
        <Text style={s.body}>
          {so.minutes >= wait.max_minutes
            ? `That's the most waiting pays ($${wait.hold.toFixed(2)} in all). Message the customer if you're still waiting.`
            : `Free until ${wait.free_until ? clock(wait.free_until) : 'the free minutes end'}, then $${wait.per_minute.toFixed(2)} a minute`
              + (wait.used_before > 0 ? ` (${wait.max_minutes - wait.used_before} min left after the pickup's ${wait.used_before})` : `, up to $${wait.hold.toFixed(2)} in all`)
              + (stop === 'dropoff' ? '. It stops when the drop-off code is entered.' : '. It stops when you confirm pickup.')}
        </Text>
      </View>
    );
  }
  const waitedMs = now - new Date(arrivedAt).getTime();
  const leftMin = Math.max(0, Math.ceil(WAIT_MINUTES - waitedMs / 60000));
  return (
    <View style={s.card}>
      <Text style={s.title}>The customer knows you're here</Text>
      <Text style={s.body}>
        {leftMin > 0
          ? `If nobody comes, you can report it in ${leftMin} min — the visiting fee is then yours.`
          : "Nobody came? Report it — the job is cancelled and the visiting fee is yours."}
      </Text>
      <TouchableOpacity
        style={[s.absent, (leftMin > 0 || busy) && { opacity: 0.45 }]}
        disabled={leftMin > 0 || busy}
        onPress={() => withCoords((lat, lng) => SkoFyApi.jobs.reportCustomerAbsent(jobId, lat, lng), (r) => onCustomerAbsent(r?.message))}
      >
        <DoorOpen size={16} color="#B91C1C" />
        <Text style={s.absentText}>Customer not here</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  arrive: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10,
    paddingVertical: 13, borderRadius: 14, backgroundColor: '#FFCE48',
  },
  arriveText: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: '#111827' },
  card: { marginBottom: 10, padding: 12, borderRadius: 14, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', gap: 6 },
  title: { fontSize: 13.5, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: '#92400E' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  body: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.poppins, color: '#92400E' },
  absent: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2,
    paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2',
  },
  absentText: { fontSize: 13.5, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: '#B91C1C' },
});
