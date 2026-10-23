import { useAppAlert } from '@/components/app-alert';
import { MemberPicker } from '@/components/business/member-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { padBottom, useBottomInset } from '@/hooks/use-bottom-inset';
import { BusinessBoard, SkoFyApi, Team, TeamActiveJob, TeamOpenJob } from '@/services/api';
import { router, useFocusEffect } from 'expo-router';
import { Briefcase, ChevronLeft, Clock } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

const STAGE: Record<string, string> = {
  ACCEPTED: 'Booked', INSPECTING: 'Inspecting', INVOICE_PENDING: 'Quote sent', IN_PROGRESS: 'Working', DISPUTED: 'Under review',
};
const when = (iso: string | null) => iso
  ? new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : 'As soon as possible';

// The business's jobs, for its owner and dispatchers (docs/BUSINESS_PROVIDERS_DESIGN.md
// §3): open jobs that reached anyone on the team — apply as the business,
// naming who'd do it — and jobs under way, which can go to another member
// until someone sets off. Each job then runs in the assigned member's app.
export default function BusinessJobsScreen() {
  const bottomInset = useBottomInset();
  const appAlert = useAppAlert();
  const [board, setBoard] = useState<BusinessBoard | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [applying, setApplying] = useState<TeamOpenJob | null>(null);
  const [assigning, setAssigning] = useState<TeamActiveJob | null>(null);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, t] = await Promise.all([SkoFyApi.business.board(), SkoFyApi.business.team()]);
      setBoard(b);
      setTeam(t);
    } catch (err: any) {
      appAlert.show('error', 'Could not load', err?.message ?? 'Please try again.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const close = () => { setApplying(null); setAssigning(null); setWorkerId(null); setMessage(''); };

  const submit = async () => {
    if (!workerId) return;
    setBusy(true);
    try {
      const result = applying
        ? await SkoFyApi.business.applyForJob(applying.job_id, workerId, message.trim() || undefined)
        : await SkoFyApi.business.assignJob(assigning!.job_id, workerId);
      appAlert.show('success', applying ? 'Applied' : 'Done', applying ? 'The customer sees your business and who would do it.' : result.message);
      close();
      load();
    } catch (err: any) {
      appAlert.show('error', 'Not done', err?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const setOff = (j: TeamActiveJob) => !!(j.navigation_started_at || j.arrived_at || j.checked_in_at);

  return (
    <ThemedView style={s.container}>
      <StatusBar barStyle="dark-content" />
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <ChevronLeft size={24} color="#111827" />
        </TouchableOpacity>
        <ThemedText style={[s.headerTitle, { flex: 1 }]}>Team jobs</ThemedText>
        <TouchableOpacity onPress={() => router.push('/business-map' as any)}>
          <ThemedText style={s.link}>Team map</ThemedText>
        </TouchableOpacity>
      </View>
      {!board || !team ? <ActivityIndicator style={{ marginTop: 40 }} color="#111827" /> : (
        <ScrollView contentContainerStyle={padBottom([s.body, { paddingBottom: 32 }], bottomInset)} keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>

          {(applying || assigning) && (
            <View style={[s.card, s.cardFocus]}>
              <ThemedText style={s.cardTitle}>{applying ? `Apply for “${applying.title}”` : `Give “${assigning!.title}” to…`}</ThemedText>
              <ThemedText style={s.muted}>{applying ? 'Who would do it?' : "Only until someone sets off — then it's theirs to finish."}</ThemedText>
              <MemberPicker members={team.members} selectedId={workerId} onSelect={(m) => setWorkerId(m.provider_id)}
                preferredIds={applying?.reached_member_ids} excludeId={assigning?.worker_id} />
              {applying && (
                <TextInput style={s.input} value={message} onChangeText={setMessage} multiline maxLength={1000}
                  placeholder="A note for the customer (optional)" placeholderTextColor="#9CA3AF" />
              )}
              <View style={s.row}>
                <TouchableOpacity style={s.secondary} onPress={close} disabled={busy}>
                  <ThemedText style={s.secondaryText}>Cancel</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={[s.primary, !workerId && s.dim]} onPress={submit} disabled={!workerId || busy}>
                  {busy ? <ActivityIndicator color="#111827" /> : <ThemedText style={s.primaryText}>{applying ? 'Apply' : 'Give it to them'}</ThemedText>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <ThemedText style={s.section}>Under way</ThemedText>
          {board.active.length === 0 && <ThemedText style={s.muted}>No jobs under way.</ThemedText>}
          {board.active.map((j) => (
            <TouchableOpacity key={j.job_id} style={s.card} activeOpacity={0.8}
              onPress={() => router.push({ pathname: '/business-job', params: { jobId: j.job_id } } as any)}>
              <View style={s.row}><Briefcase size={16} color="#111827" /><ThemedText style={[s.cardTitle, { flex: 1 }]}>{j.title}</ThemedText>
                <ThemedText style={s.badge}>{STAGE[j.status] ?? j.status}</ThemedText></View>
              <ThemedText style={s.muted}>{j.customer_name ?? 'Customer'} · {when(j.scheduled_at)}</ThemedText>
              <ThemedText style={s.item}>{j.worker_name ?? 'Unassigned'}{setOff(j) ? ' — on it' : ''}</ThemedText>
              {j.status === 'ACCEPTED' && !setOff(j) && (
                <TouchableOpacity onPress={() => { close(); setAssigning(j); }}><ThemedText style={s.link}>Give to someone else</ThemedText></TouchableOpacity>
              )}
              <ThemedText style={s.muted}>Steps and conversation ›</ThemedText>
            </TouchableOpacity>
          ))}

          <ThemedText style={s.section}>Open jobs for your team</ThemedText>
          {board.open.length === 0 && <ThemedText style={s.muted}>Nothing new right now. Jobs that reach anyone on your team show here.</ThemedText>}
          {board.open.map((j) => (
            <View key={j.job_id} style={s.card}>
              <ThemedText style={s.cardTitle}>{j.title}</ThemedText>
              <ThemedText style={s.muted} numberOfLines={2}>{j.description}</ThemedText>
              <View style={s.row}><Clock size={14} color="#6B7280" /><ThemedText style={s.muted}>{when(j.scheduled_at)}</ThemedText></View>
              <View style={s.row}>
                <TouchableOpacity style={s.secondary} onPress={() => router.push({ pathname: '/job-details', params: { id: j.job_id } } as any)}>
                  <ThemedText style={s.secondaryText}>Details</ThemedText>
                </TouchableOpacity>
                {j.applied ? (
                  <ThemedText style={[s.item, { flex: 1, textAlign: 'center' }]}>Applied ✓</ThemedText>
                ) : (
                  <TouchableOpacity style={s.primary} onPress={() => { close(); setApplying(j); }}>
                    <ThemedText style={s.primaryText}>Apply as the business</ThemedText>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
      {appAlert.element}
    </ThemedView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  headerTitle: { fontSize: 18, lineHeight: 24, fontFamily: Fonts.poppinsBold, color: '#111827' },
  body: { paddingHorizontal: 16, gap: 10 },
  section: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: '#374151', marginTop: 8 },
  card: { padding: 14, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', gap: 6 },
  cardFocus: { borderColor: '#FDE68A' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: '#111827' },
  item: { fontSize: 13.5, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
  muted: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppins, color: '#6B7280' },
  badge: { fontSize: 11.5, lineHeight: 16, fontFamily: Fonts.poppinsBold, color: '#92400E' },
  link: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: '#2563EB' },
  input: { minHeight: 60, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, fontSize: 14, fontFamily: Fonts.poppins, color: '#111827', backgroundColor: '#F9FAFB', textAlignVertical: 'top' },
  primary: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#FFCE48' },
  primaryText: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppinsBold, color: '#111827' },
  secondary: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#F3F4F6' },
  secondaryText: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: '#374151' },
  dim: { opacity: 0.5 },
});
