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
  /** This stop is charged at all — a store's pickup isn't (the fare covers it). */
  counts?: boolean;
  /** Its clock stopped early: the customer's "It's handed over", or leaving the stop. */
  stopped_at?: string | null;
  stopped_by?: 'CUSTOMER' | 'LEFT' | null;
  /** This stop's clock is running: the server leaves its minutes and money
   *  out until it stops (trip_wait.py as_provider_sees) — no meter to watch. */
  counting?: boolean;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** What waiting paid, once no clock is running: after the pickup (on the way)
 *  and after the drop-off (delivered). The result, never a meter. */
export function WaitResult({ wait }: { wait?: TripWait | null }) {
  if (!wait || wait.counting || wait.minutes <= 0 || (wait.stage !== 'ON_THE_WAY' && wait.stage !== 'DONE')) return null;
  return (
    <View style={s.card}>
      <View style={s.row}>
        <Timer size={15} color="#92400E" />
        <Text style={s.title}>{`Waiting paid · ${wait.minutes} min · $${wait.charge.toFixed(2)}`}</Text>
      </View>
      <Text style={s.body}>
        {wait.stage === 'ON_THE_WAY' ? 'For waiting at the pickup — added to your pay for this trip.' : 'Added to your pay for this trip.'}
      </Text>
    </View>
  );
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
      <View style={s.stack}>
      {stop === 'dropoff' && <WaitResult wait={wait} />}
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
      </View>
    );
  }

  if (!customerExpected) {
    // Only this stop's clock: the pickup's until it's collected, then the drop-off's.
    if (!wait || wait.stage !== (stop === 'dropoff' ? 'DROPOFF' : 'PICKUP')) return null;
    // A store's pickup: never charged — said so, rather than a count that's never paid.
    if (wait.counts === false) {
      return (
        <View style={s.card}>
          <View style={s.row}>
            <Timer size={15} color="#92400E" />
            <Text style={s.title}>Waiting at a store isn't charged</Text>
          </View>
          <Text style={s.body}>Your fare covers it. Waiting is paid at a person's pickup and at the drop-off.</Text>
        </View>
      );
    }
    // Stopped early: the server's count is final — the phone stops counting.
    if (wait.stopped_at) {
      return (
        <View style={s.card}>
          <View style={s.row}>
            <Timer size={15} color="#92400E" />
            <Text style={s.title}>
              {`Waiting stopped · ${wait.minutes} min · $${wait.charge.toFixed(2)}${wait.used_before > 0 ? ' in all' : ''}`}
            </Text>
          </View>
          <Text style={s.body}>
            {wait.stopped_by === 'LEFT'
              ? `It stopped at ${clock(wait.stopped_at)} when you left the stop.`
              : `The customer said it was handed over at ${clock(wait.stopped_at)}.`}
            {stop === 'dropoff' ? ' Enter their code to finish.' : ' Take the photo and confirm the pickup.'}
          </Text>
        </View>
      );
    }
    // Running: no meter — the time is counted for them, the result shown once it stops.
    const capUsed = wait.used_before >= wait.max_minutes;      // the pickup used all the paid waiting
    const pickupLine = wait.used_before > 0
      ? ` Already counted at the pickup: ${wait.used_before} min · $${wait.charge.toFixed(2)}.` : '';
    return (
      <View style={s.card}>
        <View style={s.row}>
          <Timer size={15} color="#92400E" />
          <Text style={s.title}>
            {stop === 'dropoff' ? "You're at the drop-off — the customer's been told" : "You're here — the customer's been told"}
          </Text>
        </View>
        <Text style={s.body}>
          {capUsed
            ? `Waiting at the pickup used all the paid waiting ($${wait.hold.toFixed(2)}), so waiting here isn't paid.${pickupLine}`
            : (wait.free_minutes > 0
                ? `If you're kept waiting past ${wait.free_minutes} free minutes, the time is counted for you and added to your pay. `
                : "If you're kept waiting, the time is counted for you and added to your pay. ")
              + (stop === 'dropoff' ? "You'll see it once the code is entered" : "You'll see it once you confirm the pickup")
              + ", the customer taps \"It's handed over\", or you leave."
              + pickupLine}
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
  stack: { alignSelf: 'stretch' },
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
