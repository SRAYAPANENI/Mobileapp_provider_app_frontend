import { ThemedText } from '@/components/themed-text';
import { useDraft } from '@/hooks/use-draft';
import { Hosting, HostingPrefs, ProviderRate } from '@/services/api';
import { MySkill, useSaveHosting } from '@/services/queries/provider';
import * as Location from 'expo-location';
import { Box, Home, LocateFixed, Moon, PawPrint } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, TextInput, TouchableOpacity, View } from 'react-native';
import { DOG_SIZES, ITEM_SIZES, NO_HOSTING, Notify, PET_KINDS, Stepper, Toggle, rs } from './shared';

interface HostDraft { prefs: HostingPrefs; address: string; lat: number | null; lng: number | null }
const asDraft = (h: Hosting): HostDraft => ({
  prefs: h.hosting_prefs ?? NO_HOSTING, address: h.base_address ?? '', lat: h.base_lat, lng: h.base_lng,
});

const STAY_WORD: Record<string, string> = { NIGHT: 'night', WEEK: 'week', MONTH: 'month' };

interface Props {
  hosting: Hosting;
  /** Verified skills — for the stay prices summary. */
  verified: MySkill[];
  notify: Notify;
}

/** Whether customers can come to the provider's place, what they take in,
 * and where — its own draft and save. */
