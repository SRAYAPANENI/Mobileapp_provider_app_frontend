import { useAppAlert } from '@/components/app-alert';
import { HostingCard } from '@/components/rates/hosting-card';
import {
  OfferDelivery, Overview, SectionHead, SectionStatus, VehicleRoomCard, statusOf,
} from '@/components/rates/rate-sections';
import { Notify, RateGroup, groupOf, needsPrice, rs, unitsFor } from '@/components/rates/shared';
import { SkillPricesCard } from '@/components/rates/skill-prices-card';
import { UsualRatesCard } from '@/components/rates/usual-rates-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { padBottom, useBottomInset } from '@/hooks/use-bottom-inset';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { ProviderRate, SkoFyApi } from '@/services/api';
import { useAppConfig } from '@/services/queries/app-config';
import { qk } from '@/services/queries/keys';
import { MySkill, useHosting, useMySkills, useProviderProfile } from '@/services/queries/provider';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronLeft, Lock, Search, X } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, SectionList, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { TextInput } from '@/components/scaled-text';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Every price a provider sets, in one place, laid out by the kind of work
// (each skill is priced one way — skofy-backend app/domain/skill_pricing.py):
//   - Your usual rates: the visiting fee and hourly rate.
//   - Your skills: priced by the hour or the visit (and quoted ones, by invoice).
//   - Pickup & Delivery: a fare per trip, its size extras and waiting, and
//     the vehicle behind the car-trunk and van extras.
//   - Stays, day care & hosting: per night / day, and whether customers can
//     bring a pet or an item to them.
// A summary at the top says where each stands; tap one to go to it.
//
// The screen is the layout and the data (docs/APP_DATA_ARCHITECTURE.md): each
// card keeps its own drafts and saves itself, so typing redraws one card, and
// a refresh never overwrites what's being typed. A provider can have hundreds
// of skills, so they're drawn as the list scrolls, each one line until opened.

const NO_RATES: ProviderRate[] = [];
const ORDER: RateGroup[] = ['SKILLS', 'TRIP', 'STAYS'];

interface RateSection { group: RateGroup; data: MySkill[] }

