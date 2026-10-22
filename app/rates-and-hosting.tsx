import { useAppAlert } from '@/components/app-alert';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { padBottom, useBottomInset } from '@/hooks/use-bottom-inset';
import { Hosting, ProviderRate, SkoFyApi } from '@/services/api';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft, Home, LocateFixed, Minus, Plus } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Switch, TextInput, TouchableOpacity, View } from 'react-native';

type Unit = 'HOUR' | 'DAY' | 'NIGHT';

// The three ways a job is priced up front (docs/JOB_SHAPE_DESIGN.md) — in the
// words a provider thinks in, with an example of each.
const UNITS: { unit: Unit; label: string; hint: string }[] = [
  { unit: 'HOUR', label: 'Per hour', hint: 'A few hours — e.g. pet sitting, tutoring, help at home' },
  { unit: 'DAY', label: 'Per day', hint: "Looking after things at the customer's place over days" },
  { unit: 'NIGHT', label: 'Per night', hint: 'Stays at your place — e.g. pet boarding (turn on hosting below)' },
];

interface Skill { skill_id: string; name: string; is_verified: boolean }

const key = (skillId: string, unit: Unit) => `${skillId}:${unit}`;

// Your prices for jobs priced up front, and whether customers can bring
// things (a pet, an item) to your place. Customers see your total for their
// dates before they choose — no quoting back and forth.
export default function RatesAndHostingScreen() {
  const bottomInset = useBottomInset();
  const appAlert = useAppAlert();
  const [hosting, setHosting] = useState<Hosting | null>(null);
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingSkill, setSavingSkill] = useState<string | null>(null);
  const [host, setHost] = useState({ on: false, capacity: 1, address: '', lat: null as number | null, lng: null as number | null });
  const [savingHost, setSavingHost] = useState(false);
  const [locating, setLocating] = useState(false);

  const apply = (h: Hosting) => {
    setHosting(h);
    setDrafts(Object.fromEntries(h.rates.map((r) => [key(r.skill_id, r.unit as Unit), String(r.amount)])));
    setHost({ on: h.hosts_at_home, capacity: h.host_capacity || 1, address: h.base_address ?? '', lat: h.base_lat, lng: h.base_lng });
  };

  const load = useCallback(() => {
    SkoFyApi.hosting.mine().then(apply).catch(() => appAlert.show('error', 'Could not load', 'Please try again.'));
    SkoFyApi.skills.getMySkills()
      .then((list: any) => setSkills((Array.isArray(list) ? list : []).filter((s: Skill) => s.is_verified)))
      .catch(() => setSkills([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFocusEffect(load);

  const savedAmount = (skillId: string, unit: Unit) =>
    hosting?.rates.find((r: ProviderRate) => r.skill_id === skillId && r.unit === unit)?.amount;

  const saveSkill = async (skillId: string) => {
    setSavingSkill(skillId);
    try {
      let latest: Hosting | null = null;
      for (const { unit } of UNITS) {
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
      let { lat, lng } = host;
      // Typed, not pinned: find it on the map.
      if (host.on && lat == null && host.address.trim()) {
        const [hit] = await Location.geocodeAsync(host.address.trim()).catch(() => []);
        if (hit) ({ latitude: lat, longitude: lng } = hit);
      }
      apply(await SkoFyApi.hosting.update({
        hosts_at_home: host.on, host_capacity: host.capacity,
        base_address: host.address.trim() || null, base_lat: lat, base_lng: lng,
      }));
      appAlert.show('success', 'Saved', host.on ? "You'll now see jobs at your place." : 'Hosting is off.');
    } catch (err: any) {
      appAlert.show('error', 'Not saved', err?.message ?? 'Please try again.');
    } finally {
      setSavingHost(false);
    }
  };

  return (
    <ThemedView style={s.container}>
      <StatusBar barStyle="dark-content" />
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <ChevronLeft size={24} color="#111827" />
        </TouchableOpacity>
        <ThemedText style={s.headerTitle}>Rates & hosting</ThemedText>
      </View>
      {!hosting || !skills ? <ActivityIndicator style={{ marginTop: 40 }} color="#111827" /> : (
        <ScrollView contentContainerStyle={padBottom([s.body, { paddingBottom: 32 }], bottomInset)} keyboardShouldPersistTaps="handled">
          <ThemedText style={s.intro}>
            Set your price per hour, day or night and you can apply to jobs booked for a set time — customers see your
            total for their dates and pay when they book. Leave a box empty if you don't offer it.
          </ThemedText>

          {skills.length === 0 && (
            <View style={s.card}>
              <ThemedText style={s.muted}>Pass a skill test first — you can set prices for skills you're verified in.</ThemedText>
            </View>
          )}
          {skills.map((sk) => (
            <View key={sk.skill_id} style={s.card}>
              <ThemedText style={s.cardTitle}>{sk.name}</ThemedText>
              {UNITS.map(({ unit, label, hint }) => (
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
                      placeholder="—"
                      placeholderTextColor="#9CA3AF"
                      value={drafts[key(sk.skill_id, unit)] ?? ''}
                      onChangeText={(t) => setDrafts((d) => ({ ...d, [key(sk.skill_id, unit)]: t.replace(/[^0-9.]/g, '') }))}
                    />
                  </View>
                </View>
              ))}
              <TouchableOpacity style={s.primary} onPress={() => saveSkill(sk.skill_id)} disabled={savingSkill === sk.skill_id}>
                {savingSkill === sk.skill_id ? <ActivityIndicator color="#111827" /> : <ThemedText style={s.primaryText}>Save prices</ThemedText>}
              </TouchableOpacity>
            </View>
          ))}

          <View style={s.card}>
            <View style={s.row}>
              <Home size={18} color="#111827" />
              <ThemedText style={[s.cardTitle, { flex: 1 }]}>Customers can bring things to my place</ThemedText>
              <Switch value={host.on} onValueChange={(on) => setHost((h) => ({ ...h, on }))} trackColor={{ true: '#FFCE48' }} />
            </View>
            <ThemedText style={s.muted}>
              For boarding a pet or minding an item at your home. Your address is only shown to a customer once they've booked you.
            </ThemedText>
            {host.on && (
              <>
                <ThemedText style={s.item}>How many at once?</ThemedText>
                <View style={s.stepper}>
                  <TouchableOpacity style={s.stepBtn} onPress={() => setHost((h) => ({ ...h, capacity: Math.max(1, h.capacity - 1) }))}>
                    <Minus size={16} color="#111827" />
                  </TouchableOpacity>
                  <ThemedText style={s.stepValue}>{host.capacity}</ThemedText>
                  <TouchableOpacity style={s.stepBtn} onPress={() => setHost((h) => ({ ...h, capacity: Math.min(20, h.capacity + 1) }))}>
                    <Plus size={16} color="#111827" />
                  </TouchableOpacity>
                </View>
                <ThemedText style={s.item}>Where customers bring it</ThemedText>
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
  intro: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppins, color: '#374151' },
  card: { padding: 16, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: '#111827' },
  item: { fontSize: 13.5, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
  hint: { fontSize: 11.5, lineHeight: 16, fontFamily: Fonts.poppins, color: '#6B7280' },
  muted: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppins, color: '#6B7280' },
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
