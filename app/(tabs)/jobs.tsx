import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Modal,
  TextInput,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SkoFyApi } from '@/services/api';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useAppAlert } from '@/components/app-alert';
import {
  Briefcase,
  CheckCircle2,
  Play,
  IndianRupee,
  Calendar,
  AlertTriangle,
} from 'lucide-react-native';

interface ProviderJob {
  job_id: string;
  title: string;
  description: string;
  urgency: string;
  job_status: string;
  budget_min: number | null;
  budget_max: number | null;
  inspection_fee: number;
  final_amount: number | null;
  scheduled_at: string | null;
  application_id: string | null;
  app_status: string | null;
  proposed_fee: number | null;
  message: string | null;
  created_at: string;
  cancellation_reason?: string | null;
}

function urgencyColor(u: string): string {
  if (u === 'EMERGENCY') return '#DC2626';
  if (u === 'HIGH') return '#EF4444';
  if (u === 'MEDIUM') return '#F59E0B';
  return '#6B7280';
}

function statusInfo(s: string): { label: string; color: string } {
  switch (s) {
    case 'ACCEPTED':    return { label: 'Hired', color: '#3B82F6' };
    case 'INSPECTING':      return { label: 'Inspecting', color: '#8B5CF6' };
    case 'INVOICE_PENDING': return { label: 'Invoice Sent', color: '#F59E0B' };
    case 'IN_PROGRESS': return { label: 'In Progress', color: '#6366F1' };
    case 'COMPLETED':   return { label: 'Completed', color: '#10B981' };
    case 'CANCELLED':   return { label: 'Cancelled', color: '#EF4444' };
    case 'DISPUTED':    return { label: 'Disputed', color: '#DC2626' };
    default:            return { label: s, color: '#9CA3AF' };
  }
}

function formatBudget(job: ProviderJob): string {
  // Bidding is retired — proposed_fee is only ever a leftover from a
  // pre-migration application. The real, settled price is final_amount,
  // set once a post-inspection invoice (or its counter) is paid.
  if (job.final_amount) return `$${job.final_amount}`;
  if (job.proposed_fee) return `$${job.proposed_fee} (your bid)`;
  if (job.budget_min && job.budget_max) return `$${job.budget_min} – $${job.budget_max}`;
  if (job.budget_min) return `From $${job.budget_min}`;
  if (job.budget_max) return `Up to $${job.budget_max}`;
  if (job.inspection_fee > 0) return `$${job.inspection_fee} inspection`;
  return 'Negotiable';
}

