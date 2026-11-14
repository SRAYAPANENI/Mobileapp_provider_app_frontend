import { useAppAlert } from '@/components/app-alert';
import { MemberPicker } from '@/components/business/member-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { padBottom, useBottomInset } from '@/hooks/use-bottom-inset';
import { BusinessBoard, SkoFyApi, Team, TeamActiveJob, TeamOpenJob } from '@/services/api';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Briefcase, Check, ChevronLeft, Clock, Inbox, Map as MapIcon } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView, KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Badge, Button, C, jobStage, Monogram, Row, Section, u } from '@/components/business/ui';
import { usePullRefresh } from '@/hooks/use-pull-refresh';

import { Popup, PopupCard } from '@/components/popup';
const when = (iso: string | null) => iso
  ? new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : 'As soon as possible';

// The business's jobs, for its owner and dispatchers (docs/BUSINESS_PROVIDERS_DESIGN.md
// §3): open jobs that reached anyone on the team — apply as the business,
// naming who'd do it — and jobs under way, which can go to another member
// until someone sets off. Each job then runs in the assigned member's app.
// Opened with a jobId (job details' "Apply as", a team-job alert), it goes
// straight to choosing who'd do that job.
/** When a team job's work happens: its start, or when it was posted. */
function workTimeOf(job: { scheduled_at: string | null; created_at?: string } | null): Date | null {
  const iso = job?.scheduled_at ?? job?.created_at;
  return iso ? new Date(iso) : null;
}

