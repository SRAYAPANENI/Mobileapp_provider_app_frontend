import { useAppAlert } from '@/components/app-alert';
import { TextInput } from '@/components/scaled-text';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { padBottom, useBottomInset } from '@/hooks/use-bottom-inset';
import { GuaranteeClaim, SkoFyApi } from '@/services/api';
import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft, ShieldCheck } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';

const STATUS: Record<GuaranteeClaim['status'], string> = {
  OPEN: 'Waiting for you', FIX_OFFERED: "You're fixing it", FIXED: 'Fixed', REFUNDED: 'Refunded by Dodorez', DECLINED: 'Not covered',
};

// Customers' guarantee claims on your work (docs/MONEY_RULES_DESIGN.md §12):
// offer to come back and fix it at no charge — chat and calls reopen to
// arrange it — or explain why not, and our team decides.
export default function GuaranteeClaimsScreen() {
  const bottomInset = useBottomInset();
  const appAlert = useAppAlert();
  const [claims, setClaims] = useState<GuaranteeClaim[] | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    SkoFyApi.guarantee.mine().then(setClaims).catch(() => setClaims([]));
  }, []);
  useFocusEffect(load);

  const respond = async (jobId: string, fix: boolean) => {
    setBusy(true);
    try {
      const result = await SkoFyApi.guarantee.respond(jobId, fix, fix ? undefined : note.trim());
      appAlert.show('success', fix ? 'Thanks' : 'Sent', result.message);
      setDeclining(null); setNote('');
      load();
    } catch (err: any) {
      appAlert.show('error', 'Not sent', err?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={s.container}>
      <StatusBar barStyle="dark-content" />
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <ChevronLeft size={24} color="#111827" />
        </TouchableOpacity>
        <ThemedText style={s.headerTitle}>Guarantee requests</ThemedText>
      </View>
      {!claims ? <ActivityIndicator style={{ marginTop: 40 }} color="#111827" /> : (
        <ScrollView contentContainerStyle={padBottom([s.body, { paddingBottom: 24 }], bottomInset)}>
          <View style={s.card}>
            <View style={s.row}>
              <ShieldCheck size={18} color="#059669" />
              <ThemedText style={s.cardTitle}>How the guarantee works</ThemedText>
            </View>
            <ThemedText style={s.muted}>
              Jobs paid in the app are guaranteed for a while after they're done. If the work fails, you're asked first:
              come back and fix it at no charge, or explain why it isn't your work. Refunds are paid by Dodorez, not you.
            </ThemedText>
          </View>
          {claims.length === 0 && <ThemedText style={s.muted}>No requests — nice work.</ThemedText>}
          {claims.map((c) => (
            <View key={c.id} style={s.card}>
              <ThemedText style={s.cardTitle}>{c.job_title}</ThemedText>
              <ThemedText style={s.status}>{STATUS[c.status]}</ThemedText>
              <ThemedText style={s.item}>“{c.description}”</ThemedText>
              <View style={s.photos}>
                {c.photo_urls.map((url) => <Image key={url} source={{ uri: url }} style={s.photo} />)}
              </View>
              {c.decision_note && <ThemedText style={s.muted}>Our team: {c.decision_note}</ThemedText>}
              {c.status === 'OPEN' && !c.provider_responded_at && (busy ? <ActivityIndicator color="#111827" /> : (
                declining === c.job_id ? (
                  <>
                    <TextInput style={s.input} placeholder="Why isn't this covered? Our team reads it." placeholderTextColor="#9CA3AF"
                      value={note} onChangeText={setNote} multiline maxLength={2000} />
                    <View style={s.row}>
                      <TouchableOpacity style={s.secondary} onPress={() => setDeclining(null)}>
                        <ThemedText style={s.secondaryText}>Back</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.primary, note.trim().length < 10 && { opacity: 0.5 }]}
                        disabled={note.trim().length < 10} onPress={() => respond(c.job_id, false)}>
                        <ThemedText style={s.primaryText}>Send</ThemedText>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <View style={s.row}>
                    <TouchableOpacity style={s.secondary} onPress={() => { setNote(''); setDeclining(c.job_id); }}>
                      <ThemedText style={s.secondaryText}>Explain</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.primary} onPress={() => respond(c.job_id, true)}>
                      <ThemedText style={s.primaryText}>I'll fix it</ThemedText>
                    </TouchableOpacity>
                  </View>
                )
              ))}
              {c.status === 'FIX_OFFERED' && (
                <TouchableOpacity onPress={() => router.push({ pathname: '/chat' as any, params: { jobId: c.job_id, jobTitle: c.job_title } })}>
                  <ThemedText style={s.link}>Chat with the customer to arrange it</ThemedText>
                </TouchableOpacity>
              )}
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
  body: { paddingHorizontal: 16, gap: 12 },
  card: { padding: 16, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: '#111827' },
  status: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.poppinsSemiBold, color: '#92400E' },
  muted: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppins, color: '#6B7280' },
  item: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppins, color: '#111827' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  photo: { width: 60, height: 60, borderRadius: 8, backgroundColor: '#F3F4F6' },
  link: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: '#2563EB' },
  input: {
    minHeight: 80, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 10,
    fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppins, color: '#111827', textAlignVertical: 'top',
  },
  secondary: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#F3F4F6' },
  secondaryText: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: '#374151' },
  primary: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#FFCE48' },
  primaryText: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppinsBold, color: '#111827' },
});