export const HostingCard = React.memo(function HostingCard({ hosting, verified, notify }: Props) {
  const { draft, edit, saved } = useDraft<HostDraft>(asDraft(hosting), (d) => JSON.stringify(d));
  const [locating, setLocating] = useState(false);
  const save = useSaveHosting();
  const { prefs } = draft;
  const setPrefs = (fn: (p: HostingPrefs) => HostingPrefs) => edit((d) => ({ ...d, prefs: fn(d.prefs) }));
  const setPets = (patch: Partial<HostingPrefs['pets']>) => setPrefs((p) => ({ ...p, pets: { ...p.pets, ...patch } }));
  const setItems = (patch: Partial<HostingPrefs['items']>) => setPrefs((p) => ({ ...p, items: { ...p.items, ...patch } }));

  // What a stay at their place costs: each skill's per-night price, and its
  // week and month prices for long stays.
  const nightly = Object.entries(
    hosting.rates.filter((r: ProviderRate) => r.unit in STAY_WORD)
      .reduce((bySkill: Record<string, string[]>, r: ProviderRate) => {
        (bySkill[r.skill_id] ??= []).push(`$${r.amount}/${STAY_WORD[r.unit]}`);
        return bySkill;
      }, {}),
  ).map(([skill_id, prices]) => ({ skill_id, prices: prices.join(' · ') }));
  const skillName = (id: string) => verified.find((sk) => sk.skill_id === id)?.name ?? 'A skill';

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
        : draft.address;
      edit((d) => ({ ...d, lat: loc.coords.latitude, lng: loc.coords.longitude, address: address || d.address }));
    } catch (err: any) {
      notify('error', 'Location', err?.message ?? 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  };

  const onSave = async () => {
    try {
      if (prefs.on && prefs.pets.on && !(prefs.pets.kinds ?? []).length) {
        throw new Error('Choose which animals you take in.');
      }
      let { lat, lng } = draft;
      // Typed, not pinned: find it on the map.
      if (prefs.on && lat == null && draft.address.trim()) {
        const [hit] = await Location.geocodeAsync(draft.address.trim()).catch(() => []);
        if (hit) ({ latitude: lat, longitude: lng } = hit);
        if (lat == null) throw new Error("We couldn't find that address on the map. Check it, or tap \"I'm at home\" to pin where you are.");
      }
      await save.mutateAsync({
        hosts_at_home: prefs.on, host_capacity: prefs.capacity,
        base_address: draft.address.trim() || null, base_lat: lat, base_lng: lng,
        hosting_prefs: prefs,
      });
      saved();
      notify('success', 'Saved', prefs.on ? "You'll now see jobs at your place." : 'Hosting is off.');
    } catch (err: any) {
      notify('error', 'Not saved', err?.message ?? 'Please try again.');
    }
  };

  return (
    <View style={rs.card}>
      <View style={rs.row}>
        <Home size={18} color="#111827" />
        <ThemedText style={[rs.cardTitle, { flex: 1 }]}>Customers can come to my place</ThemedText>
        <Toggle value={prefs.on} onChange={(on) => setPrefs((p) => ({ ...p, on }))} />
      </View>
      <ThemedText style={rs.muted}>
        For work at your place — and, below, for pets and things they leave with you. Your address is only shown
        to a customer once they've booked you.
      </ThemedText>
      {prefs.on && (
        <>
          <ThemedText style={rs.item}>Customers at once</ThemedText>
          <ThemedText style={rs.hint}>For visits with nothing left behind — a haircut, a lesson.</ThemedText>
          <Stepper value={prefs.capacity} min={1} max={20} onChange={(capacity) => setPrefs((p) => ({ ...p, capacity }))} />

          {/* Pets: which, how big, how many, and food. */}
          <View style={rs.section}>
            <View style={rs.row}>
              <PawPrint size={16} color="#111827" />
              <ThemedText style={[rs.item, { flex: 1 }]}>I take in pets</ThemedText>
              <Toggle value={prefs.pets.on} onChange={(on) => setPets({
                on, kinds: prefs.pets.kinds ?? [], capacity: prefs.pets.capacity ?? 1,
                max_dog_size: prefs.pets.max_dog_size ?? 'GIANT', provides_food: prefs.pets.provides_food ?? false,
              })} />
            </View>
            {prefs.pets.on && (
              <>
                <ThemedText style={rs.hint}>Which animals</ThemedText>
                <View style={rs.chips}>
                  {PET_KINDS.map(({ value, label }) => {
                    const on = (prefs.pets.kinds ?? []).includes(value);
                    return (
                      <TouchableOpacity key={value} style={[rs.chip, on && rs.chipOn]}
                        onPress={() => setPets({ kinds: on ? (prefs.pets.kinds ?? []).filter((k) => k !== value) : [...(prefs.pets.kinds ?? []), value] })}>
                        <ThemedText style={[rs.chipText, on && rs.chipTextOn]}>{label}</ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {(prefs.pets.kinds ?? []).includes('DOG') && (
                  <>
                    <ThemedText style={rs.hint}>Biggest dog you take</ThemedText>
                    <View style={rs.chips}>
                      {DOG_SIZES.map(({ value, label }) => {
                        const on = (prefs.pets.max_dog_size ?? 'GIANT') === value;
                        return (
                          <TouchableOpacity key={value} style={[rs.chip, on && rs.chipOn]} onPress={() => setPets({ max_dog_size: value })}>
                            <ThemedText style={[rs.chipText, on && rs.chipTextOn]}>{label}</ThemedText>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}
                <ThemedText style={rs.hint}>Pets at once</ThemedText>
                <Stepper value={prefs.pets.capacity ?? 1} min={1} max={20} onChange={(capacity) => setPets({ capacity })} />
                <View style={rs.row}>
                  <ThemedText style={[rs.muted, { flex: 1 }]}>I provide food (otherwise the owner brings it)</ThemedText>
                  <Toggle value={!!prefs.pets.provides_food} onChange={(provides_food) => setPets({ provides_food })} />
                </View>
              </>
            )}
          </View>

          {/* Items: how many and how big. */}
          <View style={rs.section}>
            <View style={rs.row}>
              <Box size={16} color="#111827" />
              <ThemedText style={[rs.item, { flex: 1 }]}>I look after things people leave</ThemedText>
              <Toggle value={prefs.items.on} onChange={(on) => setItems({
                on, capacity: prefs.items.capacity ?? 1, max_size: prefs.items.max_size ?? 'BULKY',
              })} />
            </View>
            {prefs.items.on && (
              <>
                <ThemedText style={rs.hint}>Biggest you take</ThemedText>
                <View style={rs.chips}>
                  {ITEM_SIZES.map(({ value, label }) => {
                    const on = (prefs.items.max_size ?? 'BULKY') === value;
                    return (
                      <TouchableOpacity key={value} style={[rs.chip, on && rs.chipOn]} onPress={() => setItems({ max_size: value })}>
                        <ThemedText style={[rs.chipText, on && rs.chipTextOn]}>{label}</ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <ThemedText style={rs.hint}>Items at once</ThemedText>
                <Stepper value={prefs.items.capacity ?? 1} min={1} max={100} onChange={(capacity) => setItems({ capacity })} />
              </>
            )}
          </View>

          {(prefs.pets.on || prefs.items.on) && (
            // The price of a stay is each skill's per-night price, set above.
            <View style={rs.nightly}>
              <View style={rs.row}>
                <Moon size={14} color="#111827" />
                <ThemedText style={rs.item}>Your prices for stays</ThemedText>
              </View>
              {nightly.length > 0 ? nightly.map((r) => (
                <ThemedText key={r.skill_id} style={rs.muted}>{skillName(r.skill_id)} — {r.prices}</ThemedText>
              )) : (
                <ThemedText style={rs.muted}>
                  {verified.length > 0
                    ? `Not set yet — fill in "Per night" on a skill above. That's what customers pay for each night at your place.`
                    : `Pass a skill's test in Verification, then set its "Per night" price here.`}
                </ThemedText>
              )}
            </View>
          )}

          <ThemedText style={rs.item}>Your address</ThemedText>
          <TextInput
            style={rs.input}
            placeholder="Street, city, ZIP"
            placeholderTextColor="#9CA3AF"
            value={draft.address}
            // A typed address is found on the map when saved, not the old pin.
            onChangeText={(address) => edit((d) => ({ ...d, address, lat: null, lng: null }))}
          />
          <TouchableOpacity style={rs.secondary} onPress={useHere} disabled={locating}>
            {locating ? <ActivityIndicator color="#111827" /> : <LocateFixed size={16} color="#111827" />}
            <ThemedText style={rs.secondaryText}>{draft.lat != null ? "I'm at home — update the pin" : "I'm at home — use where I am"}</ThemedText>
          </TouchableOpacity>
          {draft.lat == null && (
            <ThemedText style={rs.hint}>Tap this at home — check-ins and pick-ups are confirmed there.</ThemedText>
          )}
        </>
      )}
      <TouchableOpacity style={rs.primary} onPress={onSave} disabled={save.isPending}>
        {save.isPending ? <ActivityIndicator color="#111827" /> : <ThemedText style={rs.primaryText}>Save</ThemedText>}
      </TouchableOpacity>
    </View>
  );
});