export default function BusinessJobsScreen() {
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();
  const bottomInset = useBottomInset();
  const appAlert = useAppAlert();
  const [board, setBoard] = useState<BusinessBoard | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
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
  const refreshControl = usePullRefresh(load);

  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!board || !jobId || opened.current === jobId) return;
    opened.current = jobId;
    const job = board.open.find((j) => j.job_id === jobId);
    if (job && !job.applied) setApplying(job);
    else if (!board.active.some((j) => j.job_id === jobId)) {
      // A stale alert: the job closed, or was taken, since it was sent.
      appAlert.show('info', job ? 'Already applied' : 'No longer open',
        job ? 'Your business has applied for this job — the customer chooses next.' : "This job isn't open for your team any more.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, jobId]);

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

  // Taking back the business's application — final, as for anyone.
  const withdraw = (j: TeamOpenJob) => appAlert.show('warning', 'Withdraw your business’s application?',
    'The customer won’t see it any more, and your business can’t apply for this job again.', [
      { text: 'Keep it', variant: 'secondary' },
      { text: 'Withdraw', variant: 'destructive', onPress: async () => {
        try {
          const { message } = await SkoFyApi.business.withdrawApplication(j.job_id);
          appAlert.show('success', 'Withdrawn', message);
          load();
        } catch (err: any) {
          appAlert.show('error', 'Not withdrawn', err?.message ?? 'Please try again.');
        }
      } },
    ]);

  return (
    <ThemedView style={s.container}>
      <StatusBar barStyle="dark-content" />
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <ChevronLeft size={22} color={C.ink} />
        </TouchableOpacity>
        <ThemedText style={[s.headerTitle, { flex: 1 }]}>Team jobs</ThemedText>
        <Button small kind="secondary" label="Map" icon={<MapIcon size={15} color={C.ink} />} onPress={() => router.push('/business-map' as any)} />
      </View>
      {!board || !team ? <ActivityIndicator style={{ marginTop: 40 }} color={C.ink} /> : (
        <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={padBottom([s.body, { paddingBottom: 40 }], bottomInset)} keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}>

          <Section title={`Open for your team · ${board.open.length}`} flush>
            {board.open.length === 0 && (
              <Row last icon={<Inbox size={18} color={C.muted} />} title="Nothing new right now" detail="Jobs that reach anyone on your team show here" />
            )}
            {board.open.map((j, i) => (
              <View key={j.job_id} style={[s.job, i < board.open.length - 1 && s.jobLine]}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => router.push({ pathname: '/job-details', params: { id: j.job_id } } as any)} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ThemedText style={[s.jobTitle, { flex: 1 }]} numberOfLines={1}>{j.title}</ThemedText>
                    {(j.urgency === 'EMERGENCY' || j.urgency === 'HIGH') && <Badge label={j.urgency === 'EMERGENCY' ? 'Emergency' : 'Urgent'} tone="bad" />}
                  </View>
                  <ThemedText style={u.muted} numberOfLines={2}>{j.description}</ThemedText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Clock size={13} color={C.muted} /><ThemedText style={u.muted}>{when(j.scheduled_at)}</ThemedText>
                    {j.reached_member_ids.length > 0 && <ThemedText style={u.muted}>· {j.reached_member_ids.length} matched on your team</ThemedText>}
                  </View>
                </TouchableOpacity>
                {j.applied ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Badge label="Applied" tone="ok" icon={<Check size={12} color={C.ok} />} />
                    <Button small kind="secondary" label="Withdraw" onPress={() => withdraw(j)} />
                  </View>
                ) : j.withdrawn ? (
                  <Badge label="Withdrawn" tone="neutral" />
                ) : (
                  <Button small label="Apply as the business" style={{ alignSelf: 'flex-start' }}
                    onPress={() => { close(); setApplying(j); }} />
                )}
              </View>
            ))}
          </Section>

          <Section title={`Under way · ${board.active.length}`} flush>
            {board.active.length === 0 && (
              <Row last icon={<Briefcase size={18} color={C.muted} />} title="No jobs under way" detail="Jobs a customer hires your team for show here" />
            )}
            {board.active.map((j, i) => {
              const canMove = j.status === 'ACCEPTED' && !setOff(j);
              const lastOne = i === board.active.length - 1;
              return (
                <View key={j.job_id} style={!lastOne && s.jobLine}>
                  <Row last chevron onPress={() => router.push({ pathname: '/business-job', params: { jobId: j.job_id } } as any)}
                    icon={<Monogram name={j.worker_name ?? '?'} size={38} tone={j.worker_name ? 'brand' : 'neutral'} />}
                    title={j.title}
                    detail={
                      <View style={{ gap: 4 }}>
                        <ThemedText style={u.muted} numberOfLines={1}>
                          {j.worker_name ?? 'Unassigned'} · {j.customer_name ?? 'Customer'} · {when(j.scheduled_at)}
                        </ThemedText>
                        <Badge {...jobStage(j.status, setOff(j))} />
                      </View>
                    } />
                  {canMove && (
                    <View style={{ paddingLeft: 50, paddingBottom: 12 }}>
                      <Button small kind="secondary" label="Give to someone else" style={{ alignSelf: 'flex-start' }}
                        onPress={() => { close(); setAssigning(j); }} />
                    </View>
                  )}
                </View>
              );
            })}
          </Section>
        </KeyboardAwareScrollView>
      )}

      {/* Apply / reassign — a popup from the bottom rather than an inline
          form, so tapping "Apply as the business" (or "Give to someone
          else") doesn't depend on the list having scrolled back to the top
          to see it. */}
      <Popup closeOn={busy ? 'none' : 'back'} visible={!!(applying || assigning)} transparent animationType="slide" onClose={close}>
        <KeyboardAvoidingView style={s.sheetOverlay} behavior="padding">
          <PopupCard style={s.sheet}>
            <View style={s.sheetHandle} />
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={padBottom(s.sheetContent, bottomInset)}>
              <ThemedText style={u.sectionTitle}>{applying ? 'Apply as your business' : 'Give to someone else'}</ThemedText>
              <ThemedText style={s.focusTitle}>{applying ? applying.title : assigning?.title}</ThemedText>
              <ThemedText style={u.muted}>{applying ? 'Who would do it? The customer sees your business and them.' : "Only until someone sets off — then it's theirs to finish."}</ThemedText>
              <MemberPicker members={team?.members ?? []} selectedId={workerId} onSelect={(m) => setWorkerId(m.provider_id)}
                preferredIds={applying?.reached_member_ids} excludeId={assigning?.worker_id}
                workTime={workTimeOf(applying ?? assigning)} />
              {applying && (
                <TextInput style={[u.input, { minHeight: 72, textAlignVertical: 'top' }]} value={message} onChangeText={setMessage} multiline maxLength={1000}
                  placeholder="A note for the customer (optional)" placeholderTextColor={C.faint} />
              )}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button kind="secondary" label="Cancel" onPress={close} disabled={busy} style={{ flex: 1 }} />
                <Button label={applying ? 'Apply' : 'Give it to them'} onPress={submit} busy={busy} disabled={!workerId} style={{ flex: 1 }} />
              </View>
            </ScrollView>
          </PopupCard>
        </KeyboardAvoidingView>
      </Popup>

      {appAlert.element}
    </ThemedView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12 },
  back: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  headerTitle: { fontSize: 22, lineHeight: 30, fontFamily: Fonts.poppinsBold, color: C.ink },
  body: { paddingHorizontal: 16, gap: 20 },
  focusTitle: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.poppinsBold, color: C.ink },
  job: { paddingVertical: 14, gap: 10 },
  jobLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  jobTitle: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: C.ink },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
  sheetHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: C.line, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16, gap: 12 },
});
