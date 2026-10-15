import { useAppAlert } from '@/components/app-alert';
import { TextInput } from '@/components/scaled-text';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SkoFyApi } from '@/services/api';
import { AlertTriangle } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

interface Props {
  jobId: string | null;
  visible: boolean;
  onClose: () => void;
  onFiled?: () => void;
}

// Filing a dispute on a job — used from the Jobs tab and the job sheet. The
// server decides when a job can be disputed (job_service.dispute_job).
export function ReportIssueModal({ jobId, visible, onClose, onFiled }: Props) {
  const colorScheme = useColorScheme();
  const t = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  const styles = useMemo(() => makeStyles(t), [t]);
  const appAlert = useAppAlert();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (visible) setReason(''); }, [visible]);

  const submit = async () => {
    // Matches the backend's DisputeJobRequest validator (min 5 chars).
    if (!jobId || reason.trim().length < 5) {
      appAlert.show('info', 'Description Required', 'Please describe the issue in at least 5 characters.');
      return;
    }
    setSubmitting(true);
    try {
      await SkoFyApi.jobs.disputeJob(jobId, reason.trim());
      onClose();
      onFiled?.();
      appAlert.show('success', 'Dispute Filed', 'Our team will review this and get back to you within 24 hours.');
    } catch (err: any) {
      appAlert.show('error', 'Dispute Failed', err?.message ?? 'Failed to file dispute.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <KeyboardAvoidingView style={styles.overlay} behavior="padding" automaticOffset>
          <View style={[styles.sheet, { backgroundColor: t.background }]}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <AlertTriangle size={20} color="#EF4444" />
              <ThemedText style={styles.title}>File a Dispute</ThemedText>
            </View>
            <ThemedText style={styles.desc}>
              Describe the issue clearly. Our team will review and respond within 24 hours.
            </ThemedText>
            <TextInput
              style={[styles.input, { color: t.text, borderColor: t.border ?? '#E5E7EB' }]}
              placeholder="Describe the problem (e.g. customer not responding, unsafe conditions)..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={4}
              value={reason}
              onChangeText={setReason}
              textAlignVertical="top"
            />
            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
                {submitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <ThemedText style={styles.submitBtnText}>Submit Dispute</ThemedText>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {appAlert.element}
    </>
  );
}

function makeStyles(t: typeof Colors.light) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 20 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    title: { fontSize: 18, lineHeight: 22, fontFamily: Fonts.poppinsBold, color: t.textPrimary },
    desc: { fontSize: 13, fontFamily: Fonts.poppins, color: t.textSecondary, lineHeight: 19, marginBottom: 16 },
    input: { borderWidth: 1.5, borderRadius: 14, padding: 14, minHeight: 110, fontFamily: Fonts.poppins, fontSize: 14, lineHeight: 18, marginBottom: 20 },
    actions: { flexDirection: 'row', gap: 12 },
    cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, borderColor: t.border, alignItems: 'center' },
    cancelBtnText: { fontSize: 14, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: t.textSecondary },
    submitBtn: { flex: 2, paddingVertical: 13, borderRadius: 14, backgroundColor: '#EF4444', alignItems: 'center' },
    submitBtnText: { fontSize: 14, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: '#fff' },
  });
}
