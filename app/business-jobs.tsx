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
import { ActivityIndicator, RefreshControl, StatusBar, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';
import { Badge, Button, C, jobStage, Monogram, Row, Section, u } from '@/components/business/ui';

const when = (iso: string | null) => iso
  ? new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : 'As soon as possible';

// The business's jobs, for its owner and dispatchers (docs/BUSINESS_PROVIDERS_DESIGN.md
// §3): open jobs that reached anyone on the team — apply as the business,
// naming who'd do it — and jobs under way, which can go to another member
// until someone sets off. Each job then runs in the assigned member's app.
// Opened with a jobId (job details' "Apply as", a team-job alert), it goes
// straight to choosing who'd do that job.
export default function BusinessJobsScreen() {
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();
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
  const scroll = useRef<KeyboardAwareScrollViewRef>(null);

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
        <KeyboardAwareScrollView bottomOffset={24} ref={scroll} contentContainerStyle={padBottom([s.body, { paddingBottom: 40 }], bottomInset)} keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>

          {(applying || assigning) && (
            <Section title={applying ? 'Apply as your business' : 'Give to someone else'}>
              <View style={{ gap: 2 }}>
                <ThemedText style={s.focusTitle}>{applying ? applying.title : assigning!.title}</ThemedText>
                <ThemedText style={u.muted}>{applying ? 'Who would do it? The customer sees your business and them.' : "Only until someone sets off — then it's theirs to finish."}</ThemedText>
              </View>
              <MemberPicker members={team.members} selectedId={workerId} onSelect={(m) => setWorkerId(m.provider_id)}
                preferredIds={applying?.reached_member_ids} excludeId={assigning?.worker_id} />
              {applying && (
                <TextInput style={[u.input, { minHeight: 72, textAlignVertical: 'top' }]} value={message} onChangeText={setMessage} multiline maxLength={1000}
                  placeholder="A note for the customer (optional)" placeholderTextColor={C.faint} />
              )}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button kind="secondary" label="Cancel" onPress={close} disabled={busy} style={{ flex: 1 }} />
                <Button label={applying ? 'Apply' : 'Give it to them'} onPress={submit} busy={busy} disabled={!workerId} style={{ flex: 1 }} />
              </View>
            </Section>
          )}

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
                  <Badge label="Applied" tone="ok" icon={<Check size={12} color={C.ok} />} />
                ) : (
                  <Button small label="Apply as the business" style={{ alignSelf: 'flex-start' }}
                    onPress={() => { close(); setApplying(j); scroll.current?.scrollTo({ y: 0, animated: true }); }} />
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
                        onPress={() => { close(); setAssigning(j); scroll.current?.scrollTo({ y: 0, animated: true }); }} />
                    </View>
                  )}
                </View>
              );
            })}
          </Section>
        </KeyboardAwareScrollView>
      )}
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
});
