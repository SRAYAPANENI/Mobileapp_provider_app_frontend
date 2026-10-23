import { useAppAlert } from '@/components/app-alert';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { padBottom, useBottomInset } from '@/hooks/use-bottom-inset';
import { BusinessJobDetail, SkoFyApi } from '@/services/api';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Circle, Send } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

const POLL_MS = 8000;

// The step names the server records (app/domain/job_policy.py Step), in words.
const STEP_WORDS: Record<string, string> = {
  TRACK_EN_ROUTE: 'Set off', ARRIVAL_CODE: 'Arrived and checked in', CHECK_IN_CODE: 'Checked in',
  INSPECT: 'Inspected', QUOTE: 'Quote paid', PAY_UPFRONT: 'Booked and paid', PICKUP_PROOF: 'Picked up',
  HANDOVER_PHOTOS: 'Hand-over photos', HANDBACK_CODE: 'Handed back', COMPLETE: 'Completed', RATE_BOTH_WAYS: 'Rated',
};
const time = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

interface Message { id: string; sender_id: string; message: string; message_type: string; created_at: string }

// One of the business's jobs for its owner and dispatchers
// (docs/BUSINESS_PROVIDERS_DESIGN.md §4): each step as it happened, and the
// job's conversation — read it, and write to the customer, who's told the
// business can see it. Refreshes itself; the member and the customer chat live.
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

  const who = (m: Message) => m.sender_id === job?.customer_id ? (job?.customer_name ?? 'Customer')
    : m.sender_id === job?.worker_id ? (job?.worker_name ?? 'Team member') : 'Your team';

  return (
    <ThemedView style={s.container}>
      <StatusBar barStyle="dark-content" />
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <ChevronLeft size={24} color="#111827" />
        </TouchableOpacity>
        <ThemedText style={s.headerTitle} numberOfLines={1}>{job?.title ?? 'Job'}</ThemedText>
      </View>
      {!job ? <ActivityIndicator style={{ marginTop: 40 }} color="#111827" /> : (
        <ScrollView contentContainerStyle={padBottom([s.body, { paddingBottom: 32 }], bottomInset)} keyboardShouldPersistTaps="handled">
          <View style={s.card}>
            <ThemedText style={s.cardTitle}>{job.customer_name ?? 'Customer'}</ThemedText>
            {job.address && <ThemedText style={s.muted}>{job.address}</ThemedText>}
            {job.scheduled_at && <ThemedText style={s.muted}>{time(job.scheduled_at)}</ThemedText>}
          </View>

          <View style={s.card}>
            <ThemedText style={s.cardTitle}>Steps</ThemedText>
            {job.timeline.length === 0 && <ThemedText style={s.muted}>Nothing yet — steps show here as they happen.</ThemedText>}
            {job.timeline.map((e, i) => (
              <View key={`${e.step}-${i}`} style={s.step}>
                <Circle size={10} color="#10B981" fill="#10B981" />
                <View style={{ flex: 1 }}>
                  <ThemedText style={s.item}>{STEP_WORDS[e.step] ?? e.step}</ThemedText>
                  <ThemedText style={s.muted}>{e.actor_name ?? (e.actor_role === 'customer' ? 'Customer' : 'Team member')} · {time(e.created_at)}</ThemedText>
                </View>
              </View>
            ))}
          </View>

          <View style={s.card}>
            <ThemedText style={s.cardTitle}>Conversation</ThemedText>
            <ThemedText style={s.muted}>The customer is told your business can see this chat.</ThemedText>
            {messages.length === 0 && <ThemedText style={s.muted}>No messages yet.</ThemedText>}
            {[...messages].reverse().slice(-30).map((m) => (
              <View key={m.id} style={s.message}>
                <ThemedText style={s.small}>{who(m)} · {time(m.created_at)}</ThemedText>
                <ThemedText style={s.item}>{m.message_type === 'TEXT' ? m.message : m.message_type === 'IMAGE' ? 'Sent a photo' : m.message}</ThemedText>
              </View>
            ))}
            <View style={s.compose}>
              <TextInput style={s.input} value={draft} onChangeText={setDraft} placeholder="Write to the customer…"
                placeholderTextColor="#9CA3AF" multiline maxLength={1000} />
              <TouchableOpacity style={s.send} onPress={send} disabled={sending || !draft.trim()}>
                {sending ? <ActivityIndicator color="#111827" /> : <Send size={18} color="#111827" />}
              </TouchableOpacity>
            </View>
          </View>
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
  headerTitle: { flex: 1, fontSize: 18, lineHeight: 24, fontFamily: Fonts.poppinsBold, color: '#111827' },
  body: { paddingHorizontal: 16, gap: 10 },
  card: { padding: 14, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', gap: 8 },
  cardTitle: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: '#111827' },
  item: { fontSize: 13.5, lineHeight: 19, fontFamily: Fonts.poppins, color: '#111827' },
  muted: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppins, color: '#6B7280' },
  small: { fontSize: 11.5, lineHeight: 15, fontFamily: Fonts.poppinsSemiBold, color: '#6B7280' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  message: { gap: 2, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  compose: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 10, fontSize: 14, fontFamily: Fonts.poppins, color: '#111827', backgroundColor: '#F9FAFB' },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFCE48' },
});
