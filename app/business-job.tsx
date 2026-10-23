import { useAppAlert } from '@/components/app-alert';
import { Badge, C, jobStage, Monogram, Row, Section, u } from '@/components/business/ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { BusinessJobDetail, SkoFyApi } from '@/services/api';
import { router, useLocalSearchParams } from 'expo-router';
import { Calendar, Check, ChevronLeft, Eye, Map as MapIcon, MapPin, Send, User } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

const POLL_MS = 8000;

// The step names the server records (app/domain/job_policy.py Step), in words.
const STEP_WORDS: Record<string, string> = {
  TRACK_EN_ROUTE: 'Set off', ARRIVAL_CODE: 'Arrived and checked in', CHECK_IN_CODE: 'Checked in',
  INSPECT: 'Inspected', QUOTE: 'Quote paid', PAY_UPFRONT: 'Booked and paid', PICKUP_PROOF: 'Picked up',
  HANDOVER_PHOTOS: 'Hand-over photos', HANDBACK_CODE: 'Handed back', COMPLETE: 'Completed', RATE_BOTH_WAYS: 'Rated',
};
const time = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

interface Message { id: string; sender_id: string; message: string; message_type: string; created_at: string }

// One of the business's jobs for its owner and dispatchers
// (docs/BUSINESS_PROVIDERS_DESIGN.md §4): who's on it, each step as it
// happened, and the job's conversation — read it, and write to the customer,
// who's told the business can see it. Refreshes itself.
export default function BusinessJobScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const bottomInset = useBottomInset();
  const appAlert = useAppAlert();
  const [job, setJob] = useState<BusinessJobDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!jobId) return;
    const [detail, chat] = await Promise.all([
      SkoFyApi.business.job(jobId).catch(() => null),
      SkoFyApi.chat.getMessages(jobId).catch(() => null),
    ]);
    if (detail) setJob(detail);
    if (Array.isArray(chat)) setMessages(chat as Message[]);
  }, [jobId]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const send = async () => {
    if (!jobId || !draft.trim()) return;
    setSending(true);
    try {
      await SkoFyApi.chat.send(jobId, draft.trim());
      setDraft('');
      load();
    } catch (err: any) {
      appAlert.show('error', 'Not sent', err?.message ?? 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  const side = (m: Message): 'customer' | 'worker' | 'team' =>
    m.sender_id === job?.customer_id ? 'customer' : m.sender_id === job?.worker_id ? 'worker' : 'team';
  const who = (m: Message) => ({ customer: job?.customer_name ?? 'Customer', worker: job?.worker_name ?? 'Team member', team: 'Your team' })[side(m)];
  const setOff = !!job?.timeline.some((e) => e.step === 'TRACK_EN_ROUTE');
  const live = job && ['ACCEPTED', 'INSPECTING', 'INVOICE_PENDING', 'IN_PROGRESS'].includes(job.status);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ThemedView style={s.container}>
        <StatusBar barStyle="dark-content" />
        <View style={s.header}>
          <TouchableOpacity style={s.back} onPress={() => router.back()}>
            <ChevronLeft size={22} color={C.ink} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <ThemedText style={s.headerTitle} numberOfLines={1}>{job?.title ?? 'Job'}</ThemedText>
          </View>
          {job && <Badge {...jobStage(job.status, setOff)} />}
        </View>

        {!job ? <ActivityIndicator style={{ marginTop: 40 }} color={C.ink} /> : (
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            <View style={[u.card, { gap: 0, paddingVertical: 4 }]}>
              <Row icon={<Monogram name={job.worker_name ?? '?'} size={38} tone={job.worker_name ? 'brand' : 'neutral'} />}
                title={job.worker_name ?? 'Not assigned yet'} detail="Doing this job"
                right={live && setOff ? (
                  <TouchableOpacity style={s.chip} onPress={() => router.push('/business-map' as any)}>
                    <MapIcon size={14} color={C.ink} /><ThemedText style={s.chipText}>Live</ThemedText>
                  </TouchableOpacity>
                ) : undefined} />
              <Row icon={<User size={18} color={C.ink} />} title={job.customer_name ?? 'Customer'} detail="Customer" />
              {job.address && <Row icon={<MapPin size={18} color={C.ink} />} title={job.address} detail="Where" />}
              <Row last icon={<Calendar size={18} color={C.ink} />} title={job.scheduled_at ? time(job.scheduled_at) : 'As soon as possible'} detail="When" />
            </View>

            <Section title="Progress">
              {job.timeline.length === 0 ? (
                <ThemedText style={u.muted}>Nothing yet — each step shows here as it happens.</ThemedText>
              ) : job.timeline.map((e, i) => {
                const latest = i === job.timeline.length - 1;
                return (
                  <View key={`${e.step}-${i}`} style={s.step}>
                    <View style={s.rail}>
                      <View style={[s.dot, latest && s.dotLatest]}><Check size={12} color="#FFFFFF" strokeWidth={3} /></View>
                      {!latest && <View style={s.line} />}
                    </View>
                    <View style={{ flex: 1, paddingBottom: latest ? 0 : 14 }}>
                      <ThemedText style={[u.label, latest && { color: C.ink }]}>{STEP_WORDS[e.step] ?? e.step}</ThemedText>
                      <ThemedText style={u.muted}>
                        {e.actor_name ?? (e.actor_role === 'customer' ? 'Customer' : 'Team member')} · {time(e.created_at)}
                      </ThemedText>
                    </View>
                  </View>
                );
              })}
            </Section>

            <Section title="Conversation">
              <View style={s.notice}>
                <Eye size={14} color={C.muted} />
                <ThemedText style={[u.muted, { flex: 1 }]}>The customer is told your business can see this chat.</ThemedText>
              </View>
              {messages.length === 0 && <ThemedText style={[u.muted, { textAlign: 'center', paddingVertical: 8 }]}>No messages yet.</ThemedText>}
              {[...messages].reverse().slice(-30).map((m) => {
                const from = side(m);
                return (
                  <View key={m.id} style={[s.bubbleWrap, from === 'team' && { alignItems: 'flex-end' }]}>
                    <ThemedText style={s.meta}>{who(m)} · {clock(m.created_at)}</ThemedText>
                    <View style={[s.bubble, from === 'team' ? s.bubbleTeam : from === 'worker' ? s.bubbleWorker : s.bubbleCustomer]}>
                      <ThemedText style={s.bubbleText}>
                        {m.message_type === 'IMAGE' ? 'Sent a photo' : m.message}
                      </ThemedText>
                    </View>
                  </View>
                );
              })}
            </Section>
          </ScrollView>
        )}

        {job && (
          <View style={[s.compose, { paddingBottom: Math.max(bottomInset, 12) }]}>
            <TextInput style={s.input} value={draft} onChangeText={setDraft} placeholder="Write to the customer…"
              placeholderTextColor={C.faint} multiline maxLength={1000} />
            <TouchableOpacity style={[s.send, !draft.trim() && { opacity: 0.45 }]} onPress={send} disabled={sending || !draft.trim()}>
              {sending ? <ActivityIndicator color={C.ink} /> : <Send size={18} color={C.ink} />}
            </TouchableOpacity>
          </View>
        )}
        {appAlert.element}
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12 },
  back: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  headerTitle: { fontSize: 19, lineHeight: 26, fontFamily: Fonts.poppinsBold, color: C.ink },
  body: { paddingHorizontal: 16, paddingBottom: 24, gap: 20 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: C.brandSoft },
  chipText: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.poppinsSemiBold, color: C.ink },
  step: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 22 },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#A7D8C3' },
  dotLatest: { backgroundColor: C.ok },
  line: { flex: 1, width: 2, backgroundColor: '#D7EDE3', marginVertical: 2 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: C.bg },
  bubbleWrap: { gap: 3, alignItems: 'flex-start' },
  meta: { fontSize: 11, lineHeight: 15, fontFamily: Fonts.poppinsSemiBold, color: C.faint, paddingHorizontal: 4 },
  bubble: { maxWidth: '85%', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 16 },
  bubbleCustomer: { backgroundColor: '#F1F5F9', borderTopLeftRadius: 4 },
  bubbleWorker: { backgroundColor: C.infoSoft, borderTopLeftRadius: 4 },
  bubbleTeam: { backgroundColor: C.brandSoft, borderTopRightRadius: 4 },
  bubbleText: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.poppins, color: C.ink },
  compose: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingTop: 10,
    backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line,
  },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11,
    fontSize: 14.5, fontFamily: Fonts.poppins, color: C.ink, backgroundColor: C.bg,
  },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brand },
});