export default function RatesAndHostingScreen() {
  const bottomInset = useBottomInset();
  const topInset = useSafeAreaInsets().top;
  const appAlert = useAppAlert();
  const client = useQueryClient();
  const hosting = useHosting();
  const { data: appConfig } = useAppConfig();
  const skills = useMySkills();
  const profile = useProviderProfile();
  const listRef = useRef<SectionList<MySkill, RateSection>>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [offering, setOffering] = useState(false);
  // Unsaved prices by skill, for cards the list has let go of (SkillPricesCard).
  const drafts = useRef<Record<string, any>>({}).current;

  // One stable way for the cards to speak, so they don't redraw for it.
  const alertRef = useRef(appAlert);
  alertRef.current = appAlert;
  const notify = useCallback<Notify>((type, title, message) => alertRef.current.show(type, title, message), []);
  const toggle = useCallback((skillId: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (!next.delete(skillId)) next.add(skillId);
    return next;
  }), []);

  const refreshControl = usePullRefresh(() => Promise.all([hosting.refetch(), skills.refetch(), profile.refetch()]));

  const verified = useMemo(() => (skills.data ?? []).filter((sk) => sk.is_verified), [skills.data]);
  const waiting = useMemo(() => (skills.data ?? []).filter((sk) => !sk.is_verified), [skills.data]);
  // Skills with price boxes; those priced by quote have none, so they're named
  // together under Your skills instead of a card each.
  const priced = useMemo(() => verified.filter((sk) => unitsFor(sk).length > 0), [verified]);
  const byQuote = useMemo(() => verified.filter((sk) => unitsFor(sk).length === 0), [verified]);
  // Each skill's prices as one array that only changes with them, so a card
  // isn't redrawn for another skill's save.
  const ratesBySkill = useMemo(() => {
    const map: Record<string, ProviderRate[]> = {};
    for (const r of hosting.data?.rates ?? []) (map[r.skill_id] ??= []).push(r);
    return map;
  }, [hosting.data?.rates]);
  const hourlyHint = profile.data?.hourly_rate != null ? String(profile.data.hourly_rate) : '';

  const deliveryOn = appConfig?.modules.pickup_delivery !== false;
  const hostingOn = appConfig?.modules.hosting !== false;
  const visible = (g: RateGroup) => (g === 'TRIP' ? deliveryOn : g === 'STAYS' ? hostingOn || priced.some((sk) => groupOf(sk) === 'STAYS') : true);

  // Where each section stands — the summary tiles and the section heads.
  const statuses = useMemo(() => {
    const out = {} as Record<RateGroup, SectionStatus | null>;
    for (const g of ORDER) {
      if (!visible(g)) { out[g] = null; continue; }
      const mine = priced.filter((sk) => groupOf(sk) === g);
      const missing = mine.filter((sk) => needsPrice(sk, ratesBySkill[sk.skill_id], !!hourlyHint)).length;
      const quoted = g === 'SKILLS' ? byQuote.length : 0;
      out[g] = mine.length === 0 && quoted > 0
        ? { label: 'Priced by quote', tone: 'ok' }
        : statusOf(mine.length, missing, g === 'TRIP' ? 'Not offered' : g === 'STAYS' ? 'None yet' : 'None yet');
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priced, byQuote, ratesBySkill, hourlyHint, deliveryOn, hostingOn]);

  // The sections, filtered by the search (a section with no match is left out).
  // Only while its box is shown: a search typed before the list got short
  // would otherwise keep hiding skills with nothing left to clear it.
  const searchable = priced.length > 4;
  const searching = searchable ? query.trim() : '';
  // A summary tile tapped: only its section (null: all three).
  const [focus, setFocus] = useState<RateGroup | null>(null);
  const sections = useMemo<RateSection[]>(() => {
    const q = searching.toLowerCase();
    const matches = (sk: MySkill) => !q || sk.name.toLowerCase().includes(q) || sk.profession?.toLowerCase().includes(q);
    return ORDER.filter(visible)
      // A search looks through everything (the tiles are hidden while it's on).
      .filter((group) => !!q || !focus || group === focus)
      .map((group) => ({ group, data: priced.filter((sk) => groupOf(sk) === group && matches(sk)) }))
      .filter((sec) => !q || sec.data.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priced, searching, deliveryOn, hostingOn, focus]);

  // Showing one section: its heading comes into view (it's just under the tiles).
  const pick = useCallback((group: RateGroup | null) => {
    setFocus(group);
    if (group) {
      setTimeout(() => listRef.current?.scrollToLocation({ sectionIndex: 0, itemIndex: 0, viewOffset: 8, animated: true }), 60);
    }
  }, []);

  // A callback of its own, listed below: the footers are memoised, and a
  // stale copy read the profile from before it loaded ("verify your ID" for
  // someone already verified).
  const identityVerified = !!profile.data?.is_identity_verified;
  const offerDelivery = useCallback(async () => {
    if (!identityVerified) {
      appAlert.show('warning', 'Verify your ID first', 'Pickup & Delivery opens once your ID is verified — in Profile → Settings.');
      return;
    }
    setOffering(true);
    try {
      await SkoFyApi.skills.setPickupDropoffEnabled(true);
      await client.invalidateQueries({ queryKey: qk.provider.skills });
      notify('success', 'Pickup & Delivery is on', 'Now set your base fare and price per mile so customers can book you.');
    } catch (err: any) {
      notify('error', 'Not turned on', err?.message ?? 'Please try again.');
    } finally {
      setOffering(false);
    }
  }, [identityVerified, client, notify]);

  // Shown once the rate card and skills are in; the usual rates follow if slower.
  const ready = hosting.data && skills.data;

  const renderItem = useCallback(({ item }: { item: MySkill }) => (
    <View style={s.item}>
      <SkillPricesCard
        sk={item} rates={ratesBySkill[item.skill_id] ?? NO_RATES} hourlyHint={hourlyHint}
        notify={notify} expanded={open.has(item.skill_id)} onToggle={toggle} drafts={drafts}
        waitRules={hosting.data?.trip_wait} vehicleRoom={hosting.data?.vehicle_room}
      />
    </View>
  ), [ratesBySkill, hourlyHint, notify, open, toggle, drafts, hosting.data?.trip_wait, hosting.data?.vehicle_room]);

  const renderSectionHeader = useCallback(({ section }: { section: RateSection }) => (
    statuses[section.group] ? <SectionHead group={section.group} status={statuses[section.group]!} /> : null
  ), [statuses]);

  // Under each section: what belongs with it but isn't a skill's prices.
  const renderSectionFooter = useCallback(({ section }: { section: RateSection }) => {
    if (searching) return null;
    const empty = section.data.length === 0;
    if (section.group === 'SKILLS') {
      return (
        <View style={s.footer}>
          {empty && byQuote.length === 0 && (
            <ThemedText style={rs.muted}>No skills priced by the hour or the visit yet.</ThemedText>
          )}
          {byQuote.length > 0 && (
            <View style={rs.card}>
              <ThemedText style={rs.cardTitle}>Priced by quote</ThemedText>
              <ThemedText style={rs.muted}>
                Your visiting fee (above) when you go to the customer, then your invoice after seeing the job.
              </ThemedText>
              <ThemedText style={rs.hint}>{byQuote.map((sk) => sk.name).join(', ')}</ThemedText>
            </View>
          )}
          {waiting.length > 0 && (
            // Their tests are in Verification; prices open up after.
            <View style={[rs.row, s.waiting]}>
              <Lock size={14} color="#6B7280" />
              <ThemedText style={[rs.hint, { flex: 1 }]}>
                {waiting.map((sk) => sk.name).join(', ')} — pass {waiting.length === 1 ? 'its test' : 'their tests'} in Verification to set prices.
              </ThemedText>
            </View>
          )}
        </View>
      );
    }
    if (section.group === 'TRIP') {
      return (
        <View style={s.footer}>
          {empty ? <OfferDelivery busy={offering} onOffer={offerDelivery} /> : <VehicleRoomCard room={hosting.data?.vehicle_room} />}
        </View>
      );
    }
    return (
      <View style={s.footer}>
        {empty && <ThemedText style={rs.muted}>No skills priced by the night or the day yet.</ThemedText>}
        {hostingOn && <HostingCard hosting={hosting.data!} verified={verified} notify={notify} />}
      </View>
    );
  }, [searching, byQuote, waiting, offering, offerDelivery, hosting.data, verified, notify, hostingOn]);

  const header = ready ? (
    <View style={s.top}>
      {profile.data ? <UsualRatesCard profile={profile.data} notify={notify} /> : <ActivityIndicator color="#111827" />}
      {verified.length === 0 && (
        // Still shown below: Pickup & Delivery needs a verified ID, not a test.
        <View style={rs.card}>
          <ThemedText style={rs.muted}>
            {skills.data!.length === 0
              ? 'Add your skills from your profile, then set a price for each here.'
              : 'Prices open up for a skill once you pass its test in Verification.'}
          </ThemedText>
        </View>
      )}
      {!searching && <Overview statuses={statuses} selected={focus} onPick={pick} />}
      {searchable && (
        <View style={s.search}>
          <Search size={16} color="#6B7280" />
          <TextInput
            style={s.searchInput}
            placeholder={`Find one of your ${priced.length} skills`}
            placeholderTextColor="#9CA3AF"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <X size={16} color="#6B7280" />
            </TouchableOpacity>
          ) : null}
        </View>
      )}
      {searching && sections.length === 0 && (
        <ThemedText style={[rs.muted, { textAlign: 'center' }]}>No skill matches “{searching}”.</ThemedText>
      )}
    </View>
  ) : null;

  return (
    <ThemedView style={s.container}>
      <StatusBar barStyle="dark-content" />
      <View style={[s.header, { paddingTop: topInset + 12 }]}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} accessibilityLabel="Back">
          <ChevronLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={s.headerTitle}>Rates & hosting</ThemedText>
          <ThemedText style={s.headerSub}>What customers pay you, by the kind of work</ThemedText>
        </View>
      </View>
      {hosting.isError && !hosting.data ? (
        <View style={s.failed}>
          <ThemedText style={rs.muted}>Couldn't load your prices.</ThemedText>
          <TouchableOpacity style={[rs.primary, { paddingHorizontal: 24 }]} onPress={() => { hosting.refetch(); skills.refetch(); profile.refetch(); }}>
            <ThemedText style={rs.primaryText}>Try again</ThemedText>
          </TouchableOpacity>
        </View>
      ) : !ready ? <ActivityIndicator style={{ marginTop: 40 }} color="#111827" /> : (
        // Drawn as it scrolls; keyboard-aware, so the box being typed in
        // scrolls up above the keyboard.
        <SectionList
          ref={listRef}
          sections={sections}
          keyExtractor={(sk) => sk.skill_id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          renderSectionFooter={renderSectionFooter}
          stickySectionHeadersEnabled={false}
          extraData={open}
          ListHeaderComponent={header}
          renderScrollComponent={(props) => <KeyboardAwareScrollView {...props} bottomOffset={24} />}
          refreshControl={refreshControl}
          contentContainerStyle={padBottom([s.body, { paddingBottom: 32 }], bottomInset)}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={11}
          onScrollToIndexFailed={() => {}}
        />
      )}
      {appAlert.element}
    </ThemedView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  headerTitle: { fontSize: 18, lineHeight: 24, fontFamily: Fonts.poppinsBold, color: '#111827' },
  headerSub: { fontSize: 12, lineHeight: 17, fontFamily: Fonts.poppins, color: '#6B7280' },
  failed: { alignItems: 'center', gap: 12, marginTop: 48 },
  body: { paddingHorizontal: 16 },
  top: { gap: 14, paddingTop: 4 },
  item: { paddingBottom: 12 },
  footer: { gap: 12, paddingBottom: 4 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, fontFamily: Fonts.poppins, color: '#111827' },
  waiting: { paddingHorizontal: 4, alignItems: 'flex-start' },
});