function JobCard({
  job,
  index,
  onAction,
}: {
  job: ProviderJob;
  index: number;
  onAction: (jobId: string) => void;
}) {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const styles = React.useMemo(() => makeStyles(themeColors), [colorScheme]);
  const { label, color } = statusInfo(job.job_status);
  const isAccepted = job.job_status === 'ACCEPTED';
  const isInProgress = job.job_status === 'IN_PROGRESS';
  // INSPECTING/INVOICE_PENDING are active too (bidding is retired — a hired
  // provider now passes through them before IN_PROGRESS) — excluded here so
  // they don't fall into "history" and show a stale bid block. Their actual
  // actions (OTP entry, invoice form, counter-response) live in the Home
  // tab's manage-service modal, not this simpler list card.
  const isMidFlow = job.job_status === 'INSPECTING' || job.job_status === 'INVOICE_PENDING';
  const isHistory = !isAccepted && !isInProgress && !isMidFlow;

  const scheduledDate = job.scheduled_at
    ? new Date(job.scheduled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 70).springify()}
      style={[styles.card, { backgroundColor: themeColors.background }]}
    >
      {/* Top badges */}
      <View style={styles.badgeRow}>
        <View style={[styles.urgencyBadge, { backgroundColor: urgencyColor(job.urgency) + '22' }]}>
          <ThemedText style={[styles.urgencyText, { color: urgencyColor(job.urgency) }]}>
            {job.urgency}
          </ThemedText>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: color + '22' }]}>
          <ThemedText style={[styles.statusText, { color }]}>{label}</ThemedText>
        </View>
      </View>

      {/* Title + description */}
      <ThemedText style={styles.cardTitle} numberOfLines={1}>{job.title}</ThemedText>
      <ThemedText style={styles.cardDesc} numberOfLines={2}>{job.description}</ThemedText>

      {job.job_status === 'CANCELLED' && job.cancellation_reason && (
        <View style={{ backgroundColor: '#FEF2F2', borderRadius: 8, padding: 8, marginTop: 6 }}>
          <ThemedText style={{ fontSize: 12, color: '#B91C1C', fontFamily: Fonts.poppins }}>
            {job.cancellation_reason}
          </ThemedText>
        </View>
      )}

      {/* Meta row */}
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <IndianRupee size={13} color="#059669" />
          <ThemedText style={styles.budgetText}>{formatBudget(job)}</ThemedText>
        </View>
        {scheduledDate && (
          <View style={styles.metaItem}>
            <Calendar size={13} color="#9CA3AF" />
            <ThemedText style={styles.dateText}>{scheduledDate}</ThemedText>
          </View>
        )}
      </View>

      {/* History: show your bid amount + message */}
      {isHistory && job.proposed_fee != null && (
        <View style={styles.bidInfo}>
          <ThemedText style={styles.bidInfoLabel}>Your bid: </ThemedText>
          <ThemedText style={styles.bidInfoValue}>${job.proposed_fee}</ThemedText>
          {job.message ? (
            <ThemedText style={styles.bidInfoMsg} numberOfLines={1}> · "{job.message}"</ThemedText>
          ) : null}
        </View>
      )}

      {/* Action buttons for active jobs */}
      {(isAccepted || isInProgress) && (
        <View style={styles.actionRow}>
          {isAccepted && (
            // Starting a job now goes through an on-site inspection gated by
            // an OTP the customer reads aloud — that flow lives in the
            // Service Room, not here. This used to call markStarted()
            // directly, which skipped the inspection fee, the OTP, and the
            // invoice entirely and jumped the job straight to IN_PROGRESS.
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#6366F1' }]}
              onPress={() => router.push({ pathname: '/(tabs)', params: { openServiceRoom: 'true', jobId: job.job_id.toString() } } as any)}
              activeOpacity={0.82}
            >
              <Play size={14} color="#fff" fill="#fff" />
              <ThemedText style={styles.actionBtnText}>Enter Service Room</ThemedText>
            </TouchableOpacity>
          )}
          {isInProgress && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
              onPress={() => onAction(job.job_id.toString())}
              activeOpacity={0.82}
            >
              <CheckCircle2 size={14} color="#fff" />
              <ThemedText style={styles.actionBtnText}>Mark Complete</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      )}
    </Animated.View>
  );
}

function EmptyState({ tab }: { tab: 'active' | 'history' }) {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const styles = React.useMemo(() => makeStyles(themeColors), [colorScheme]);
  return (
    <View style={styles.emptyWrap}>
      <Briefcase size={56} color="#D1D5DB" />
      <ThemedText style={styles.emptyTitle}>
        {tab === 'active' ? 'No active jobs' : 'No job history yet'}
      </ThemedText>
      <ThemedText style={styles.emptySub}>
        {tab === 'active'
          ? "Jobs you've been hired for will appear here. Check the dashboard for new opportunities."
          : 'Completed and cancelled jobs will be listed here.'}
      </ThemedText>
    </View>
  );
}

