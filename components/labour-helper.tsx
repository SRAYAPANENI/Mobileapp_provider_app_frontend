import { Text, TextInput } from '@/components/scaled-text';
import { Fonts } from '@/constants/theme';
import { SkoFyApi } from '@/services/api';
import { Clock } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

// The usual hourly rate, once per app session (it's set in Rates & hosting).
let usualRate: Promise<number | null> | null = null;
function loadUsualRate(): Promise<number | null> {
  if (!usualRate) {
    usualRate = SkoFyApi.provider.getProfile()
      .then((p: any) => (p?.hourly_rate != null ? Number(p.hourly_rate) : null))
      .catch(() => { usualRate = null; return null; });
  }
  return usualRate;
}

/** Forget the cached rate — after it's changed in Rates & hosting. */
export function refreshUsualRate(): void {
  usualRate = null;
}

interface Props {
  partsTotal: number;
  /** Fills the invoice amount; the provider can still change it. */
  onUse: (amount: string) => void;
}

// "How long did it take?" on an invoice: hours × your usual hourly rate, plus
// the parts listed, as the invoice amount — so the price shows how it was
// reached. Hidden until a usual hourly rate is set.
export function LabourHelper({ partsTotal, onUse }: Props) {
  const [rate, setRate] = useState<number | null>(null);
  const [hours, setHours] = useState('');

  useEffect(() => {
    let live = true;
    loadUsualRate().then((r) => { if (live) setRate(r); });
    return () => { live = false; };
  }, []);

  if (!rate) return null;
  const h = parseFloat(hours);
  const labour = h > 0 ? Math.round(h * rate * 100) / 100 : 0;
  const total = Math.round((labour + partsTotal) * 100) / 100;

  return (
    <View style={s.box}>
      <View style={s.row}>
        <Clock size={15} color="#111827" />
        <Text style={s.title}>Work time</Text>
        <TextInput
          style={s.input}
          value={hours}
          onChangeText={(t) => setHours(t.replace(/[^0-9.]/g, ''))}
          placeholder="hours"
          placeholderTextColor="#9CA3AF"
          keyboardType="decimal-pad"
        />
        <Text style={s.rate}>× ${rate}/hr</Text>
      </View>
      {labour > 0 && (
        <TouchableOpacity style={s.use} onPress={() => onUse(total.toFixed(2))}>
          <Text style={s.useText}>
            Use ${total.toFixed(2)} — labour ${labour.toFixed(2)}{partsTotal > 0 ? ` + parts $${partsTotal.toFixed(2)}` : ''}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  box: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 13.5, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
  input: {
    width: 72, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    fontSize: 14, fontFamily: Fonts.poppinsSemiBold, color: '#111827', backgroundColor: '#fff', textAlign: 'center',
  },
  rate: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppins, color: '#374151' },
  use: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FFCE48', alignItems: 'center' },
  useText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: '#111827' },
});
