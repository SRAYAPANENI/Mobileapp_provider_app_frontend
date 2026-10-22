import { Text } from '@/components/scaled-text';
import { Fonts } from '@/constants/theme';
import { SkoFyApi } from '@/services/api';
import { DoorOpen, MapPinCheck } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';

const WAIT_MINUTES = 15;

interface Props {
  jobId: string;
  /** When "I'm here" was recorded (server), if it was. */
  arrivedAt: string | null | undefined;
  /** The customer is meant to be there (a job at their place). */
  customerExpected: boolean;
  getCoords: () => Promise<{ latitude: number; longitude: number } | null>;
  onArrived: () => void;
  onCustomerAbsent: () => void;
  onError: (title: string, message: string) => void;
}

// "I'm here" at the job — checked against its location — tells the customer
// and starts the wait. After the wait, "Customer not here" cancels the job
// and the visiting fee is the provider's (docs/MONEY_RULES_DESIGN.md §3).
export function ArrivalPanel({ jobId, arrivedAt, customerExpected, getCoords, onArrived, onCustomerAbsent, onError }: Props) {
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!arrivedAt) return;
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [arrivedAt]);

  const withCoords = async (action: (lat: number, lng: number) => Promise<unknown>, after: () => void) => {
    setBusy(true);
    try {
      const coords = await getCoords();
      if (!coords) {
        onError('Location Required', 'Turn on location — this only counts at the job.');
        return;
      }
      await action(coords.latitude, coords.longitude);
      after();
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
        onPress={() => withCoords((lat, lng) => SkoFyApi.jobs.markArrived(jobId, lat, lng), onArrived)}
      >
        {busy ? <ActivityIndicator color="#111827" /> : <MapPinCheck size={18} color="#111827" />}
        <Text style={s.arriveText}>I'm here</Text>
      </TouchableOpacity>
    );
  }

  if (!customerExpected) return null;
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
        onPress={() => withCoords((lat, lng) => SkoFyApi.jobs.reportCustomerAbsent(jobId, lat, lng), onCustomerAbsent)}
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
  body: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.poppins, color: '#92400E' },
  absent: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2,
    paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2',
  },
  absentText: { fontSize: 13.5, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: '#B91C1C' },
});