export default function JobsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const styles = React.useMemo(() => makeStyles(themeColors), [colorScheme]);
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [activeJobs, setActiveJobs] = useState<ProviderJob[]>([]);
  const [historyJobs, setHistoryJobs] = useState<ProviderJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Dispute modal state
  const [disputeModal, setDisputeModal] = useState(false);
  const [disputeJobId, setDisputeJobId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const appAlert = useAppAlert();
  const [isDisputing, setIsDisputing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [active, history] = await Promise.all([
        SkoFyApi.jobs.getActive().catch(() => []),
        SkoFyApi.jobs.getHistory().catch(() => []),
      ]);
      setActiveJobs(Array.isArray(active) ? active : []);
      setHistoryJobs(Array.isArray(history) ? history : []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Starting a job is handled entirely in the Service Room now (on-site
  // inspection gated by an OTP) — this only ever completes an already
  // IN_PROGRESS job.
  const handleAction = useCallback(
    (jobId: string) => {
      appAlert.show(
        'info',
        'Complete Job',
        'Are you sure you want to complete this job?',
        [
          { text: 'Cancel', variant: 'secondary' },
          {
            text: 'Complete',
            onPress: async () => {
              try {
                await SkoFyApi.jobs.markComplete(jobId);
                load();
              } catch (err: any) {
                appAlert.show('error', 'Action Failed', err?.message ?? 'Failed. Please try again.');
              }
            },
          },
        ]
      );
    },
    [load]
  );

  const openDispute = (jobId: string) => {
    setDisputeJobId(jobId);
    setDisputeReason('');
    setDisputeModal(true);
  };

  const submitDispute = async () => {
    if (!disputeJobId || !disputeReason.trim()) {
      appAlert.show('info', 'Description Required', 'Please describe the issue before submitting.');
      return;
    }
    setIsDisputing(true);
    try {
      await SkoFyApi.jobs.disputeJob(disputeJobId, disputeReason.trim());
      setDisputeModal(false);
      load();
      appAlert.show('success', 'Dispute Filed', 'Our team will review this and get back to you within 24 hours.');
    } catch (err: any) {
      appAlert.show('error', 'Dispute Failed', err?.message ?? 'Failed to file dispute.');
    } finally {
      setIsDisputing(false);
    }
  };

  const displayJobs = tab === 'active' ? activeJobs : historyJobs;

  if (loading) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#FFCE48" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: themeColors.background }]}>
        <ThemedText style={styles.headerTitle}>My Jobs</ThemedText>

        {/* Tab bar */}
        <View style={styles.tabBar}>
          {(['active', 'history'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
              onPress={() => setTab(t)}
              activeOpacity={0.75}
            >
              <ThemedText style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
                {t === 'active' ? 'Active' : 'History'}
              </ThemedText>
              {t === 'active' && activeJobs.length > 0 && (
                <View style={styles.tabCount}>
                  <ThemedText style={styles.tabCountText}>{activeJobs.length}</ThemedText>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={displayJobs}
        keyExtractor={item => item.job_id.toString()}
        renderItem={({ item, index }) => (
          <JobCard job={item} index={index} onAction={handleAction} />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            colors={['#FFCE48']}
            tintColor="#FFCE48"
          />
        }
        ListEmptyComponent={<EmptyState tab={tab} />}
      />

      {/* Dispute modal */}
      <Modal
        visible={disputeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setDisputeModal(false)}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding" automaticOffset>
          <View style={[styles.modalSheet, { backgroundColor: themeColors.background }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <AlertTriangle size={20} color="#EF4444" />
              <ThemedText style={styles.modalTitle}>File a Dispute</ThemedText>
            </View>
            <ThemedText style={styles.modalDesc}>
              Describe the issue clearly. Our team will review and respond within 24 hours.
            </ThemedText>
            <TextInput
              style={[styles.disputeInput, { color: themeColors.text, borderColor: themeColors.border ?? '#E5E7EB' }]}
              placeholder="Describe the problem (e.g. customer not responding, unsafe conditions)..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={4}
              value={disputeReason}
              onChangeText={setDisputeReason}
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setDisputeModal(false)}
              >
                <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, isDisputing && { opacity: 0.6 }]}
                onPress={submitDispute}
                disabled={isDisputing}
              >
                {isDisputing
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <ThemedText style={styles.submitBtnText}>Submit Dispute</ThemedText>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {appAlert.element}
    </ThemedView>
  );
}

function makeStyles(t: typeof Colors.light) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.surface },
    centered: { justifyContent: 'center', alignItems: 'center' },

    header: {
      paddingTop: Platform.OS === 'ios' ? 58 : 44,
      paddingHorizontal: 20,
      paddingBottom: 14,
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    headerTitle: {
      fontSize: 22, lineHeight: 28,
      fontFamily: Fonts.poppinsBold,
      color: t.textPrimary,
      marginBottom: 14,
    },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: t.inputFilled,
      borderRadius: 14,
      padding: 4,
      gap: 4,
    },
    tabBtn: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 10,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
    },
    tabBtnActive: {
      backgroundColor: t.card,
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    tabBtnText: { fontSize: 14, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: t.textMuted },
    tabBtnTextActive: { color: t.textPrimary },
    tabCount: {
      backgroundColor: '#FFCE48',
      borderRadius: 10,
      paddingHorizontal: 6,
      paddingVertical: 1,
      minWidth: 20,
      alignItems: 'center',
    },
    tabCountText: { fontSize: 11, lineHeight: 15, fontFamily: Fonts.poppinsBold, color: '#111827' },

    listContent: { padding: 16, paddingBottom: 30 },

    card: {
      borderRadius: 20,
      padding: 18,
      marginBottom: 14,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    urgencyBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
    urgencyText: { fontSize: 11, lineHeight: 15, fontFamily: Fonts.poppinsSemiBold },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
    statusText: { fontSize: 11, lineHeight: 15, fontFamily: Fonts.poppinsSemiBold },
    cardTitle: { fontSize: 16, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: t.textPrimary, marginBottom: 5 },
    cardDesc: { fontSize: 13, fontFamily: Fonts.poppins, color: t.textSecondary, lineHeight: 19 },

    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    budgetText: { fontSize: 13, lineHeight: 17, fontFamily: Fonts.poppinsSemiBold, color: '#059669' },
    dateText: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.poppins, color: t.textMuted },

    bidInfo: { flexDirection: 'row', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' },
    bidInfoLabel: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.poppins, color: t.textMuted },
    bidInfoValue: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.poppinsSemiBold, color: t.textSecondary },
    bidInfoMsg: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.poppins, color: t.textSecondary, flex: 1 },

    actionRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 14,
      borderTopWidth: 1,
      borderTopColor: t.borderSubtle,
      paddingTop: 14,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 11,
      borderRadius: 12,
    },
    actionBtnText: { fontSize: 13, lineHeight: 17, fontFamily: Fonts.poppinsBold, color: '#fff' },

    emptyWrap: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
    emptyTitle: { fontSize: 18, lineHeight: 22, fontFamily: Fonts.poppinsBold, color: t.textSecondary, marginTop: 20, textAlign: 'center' },
    emptySub: { fontSize: 13, fontFamily: Fonts.poppins, color: t.textMuted, marginTop: 8, textAlign: 'center', lineHeight: 20 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
    modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 20 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    modalTitle: { fontSize: 18, lineHeight: 22, fontFamily: Fonts.poppinsBold, color: t.textPrimary },
    modalDesc: { fontSize: 13, fontFamily: Fonts.poppins, color: t.textSecondary, lineHeight: 19, marginBottom: 16 },
    disputeInput: {
      borderWidth: 1.5,
      borderRadius: 14,
      padding: 14,
      minHeight: 110,
      fontFamily: Fonts.poppins,
      fontSize: 14, lineHeight: 18,
      marginBottom: 20,
    },
    modalActions: { flexDirection: 'row', gap: 12 },
    cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, borderColor: t.border, alignItems: 'center' },
    cancelBtnText: { fontSize: 14, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: t.textSecondary },
    submitBtn: { flex: 2, paddingVertical: 13, borderRadius: 14, backgroundColor: '#EF4444', alignItems: 'center' },
    submitBtnText: { fontSize: 14, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: '#fff' },
  });
}
