import { useAppAlert } from '@/components/app-alert';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { padBottom, useBottomInset } from '@/hooks/use-bottom-inset';
import { DogSize, Hosting, HostingPrefs, ItemSize, PetKind, ProviderRate, SkoFyApi } from '@/services/api';
import { MIN_VISITING_FEE } from '@/services/fees';
import { refreshUsualRate } from '@/components/labour-helper';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { Box, ChevronLeft, Home, LocateFixed, Lock, Minus, Moon, PawPrint, Plus, Sparkles } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Switch, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Unit = 'HOUR' | 'VISIT' | 'DAY' | 'NIGHT' | 'WEEK' | 'MONTH';

// The prices a job can be booked at up front (docs/JOB_SHAPE_DESIGN.md) — in
// the words a provider thinks in, with an example of each.
const UNITS: { unit: Unit; label: string; hint: string }[] = [
  { unit: 'HOUR', label: 'Per hour', hint: 'Booked by the hour. Empty uses your usual hourly rate' },
  { unit: 'VISIT', label: 'Per visit', hint: 'One set price for a visit or session' },
  { unit: 'DAY', label: 'Per day', hint: "Over days at the customer's place, or a full day at yours (like daycare)" },
  { unit: 'NIGHT', label: 'Per night', hint: 'Stays at your place — e.g. pet boarding (turn on hosting below)' },
  // Long stays: used by themselves when they come out cheaper than the nights
  // or days (skofy-backend/app/domain/rate_card.py best_price).
  { unit: 'WEEK', label: 'Per week', hint: 'Optional — for stays of 7 nights or days and more' },
  { unit: 'MONTH', label: 'Per month', hint: 'Optional — for stays of 30 and more, like storage' },
];

const USUAL: { field: 'fee' | 'hourly'; label: string; hint: string }[] = [
  { field: 'fee', label: 'Visiting fee', hint: `Covers your trip — at least $${MIN_VISITING_FEE}` },
  { field: 'hourly', label: 'Hourly rate', hint: 'For the work itself' },
];

interface Skill { skill_id: string; name: string; is_verified: boolean; pricing?: string | null }

// Each skill is priced one standard way (skofy-backend/app/domain/skill_pricing.py):
// only its own price boxes show. A skill priced by quote has none — the
// visiting fee above, then an invoice. An older skill without one shows all.
const UNITS_BY_PRICING: Record<string, Unit[]> = {
  QUOTE: [],
  HOUR: ['HOUR'],
  VISIT: ['VISIT'],
  NIGHT: ['NIGHT', 'WEEK', 'MONTH'],
  DAY: ['DAY', 'WEEK', 'MONTH'],
};
const unitsFor = (sk: Skill) => {
  const allowed = sk.pricing ? UNITS_BY_PRICING[sk.pricing] : null;
  return allowed ? UNITS.filter((u) => allowed.includes(u.unit)) : UNITS.filter((u) => u.unit !== 'VISIT');
};

// What a host takes in (skofy-backend/app/domain/care_sheet.py).
const PET_KINDS: { value: PetKind; label: string }[] = [
  { value: 'DOG', label: 'Dogs' }, { value: 'CAT', label: 'Cats' }, { value: 'BIRD', label: 'Birds' },
  { value: 'SMALL_PET', label: 'Small pets' }, { value: 'REPTILE', label: 'Reptiles' },
  { value: 'FISH', label: 'Fish' }, { value: 'OTHER', label: 'Other' },
];
const DOG_SIZES: { value: DogSize; label: string }[] = [
  { value: 'SMALL', label: 'Small' }, { value: 'MEDIUM', label: 'Medium' },
  { value: 'LARGE', label: 'Large' }, { value: 'GIANT', label: 'Any size' },
];
const ITEM_SIZES: { value: ItemSize; label: string }[] = [
  { value: 'SMALL', label: 'Bag' }, { value: 'MEDIUM', label: 'Box' },
  { value: 'LARGE', label: 'Car trunk' }, { value: 'BULKY', label: 'Van' },
];
const NO_HOSTING: HostingPrefs = { on: false, capacity: 1, pets: { on: false }, items: { on: false } };

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <View style={s.stepper}>
      <TouchableOpacity style={s.stepBtn} onPress={() => onChange(Math.max(min, value - 1))}>
        <Minus size={16} color="#111827" />
      </TouchableOpacity>
      <ThemedText style={s.stepValue}>{value}</ThemedText>
      <TouchableOpacity style={s.stepBtn} onPress={() => onChange(Math.min(max, value + 1))}>
        <Plus size={16} color="#111827" />
      </TouchableOpacity>
    </View>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  // Colours set: Android's default thumb is its own teal-green.
  return <Switch value={value} onValueChange={onChange} trackColor={{ false: '#D1D5DB', true: '#FFCE48' }} thumbColor="#fff" />;
}

