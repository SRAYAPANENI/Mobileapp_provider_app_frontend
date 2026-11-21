import { useAppAlert } from '@/components/app-alert';
import { JoinRequestForm } from '@/components/business/join-request-form';
import { RecordLine, TradeChips, TrustBadges, milesAway } from '@/components/business/business-record';
import { Badge, Button, C, Monogram, Row, Section, u } from '@/components/business/ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { padBottom, useBottomInset } from '@/hooks/use-bottom-inset';
import { BusinessProfile, SkoFyApi } from '@/services/api';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Building2, CalendarClock, ChevronLeft, FileCheck2, Lock, MapPin, Radar, Star } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

// A business, for a provider deciding whether to ask to join
// (docs/BUSINESS_DISCOVERY_DESIGN.md) — the mirror of the requester's profile
// the owner decides on (app/join-request.tsx). Its record (jobs done, rating,
// team size), what it does, insurance and licences, and its owner — never
// who's on its team. Asking happens here, with what joining means agreed.
export default function BusinessProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const bottomInset = useBottomInset();
  const appAlert = useAppAlert();
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    if (!id) { setGone('This business couldn’t be opened.'); return; }
    setGone(null);
    SkoFyApi.business.businessProfile(id)
      .then(setBusiness)
      .catch((err: any) => setGone(err?.error_code === 'NOT_FOUND'
        ? 'This business isn’t on Dodorez any more.'
        : err?.message ?? "Couldn't load this business. Check your connection and try again."));
  }, [id]);
  useEffect(load, [load]);

  const send = async (hours: Parameters<typeof SkoFyApi.business.requestToJoin>[1], agreed: boolean, authorized: boolean) => {
    if (!business) return;
    setSending(true);
    try {
      const { message } = await SkoFyApi.business.requestToJoin(business.id, hours, agreed, authorized);
      setAsking(false);
      load();
      appAlert.show('success', 'Request sent', message);
    } catch (err: any) {
      appAlert.show('error', 'Not sent', err?.message ?? 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  const since = business ? new Date(business.created_at).getFullYear() : null;
  const away = business ? milesAway(business.distance_km) : null;

  return (
    <ThemedView style={s.container}>
      <StatusBar barStyle="dark-content" />
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} accessibilityLabel="Back">
          <ChevronLeft size={22} color={C.ink} />
        </TouchableOpacity>
        <ThemedText style={s.headerTitle} numberOfLines={1}>{business?.name ?? 'Business'}</ThemedText>
      </View>

      {gone ? (
        <View style={s.body}>
          <Section>
            <View style={{ alignItems: 'center', gap: 10, paddingVertical: 12 }}>
              <Building2 size={28} color={C.muted} />
              <ThemedText style={[u.body, { textAlign: 'center' }]}>{gone}</ThemedText>
              <Button small kind="secondary" label="Try again" onPress={load} />
            </View>
          </Section>
        </View>
      ) : !business ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={C.ink} />
      ) : (
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled"
          contentContainerStyle={padBottom([s.body, { paddingBottom: 40 }], bottomInset)}>
          {/* Who they are */}
          <View style={[u.card, s.hero]}>
            {business.logo_url
              ? <Image source={{ uri: business.logo_url }} style={s.logo} contentFit="cover" />
              : <Monogram name={business.name} size={72} />}
            <ThemedText style={s.name} numberOfLines={2}>{business.name}</ThemedText>
            <View style={s.metaRow}>
              {!!away && <View style={s.meta}><MapPin size={13} color={C.muted} /><ThemedText style={u.muted}>{away}</ThemedText></View>}
              {!!since && <View style={s.meta}><CalendarClock size={13} color={C.muted} /><ThemedText style={u.muted}>On Dodorez since {since}</ThemedText></View>}
            </View>
            {business.open_to_join_requests && <Badge icon={<Radar size={11} color={C.brandInk} />} label="Actively looking for people" tone="brand" />}
            <TrustBadges business={business} />
          </View>

          {/* Its record as a business */}
          <Section title="Track record">
            <RecordLine business={business} />
            {business.jobs_completed === 0 && (
              <ThemedText style={[u.muted, { marginTop: 6 }]}>No jobs done as a business on Dodorez yet — its owner’s own record is below.</ThemedText>
            )}
          </Section>

          {business.trades.length > 0 && (
            <Section title="What they do">
              <TradeChips trades={business.trades} />
            </Section>
          )}

          {business.licences.length > 0 && (
            <Section title="Licences checked by Dodorez" flush>
              {business.licences.map((l, i) => (
                <Row key={l} last={i === business.licences.length - 1} icon={<FileCheck2 size={18} color={C.ok} />} tone="ok" title={l} />
              ))}
            </Section>
          )}

          {/* Who you'd work for */}
          <Section title="Run by" flush>
            <Row last
              icon={business.owner_photo
                ? <Image source={{ uri: business.owner_photo }} style={s.ownerPhoto} contentFit="cover" />
                : <Monogram name={business.owner_name} size={38} />}
              title={business.owner_name ?? 'The owner'}
              detail={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  {business.owner_rating > 0 && (
                    <>
                      <Star size={12} color="#D97706" fill="#F59E0B" />
                      <ThemedText style={u.muted}>{business.owner_rating.toFixed(1)} · </ThemedText>
                    </>
                  )}
                  <ThemedText style={u.muted}>{business.owner_jobs_completed} job{business.owner_jobs_completed === 1 ? '' : 's'} done on Dodorez</ThemedText>
                </View>
              } />
          </Section>

          <View style={s.privacy}>
            <Lock size={13} color={C.muted} />
            <ThemedText style={[u.muted, { flex: 1 }]}>Who’s on the team isn’t shown — only its totals.</ThemedText>
          </View>

          {/* Asking — or where it stands */}
          <Section>
            {business.my_status === 'ACTIVE' ? (
              <Badge label="You're on their team" tone="ok" />
            ) : business.my_status === 'INVITED' ? (
              <View style={{ gap: 8 }}>
                <ThemedText style={u.body}>
                  {business.my_requested_by === 'MEMBER'
                    ? 'Your request is waiting for their answer. You’re told when they reply.'
                    : 'They’ve invited you — answer it on your Business page.'}
                </ThemedText>
                {business.my_requested_by !== 'MEMBER' && (
                  <Button kind="secondary" label="Open Business" onPress={() => router.push('/business' as any)} />
                )}
              </View>
            ) : business.cannot_ask ? (
              // Said before they fill anything in — the server would refuse it after.
              <ThemedText style={u.body}>{business.cannot_ask}</ThemedText>
            ) : asking ? (
              <JoinRequestForm business={business} busy={sending} onCancel={() => setAsking(false)} onSend={send} />
            ) : (
              <View style={{ gap: 8 }}>
                <ThemedText style={u.body}>
                  Inside the hours you agree, jobs come to you through {business.name}. Outside them you work for yourself, as now.
                </ThemedText>
                <Button label="Request to join" onPress={() => setAsking(true)} />
              </View>
            )}
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
  headerTitle: { flex: 1, fontSize: 20, lineHeight: 27, fontFamily: Fonts.poppinsBold, color: C.ink },
  body: { paddingHorizontal: 16, gap: 20 },
  hero: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  logo: { width: 72, height: 72, borderRadius: 22, backgroundColor: '#F1F5F9' },
  name: { fontSize: 19, lineHeight: 26, fontFamily: Fonts.poppinsBold, color: C.ink, textAlign: 'center' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ownerPhoto: { width: 38, height: 38, borderRadius: 12 },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
});
