import React, { useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { showDialog } from '@/components/alert-host';
import { Popup, PopupCard } from '@/components/popup';
import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { SkoFyApi } from '@/services/api';

// Withdrawing from a hired job, with a reason the customer is told. Cancels
// THIS room's job — it used to cancel the dashboard's "active" job, which with
// more than one booked job could be a different one.

const REASONS = [
  'Personal emergency',
  'Vehicle breakdown',
  "Can't reach the location",
  'Unexpected schedule conflict',
  'Customer not responding',
  'Other',
];

export function CancelJobSheet({ jobId, visible, title = 'Withdraw from Job', subtitle = 'The customer will be notified. This may affect your reliability score.', onClose, onCancelled }: {
  jobId: string;
  visible: boolean;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const finalReason = reason === 'Other' ? other.trim() : reason;

  const close = () => { setReason(null); setOther(''); onClose(); };

  const confirm = async () => {
    if (!finalReason || cancelling) return;
    setCancelling(true);
    try {
      await SkoFyApi.jobs.cancelJob(jobId, finalReason);
      setReason(null); setOther('');
      onCancelled();
    } catch (err: any) {
      showDialog('Cancel Failed', err?.message ?? 'Could not cancel this job. Please try again.', undefined, { type: 'error' });
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Popup closeOn={cancelling ? 'none' : 'back'} visible={visible} transparent animationType="fade" onClose={close}>
      <View style={st.overlay}>
        <PopupCard style={st.card}>
          <ThemedText style={st.title}>{title}</ThemedText>
          <ThemedText style={st.subtitle}>{subtitle}</ThemedText>
          <View style={{ gap: 8, marginTop: 16 }}>
            {REASONS.map((r) => (
              <TouchableOpacity key={r} style={[st.chip, reason === r && st.chipOn]} onPress={() => setReason(r)}>
                <ThemedText style={[st.chipText, reason === r && st.chipTextOn]}>{r}</ThemedText>
              </TouchableOpacity>
            ))}
          </View>
          {reason === 'Other' && (
            <TextInput
              style={st.otherInput}
              placeholder="Please describe the reason"
              placeholderTextColor="#9CA3AF"
              value={other}
              onChangeText={setOther}
              multiline
            />
          )}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
            <TouchableOpacity style={st.secondaryBtn} onPress={close} disabled={cancelling}>
              <ThemedText style={st.secondaryBtnText}>Go Back</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.primaryBtn, (!finalReason || cancelling) && { opacity: 0.5 }]}
              disabled={!finalReason || cancelling}
              onPress={confirm}
            >
              <ThemedText style={st.primaryBtnText}>{cancelling ? 'Cancelling...' : 'Confirm Cancel'}</ThemedText>
            </TouchableOpacity>
          </View>
        </PopupCard>
      </View>
    </Popup>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 24, padding: 24, width: '100%', maxWidth: 400 },
  title: { fontSize: 18, lineHeight: 24, fontFamily: Fonts.poppinsBold, color: '#111827' },
  subtitle: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppins, color: '#6B7280', marginTop: 4 },
  chip: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  chipOn: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  chipText: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.poppinsSemiBold, color: '#374151' },
  chipTextOn: { color: '#EF4444' },
  otherInput: {
    marginTop: 8, borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 14, padding: 12, minHeight: 70,
    textAlignVertical: 'top', fontFamily: Fonts.poppins, fontSize: 14, color: '#111827',
  },
  secondaryBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center' },
  secondaryBtnText: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: '#374151' },
  primaryBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: '#EF4444', alignItems: 'center' },
  primaryBtnText: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: '#fff' },
});