const key = (skillId: string, unit: Unit) => `${skillId}:${unit}`;

// Every price a provider sets, in one place: the usual visiting fee and
// hourly rate, prices per hour / day / night for each skill (jobs priced up
// front — customers see the total for their dates, no quoting back and
// forth), and whether customers can bring things (a pet, an item) to them.
export default function RatesAndHostingScreen() {
  const bottomInset = useBottomInset();
  const topInset = useSafeAreaInsets().top;
  const appAlert = useAppAlert();
  const [hosting, setHosting] = useState<Hosting | null>(null);
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [usual, setUsual] = useState({ fee: '', hourly: '' });
  const [savingUsual, setSavingUsual] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingSkill, setSavingSkill] = useState<string | null>(null);
  const [host, setHost] = useState({ address: '', lat: null as number | null, lng: null as number | null });
  const [prefs, setPrefs] = useState<HostingPrefs>(NO_HOSTING);
  const setPets = (patch: Partial<HostingPrefs['pets']>) => setPrefs((p) => ({ ...p, pets: { ...p.pets, ...patch } }));
  const setItems = (patch: Partial<HostingPrefs['items']>) => setPrefs((p) => ({ ...p, items: { ...p.items, ...patch } }));
  const [savingHost, setSavingHost] = useState(false);
  const [locating, setLocating] = useState(false);

  const apply = (h: Hosting) => {
    setHosting(h);
    setDrafts(Object.fromEntries(h.rates.map((r) => [key(r.skill_id, r.unit as Unit), String(r.amount)])));
    setHost({ address: h.base_address ?? '', lat: h.base_lat, lng: h.base_lng });
    setPrefs(h.hosting_prefs ?? NO_HOSTING);
  };

  const load = useCallback(() => {
    setLoadFailed(false);
    SkoFyApi.hosting.mine().then(apply).catch(() => setLoadFailed(true));
    SkoFyApi.skills.getMySkills()
      .then((list: any) => setSkills((Array.isArray(list) ? list : [])
        .sort((a: Skill, b: Skill) => a.name.localeCompare(b.name))))
      .catch(() => setSkills([]));
    SkoFyApi.provider.getProfile()
      .then((p: any) => setUsual({
        fee: p?.visiting_fee != null ? String(p.visiting_fee) : '',
        hourly: p?.hourly_rate != null ? String(p.hourly_rate) : '',
      }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFocusEffect(load);

  // The visiting fee and hourly rate for ordinary visits. The server takes
  // both together, so both are needed.
  const saveUsual = async () => {
    const fee = Number(usual.fee);
    const hourly = Number(usual.hourly);
    if (!usual.fee || !usual.hourly || !(fee > 0) || !(hourly > 0)) {
      appAlert.show('error', 'Both prices needed', 'Fill in your visiting fee and hourly rate.');
      return;
    }
    if (fee < MIN_VISITING_FEE) {
      appAlert.show('error', 'Visiting fee too low', `The visiting fee is at least $${MIN_VISITING_FEE} — it covers your trip if a customer cancels.`);
      return;
    }
    setSavingUsual(true);
    try {
      await SkoFyApi.provider.setRates(fee, hourly);
      refreshUsualRate();
      appAlert.show('success', 'Saved', 'Customers now see your visiting fee and hourly rate.');
    } catch (err: any) {
      appAlert.show('error', 'Not saved', err?.message ?? 'Please try again.');
    } finally {
      setSavingUsual(false);
    }
  };

  const suggestUsual = async () => {
    setSuggesting(true);
    try {
      const tip = await SkoFyApi.provider.suggestRates();
      setUsual({ fee: String(tip.visiting_fee), hourly: String(tip.hourly_rate) });
    } catch (err: any) {
      appAlert.show('error', 'Could not suggest', err?.message ?? 'Try again in a moment.');
    } finally {
      setSuggesting(false);
    }
  };

  const verified = (skills ?? []).filter((sk) => sk.is_verified);
  const waiting = (skills ?? []).filter((sk) => !sk.is_verified);
  // What a stay at their place costs: each skill's per-night price, and its
  // week and month prices for long stays.
  const STAY_WORD: Record<string, string> = { NIGHT: 'night', WEEK: 'week', MONTH: 'month' };
  const nightly = Object.entries(
    (hosting?.rates ?? []).filter((r: ProviderRate) => r.unit in STAY_WORD)
      .reduce((bySkill: Record<string, string[]>, r: ProviderRate) => {
        (bySkill[r.skill_id] ??= []).push(`$${r.amount}/${STAY_WORD[r.unit]}`);
        return bySkill;
      }, {}),
  ).map(([skill_id, prices]) => ({ skill_id, prices: prices.join(' · ') }));
  const skillName = (id: string) => skills?.find((sk) => sk.skill_id === id)?.name ?? 'A skill';

  const savedAmount = (skillId: string, unit: Unit) =>
    hosting?.rates.find((r: ProviderRate) => r.skill_id === skillId && r.unit === unit)?.amount;

  const saveSkill = async (sk: Skill) => {
    const skillId = sk.skill_id;
    setSavingSkill(skillId);
    try {
      let latest: Hosting | null = null;
      for (const { unit } of unitsFor(sk)) {
        const text = (drafts[key(skillId, unit)] ?? '').trim();
        const saved = savedAmount(skillId, unit);
        if (!text) {
          if (saved != null) latest = await SkoFyApi.hosting.removeRate(skillId, unit);
          continue;
        }
        const amount = Number(text);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a price in dollars, like 25.');
        if (amount !== saved) latest = await SkoFyApi.hosting.setRate(skillId, unit, amount);
      }
      if (latest) apply(latest);
      appAlert.show('success', 'Saved', 'Customers now see your prices for this skill.');
    } catch (err: any) {
      appAlert.show('error', 'Not saved', err?.message ?? 'Please try again.');
    } finally {
      setSavingSkill(null);
    }
  };

  const useHere = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Allow location to use where you are.');
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [place] = await Location.reverseGeocodeAsync(loc.coords).catch(() => []);
      const address = place
        ? [place.streetNumber && place.street ? `${place.streetNumber} ${place.street}` : place.street ?? place.name, place.city, place.region, place.postalCode]
            .filter(Boolean).join(', ')
        : host.address;
      setHost((h) => ({ ...h, lat: loc.coords.latitude, lng: loc.coords.longitude, address: address || h.address }));
    } catch (err: any) {
      appAlert.show('error', 'Location', err?.message ?? 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  };

  const saveHosting = async () => {
    setSavingHost(true);
    try {
      if (prefs.on && prefs.pets.on && !(prefs.pets.kinds ?? []).length) {
        throw new Error('Choose which animals you take in.');
      }
      let { lat, lng } = host;
      // Typed, not pinned: find it on the map.
      if (prefs.on && lat == null && host.address.trim()) {
        const [hit] = await Location.geocodeAsync(host.address.trim()).catch(() => []);
        if (hit) ({ latitude: lat, longitude: lng } = hit);
        if (lat == null) throw new Error("We couldn't find that address on the map. Check it, or tap \"I'm at home\" to pin where you are.");
      }
      apply(await SkoFyApi.hosting.update({
        hosts_at_home: prefs.on, host_capacity: prefs.capacity,
        base_address: host.address.trim() || null, base_lat: lat, base_lng: lng,
        hosting_prefs: prefs,
      }));
      appAlert.show('success', 'Saved', prefs.on ? "You'll now see jobs at your place." : 'Hosting is off.');
    } catch (err: any) {
      appAlert.show('error', 'Not saved', err?.message ?? 'Please try again.');
    } finally {
      setSavingHost(false);
    }
  };

  return (
    <ThemedView style={s.container}>
      <StatusBar barStyle="dark-content" />
      <View style={[s.header, { paddingTop: topInset + 12 }]}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <ChevronLeft size={24} color="#111827" />
        </TouchableOpacity>
        <ThemedText style={s.headerTitle}>Rates & hosting</ThemedText>
      </View>
      {loadFailed ? (
        <View style={s.failed}>
          <ThemedText style={s.muted}>Couldn't load your prices.</ThemedText>
          <TouchableOpacity style={[s.primary, { paddingHorizontal: 24 }]} onPress={load}>
            <ThemedText style={s.primaryText}>Try again</ThemedText>
          </TouchableOpacity>
        </View>
      ) : !hosting || !skills ? <ActivityIndicator style={{ marginTop: 40 }} color="#111827" /> : (
        // Keyboard-aware: the field being typed in scrolls up above the keyboard.
        <KeyboardAwareScrollView
          contentContainerStyle={padBottom([s.body, { paddingBottom: 32 }], bottomInset)}
          keyboardShouldPersistTaps="handled"
          bottomOffset={24}
        >
          <View style={s.card}>
            <View style={s.row}>
              <ThemedText style={[s.cardTitle, { flex: 1 }]}>Your usual rates</ThemedText>
              <TouchableOpacity style={s.suggest} onPress={suggestUsual} disabled={suggesting}>
                {suggesting ? <ActivityIndicator size="small" color="#111827" /> : <Sparkles size={13} color="#111827" />}
                <ThemedText style={s.suggestText}>{suggesting ? 'Suggesting…' : 'Suggest for me'}</ThemedText>
              </TouchableOpacity>
            </View>
            <ThemedText style={s.muted}>For ordinary visits — you go to the customer to fix, clean or help.</ThemedText>
            {USUAL.map(({ field, label, hint }) => (
              <View key={field} style={s.rateRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={s.item}>{label}</ThemedText>
                  <ThemedText style={s.hint}>{hint}</ThemedText>
                </View>
                <View style={s.money}>
                  <ThemedText style={s.dollar}>$</ThemedText>
                  <TextInput
                    style={s.moneyInput}
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor="#9CA3AF"
                    value={usual[field]}
                    onChangeText={(t) => setUsual((u) => ({ ...u, [field]: t.replace(/[^0-9.]/g, '') }))}
                  />
                </View>
              </View>
            ))}
            <TouchableOpacity style={s.primary} onPress={saveUsual} disabled={savingUsual}>
              {savingUsual ? <ActivityIndicator color="#111827" /> : <ThemedText style={s.primaryText}>Save</ThemedText>}
            </TouchableOpacity>
          </View>

          <ThemedText style={s.intro}>
            Prices per hour, day or night let you apply to jobs booked for a set time — customers see your total for
            their dates and pay when they book. A week or month price is used for longer stays when it's cheaper, and
            a day price for a long few hours (like daycare). Leave a box empty if you don't offer it.
          </ThemedText>

          {verified.length === 0 && (
            <View style={s.card}>
              <ThemedText style={s.muted}>
                {skills.length === 0
                  ? 'Add your skills from your profile, then set a price for each here.'
                  : 'Prices per hour, day or night open up for a skill once you pass its test in Verification.'}
              </ThemedText>
            </View>
          )}
          {verified.map((sk) => unitsFor(sk).length === 0 ? (
            <View key={sk.skill_id} style={s.card}>
              <ThemedText style={s.cardTitle}>{sk.name}</ThemedText>
              <ThemedText style={s.muted}>
                Priced by quote: your visiting fee (above) when you go to the customer, then your invoice after seeing the job.
              </ThemedText>
            </View>
          ) : (
            <View key={sk.skill_id} style={s.card}>
              <ThemedText style={s.cardTitle}>{sk.name}</ThemedText>
              {unitsFor(sk).map(({ unit, label, hint }) => (
                <View key={unit} style={s.rateRow}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={s.item}>{label}</ThemedText>
                    <ThemedText style={s.hint}>{hint}</ThemedText>
                  </View>
                  <View style={s.money}>
                    <ThemedText style={s.dollar}>$</ThemedText>
                    <TextInput
                      style={s.moneyInput}
                      keyboardType="decimal-pad"
                      // Empty per hour uses the usual hourly rate (set above).
                      placeholder={unit === 'HOUR' && usual.hourly ? usual.hourly : '—'}
                      placeholderTextColor="#9CA3AF"
                      value={drafts[key(sk.skill_id, unit)] ?? ''}
                      onChangeText={(t) => setDrafts((d) => ({ ...d, [key(sk.skill_id, unit)]: t.replace(/[^0-9.]/g, '') }))}
                    />
                  </View>
                </View>
              ))}
              <TouchableOpacity style={s.primary} onPress={() => saveSkill(sk)} disabled={savingSkill === sk.skill_id}>
                {savingSkill === sk.skill_id ? <ActivityIndicator color="#111827" /> : <ThemedText style={s.primaryText}>Save prices</ThemedText>}
              </TouchableOpacity>
            </View>
          ))}
          {verified.length > 0 && waiting.length > 0 && (
            // Their tests are in the Verification tab; prices open up after.
            <View style={[s.row, s.waiting]}>
              <Lock size={14} color="#6B7280" />
              <ThemedText style={[s.hint, { flex: 1 }]}>
                {waiting.map((sk) => sk.name).join(', ')} — pass {waiting.length === 1 ? 'its test' : 'their tests'} in Verification to set prices.
              </ThemedText>
            </View>
          )}

          <View style={s.card}>
            <View style={s.row}>
              <Home size={18} color="#111827" />
              <ThemedText style={[s.cardTitle, { flex: 1 }]}>Customers can come to my place</ThemedText>
              <Toggle value={prefs.on} onChange={(on) => setPrefs((p) => ({ ...p, on }))} />
            </View>
            <ThemedText style={s.muted}>
              For work at your place — and, below, for pets and things they leave with you. Your address is only shown
              to a customer once they've booked you.
            </ThemedText>
            {prefs.on && (
              <>
                <ThemedText style={s.item}>Customers at once</ThemedText>
                <ThemedText style={s.hint}>For visits with nothing left behind — a haircut, a lesson.</ThemedText>
                <Stepper value={prefs.capacity} min={1} max={20} onChange={(capacity) => setPrefs((p) => ({ ...p, capacity }))} />

                {/* Pets: which, how big, how many, and food. */}
                <View style={s.section}>
                  <View style={s.row}>
                    <PawPrint size={16} color="#111827" />
                    <ThemedText style={[s.item, { flex: 1 }]}>I take in pets</ThemedText>
                    <Toggle value={prefs.pets.on} onChange={(on) => setPets({
                      on, kinds: prefs.pets.kinds ?? [], capacity: prefs.pets.capacity ?? 1,
                      max_dog_size: prefs.pets.max_dog_size ?? 'GIANT', provides_food: prefs.pets.provides_food ?? false,
                    })} />
                  </View>
                  {prefs.pets.on && (
                    <>
                      <ThemedText style={s.hint}>Which animals</ThemedText>
                      <View style={s.chips}>
                        {PET_KINDS.map(({ value, label }) => {
                          const on = (prefs.pets.kinds ?? []).includes(value);
                          return (
                            <TouchableOpacity key={value} style={[s.chip, on && s.chipOn]}
                              onPress={() => setPets({ kinds: on ? (prefs.pets.kinds ?? []).filter((k) => k !== value) : [...(prefs.pets.kinds ?? []), value] })}>
                              <ThemedText style={[s.chipText, on && s.chipTextOn]}>{label}</ThemedText>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {(prefs.pets.kinds ?? []).includes('DOG') && (
                        <>
                          <ThemedText style={s.hint}>Biggest dog you take</ThemedText>
                          <View style={s.chips}>
                            {DOG_SIZES.map(({ value, label }) => {
                              const on = (prefs.pets.max_dog_size ?? 'GIANT') === value;
                              return (
                                <TouchableOpacity key={value} style={[s.chip, on && s.chipOn]} onPress={() => setPets({ max_dog_size: value })}>
                                  <ThemedText style={[s.chipText, on && s.chipTextOn]}>{label}</ThemedText>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </>
                      )}
                      <ThemedText style={s.hint}>Pets at once</ThemedText>
                      <Stepper value={prefs.pets.capacity ?? 1} min={1} max={20} onChange={(capacity) => setPets({ capacity })} />
                      <View style={s.row}>
                        <ThemedText style={[s.muted, { flex: 1 }]}>I provide food (otherwise the owner brings it)</ThemedText>
                        <Toggle value={!!prefs.pets.provides_food} onChange={(provides_food) => setPets({ provides_food })} />
                      </View>
                    </>
                  )}
                </View>

                {/* Items: how many and how big. */}
                <View style={s.section}>
                  <View style={s.row}>
                    <Box size={16} color="#111827" />
                    <ThemedText style={[s.item, { flex: 1 }]}>I look after things people leave</ThemedText>
                    <Toggle value={prefs.items.on} onChange={(on) => setItems({
                      on, capacity: prefs.items.capacity ?? 1, max_size: prefs.items.max_size ?? 'BULKY',
                    })} />
                  </View>
                  {prefs.items.on && (
                    <>
                      <ThemedText style={s.hint}>Biggest you take</ThemedText>
                      <View style={s.chips}>
                        {ITEM_SIZES.map(({ value, label }) => {
                          const on = (prefs.items.max_size ?? 'BULKY') === value;
                          return (
                            <TouchableOpacity key={value} style={[s.chip, on && s.chipOn]} onPress={() => setItems({ max_size: value })}>
                              <ThemedText style={[s.chipText, on && s.chipTextOn]}>{label}</ThemedText>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <ThemedText style={s.hint}>Items at once</ThemedText>
                      <Stepper value={prefs.items.capacity ?? 1} min={1} max={100} onChange={(capacity) => setItems({ capacity })} />
                    </>
                  )}
                </View>

                {(prefs.pets.on || prefs.items.on) && (
                  // The price of a stay is each skill's per-night price, set above.
                  <View style={s.nightly}>
                    <View style={s.row}>
                      <Moon size={14} color="#111827" />
                      <ThemedText style={s.item}>Your prices for stays</ThemedText>
                    </View>
                    {nightly.length > 0 ? nightly.map((r) => (
                      <ThemedText key={r.skill_id} style={s.muted}>{skillName(r.skill_id)} — {r.prices}</ThemedText>
                    )) : (
                      <ThemedText style={s.muted}>
                        {verified.length > 0
                          ? `Not set yet — fill in "Per night" on a skill above. That's what customers pay for each night at your place.`
                          : `Pass a skill's test in Verification, then set its "Per night" price here.`}
                      </ThemedText>
                    )}
                  </View>
                )}

                <ThemedText style={s.item}>Your address</ThemedText>
                <TextInput
                  style={s.input}
                  placeholder="Street, city, ZIP"
                  placeholderTextColor="#9CA3AF"
                  value={host.address}
                  onChangeText={(address) => setHost((h) => ({ ...h, address }))}
                />
                <TouchableOpacity style={s.secondary} onPress={useHere} disabled={locating}>
                  {locating ? <ActivityIndicator color="#111827" /> : <LocateFixed size={16} color="#111827" />}
                  <ThemedText style={s.secondaryText}>{host.lat != null ? "I'm at home — update the pin" : "I'm at home — use where I am"}</ThemedText>
                </TouchableOpacity>
                {host.lat == null && (
                  <ThemedText style={s.hint}>Tap this at home — check-ins and pick-ups are confirmed there.</ThemedText>
                )}
              </>
            )}
            <TouchableOpacity style={s.primary} onPress={saveHosting} disabled={savingHost}>
              {savingHost ? <ActivityIndicator color="#111827" /> : <ThemedText style={s.primaryText}>Save</ThemedText>}
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollView>
      )}
      {appAlert.element}
    </ThemedView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  headerTitle: { fontSize: 18, lineHeight: 24, fontFamily: Fonts.poppinsBold, color: '#111827' },
  failed: { alignItems: 'center', gap: 12, marginTop: 48 },
  body: { paddingHorizontal: 16, gap: 12 },
  intro: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppins, color: '#374151' },
  card: { padding: 16, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: '#111827' },
  item: { fontSize: 13.5, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
  hint: { fontSize: 11.5, lineHeight: 16, fontFamily: Fonts.poppins, color: '#6B7280' },
  muted: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppins, color: '#6B7280' },
  waiting: { paddingHorizontal: 4, alignItems: 'flex-start' },
  nightly: { padding: 12, borderRadius: 12, backgroundColor: '#FFF7D6', gap: 4 },
  section: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  chipText: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.poppins, color: '#374151' },
  chipTextOn: { color: '#111827', fontFamily: Fonts.poppinsBold },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#FFF7D6' },
  suggestText: { fontSize: 12, lineHeight: 17, fontFamily: Fonts.poppinsBold, color: '#111827' },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  money: { flexDirection: 'row', alignItems: 'center', width: 96, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 10, backgroundColor: '#F9FAFB' },
  dollar: { fontSize: 15, fontFamily: Fonts.poppinsSemiBold, color: '#6B7280' },
  moneyInput: { flex: 1, paddingVertical: 9, paddingLeft: 4, fontSize: 15, fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, fontSize: 14, fontFamily: Fonts.poppins, color: '#111827', backgroundColor: '#F9FAFB' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  stepValue: { fontSize: 17, lineHeight: 22, fontFamily: Fonts.poppinsBold, color: '#111827', minWidth: 20, textAlign: 'center' },
  primary: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#FFCE48' },
  primaryText: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppinsBold, color: '#111827' },
  secondary: { flexDirection: 'row', gap: 8, paddingVertical: 11, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  secondaryText: { fontSize: 13.5, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
});
