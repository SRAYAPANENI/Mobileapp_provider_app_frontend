import { Text, TextInput } from '@/components/scaled-text';
import { Fonts } from '@/constants/theme';
import { ExtraWork, SkoFyApi } from '@/services/api';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';

const POLL_MS = 15000;

interface Props {
  jobId: string;
  onMessage: (kind: 'success' | 'error' | 'info', title: string, message: string) => void;
}

// Found more to do once the job started? Ask the customer to add it
// (docs/MONEY_RULES_DESIGN.md §11). They approve and pay it into escrow
// before you do it — so start the added work only once it says "Paid".
export function ExtraWorkPanel({ jobId, onMessage }: Props) {
  const [work, setWork] = useState<ExtraWork | null>(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    SkoFyApi.jobs.extraWork(jobId).then(setWork).catch(() => setWork(null));
  }, [jobId]);
  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const send = async () => {
    setBusy(true);
    try {
      const result = await SkoFyApi.jobs.proposeExtraWork(jobId, parseFloat(amount), description.trim());
      onMessage('success', 'Sent', result.message);
      setOpen(false); setAmount(''); setDescription('');
    } catch (err: any) {
      onMessage('error', 'Not sent', err?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
      load();
    }
  };

  const withdraw = async () => {
    setBusy(true);
    try { await SkoFyApi.jobs.withdrawExtraWork(jobId); } catch {}
    setBusy(false);
    load();
  };

  const waiting = work && (work.status === 'PROPOSED' || work.status === 'ACCEPTED');
  return (
    <View style={s.card}>
      {work?.status === 'PAID' ? (
        <Text style={s.status}>Added work paid: ${work.amount.toFixed(2)} — go ahead. It's paid out with the rest of the job.</Text>
      ) : waiting ? (
        <>
          <Text style={s.status}>Waiting for the customer to approve ${work!.amount.toFixed(2)} of added work.</Text>
          <Text style={s.muted}>Don't start it until it's paid.</Text>
          <TouchableOpacity onPress={withdraw} disabled={busy}><Text style={s.link}>Withdraw the request</Text></TouchableOpacity>
        </>
      ) : open ? (
        <>
          {work?.status === 'DECLINED' && <Text style={s.muted}>The customer turned down the last request.</Text>}
          <TextInput style={s.input} placeholder="Amount ($)" placeholderTextColor="#9CA3AF" keyboardType="decimal-pad"
            value={amount} onChangeText={setAmount} />
          <TextInput style={[s.input, s.multi]} placeholder="What's the added work, and why?" placeholderTextColor="#9CA3AF"
            value={description} onChangeText={setDescription} multiline maxLength={1000} />
          <View style={s.row}>
            <TouchableOpacity style={s.secondary} onPress={() => setOpen(false)} disabled={busy}>
              <Text style={s.secondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.primary, (!(parseFloat(amount) > 0) || description.trim().length < 5 || busy) && { opacity: 0.5 }]}
              onPress={send} disabled={!(parseFloat(amount) > 0) || description.trim().length < 5 || busy}>
              {busy ? <ActivityIndicator color="#111827" /> : <Text style={s.primaryText}>Send to customer</Text>}
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <TouchableOpacity onPress={() => setOpen(true)}>
          <Text style={s.link}>Found more to do? Ask to add work</Text>
          {work?.status === 'DECLINED' && <Text style={s.muted}>The customer turned down the last request.</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginBottom: 12, padding: 12, borderRadius: 12, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', gap: 8 },
  status: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
  muted: { fontSize: 12, lineHeight: 17, fontFamily: Fonts.poppins, color: '#6B7280' },
  link: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: '#2563EB' },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff',
    fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppins, color: '#111827',
  },
  multi: { minHeight: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8 },
  secondary: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', backgroundColor: '#F3F4F6' },
  secondaryText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: '#374151' },
  primary: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', backgroundColor: '#FFCE48' },
  primaryText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: '#111827' },
});
