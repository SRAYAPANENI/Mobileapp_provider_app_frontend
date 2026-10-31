import { useAppAlert } from '@/components/app-alert';
import { HostingCard } from '@/components/rates/hosting-card';
import { Notify, rs, unitsFor } from '@/components/rates/shared';
import { SkillPricesCard } from '@/components/rates/skill-prices-card';
import { UsualRatesCard } from '@/components/rates/usual-rates-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { padBottom, useBottomInset } from '@/hooks/use-bottom-inset';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { ProviderRate } from '@/services/api';
import { MySkill, useHosting, useMySkills, useProviderProfile } from '@/services/queries/provider';
import { router } from 'expo-router';
import { ChevronLeft, Lock, Search, X } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StatusBar, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Every price a provider sets, in one place: the usual visiting fee and
// hourly rate, prices per hour / day / night for each skill (jobs priced up
// front — customers see the total for their dates, no quoting back and
// forth), and whether customers can bring things (a pet, an item) to them.
//
// The screen is the layout and the data (docs/APP_DATA_ARCHITECTURE.md):
// each card keeps its own drafts and saves itself, so typing redraws one card,
// and a refresh never overwrites what's being typed. A provider can have
// hundreds of skills, so they're a list drawn as it scrolls, each one line
// until opened, with a search above.

const NO_RATES: ProviderRate[] = [];
// Above this many priced skills, a search box helps find one.
const SEARCH_FROM = 6;

export default function RatesAndHostingScreen() {
  const bottomInset = useBottomInset();
  const topInset = useSafeAreaInsets().top;
  const appAlert = useAppAlert();
  const hosting = useHosting();
  const skills = useMySkills();
  const profile = useProviderProfile();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
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
  // together in one card instead of a card each.
  const priced = useMemo(() => verified.filter((sk) => unitsFor(sk).length > 0), [verified]);
  const byQuote = useMemo(() => verified.filter((sk) => unitsFor(sk).length === 0), [verified]);
  // Each skill's prices as one array that only changes with them, so a card
  // isn't redrawn for another skill's save.
  const ratesBySkill = useMemo(() => {
    const map: Record<string, ProviderRate[]> = {};
    for (const r of hosting.data?.rates ?? []) (map[r.skill_id] ??= []).push(r);
    return map;
  }, [hosting.data?.rates]);
  // The search shows only with enough skills; without it, nothing is filtered.
  const searching = priced.length > SEARCH_FROM ? query.trim() : '';
  const shown = useMemo(() => {
    const q = searching.toLowerCase();
    return q ? priced.filter((sk) => sk.name.toLowerCase().includes(q) || sk.profession?.toLowerCase().includes(q)) : priced;
  }, [priced, searching]);
  const hourlyHint = profile.data?.hourly_rate != null ? String(profile.data.hourly_rate) : '';

  // Shown once the rate card and skills are in; the usual rates follow if slower.
  const ready = hosting.data && skills.data;

  const renderItem = useCallback(({ item }: { item: MySkill }) => (
    <SkillPricesCard
      sk={item} rates={ratesBySkill[item.skill_id] ?? NO_RATES} hourlyHint={hourlyHint}
      notify={notify} expanded={open.has(item.skill_id)} onToggle={toggle} drafts={drafts}
    />
  ), [ratesBySkill, hourlyHint, notify, open, toggle, drafts]);

  const header = ready ? (
    <View style={s.section}>
      {profile.data ? <UsualRatesCard profile={profile.data} notify={notify} /> : <ActivityIndicator color="#111827" />}

      <ThemedText style={s.intro}>
        Prices per hour, day or night let you apply to jobs booked for a set time — customers see your total for
        their dates and pay when they book. A week or month price is used for longer stays when it's cheaper, and
        a day price for a long few hours (like daycare). Leave a box empty if you don't offer it.
      </ThemedText>

      {verified.length === 0 && (
        <View style={rs.card}>
          <ThemedText style={rs.muted}>
            {skills.data!.length === 0
              ? 'Add your skills from your profile, then set a price for each here.'
              : 'Prices per hour, day or night open up for a skill once you pass its test in Verification.'}
          </ThemedText>
        </View>
      )}

      {priced.length > SEARCH_FROM && (
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
    </View>
  ) : null;

  const footer = ready ? (
    <View style={s.section}>
      {searching && shown.length === 0 && (
        <ThemedText style={[rs.muted, { textAlign: 'center' }]}>No skill matches “{searching}”.</ThemedText>
      )}
      {byQuote.length > 0 && !searching && (
        <View style={rs.card}>
          <ThemedText style={rs.cardTitle}>Priced by quote</ThemedText>
          <ThemedText style={rs.muted}>
            Your visiting fee (above) when you go to the customer, then your invoice after seeing the job.
          </ThemedText>
          <ThemedText style={rs.hint}>{byQuote.map((sk) => sk.name).join(', ')}</ThemedText>
        </View>
      )}
      {verified.length > 0 && waiting.length > 0 && !searching && (
        // Their tests are in the Verification tab; prices open up after.
        <View style={[rs.row, s.waiting]}>
          <Lock size={14} color="#6B7280" />
          <ThemedText style={[rs.hint, { flex: 1 }]}>
            {waiting.map((sk) => sk.name).join(', ')} — pass {waiting.length === 1 ? 'its test' : 'their tests'} in Verification to set prices.
          </ThemedText>
        </View>
      )}

      <HostingCard hosting={hosting.data!} verified={verified} notify={notify} />
    </View>
  ) : null;

  return (
    <ThemedView style={s.container}>
      <StatusBar barStyle="dark-content" />
      <View style={[s.header, { paddingTop: topInset + 12 }]}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <ChevronLeft size={24} color="#111827" />
        </TouchableOpacity>
        <ThemedText style={s.headerTitle}>Rates & hosting</ThemedText>
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
        <FlatList
          data={shown}
          keyExtractor={(sk) => sk.skill_id}
          renderItem={renderItem}
          extraData={open}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          ItemSeparatorComponent={Gap}
          renderScrollComponent={(props) => <KeyboardAwareScrollView {...props} bottomOffset={24} />}
          refreshControl={refreshControl}
          contentContainerStyle={padBottom([s.body, { paddingBottom: 32 }], bottomInset)}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={11}
        />
      )}
      {appAlert.element}
    </ThemedView>
  );
}

const Gap = () => <View style={{ height: 12 }} />;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  headerTitle: { fontSize: 18, lineHeight: 24, fontFamily: Fonts.poppinsBold, color: '#111827' },
  failed: { alignItems: 'center', gap: 12, marginTop: 48 },
  body: { paddingHorizontal: 16 },
  section: { gap: 12, paddingVertical: 12 },
  intro: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppins, color: '#374151' },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, fontFamily: Fonts.poppins, color: '#111827' },
  waiting: { paddingHorizontal: 4, alignItems: 'flex-start' },
});
