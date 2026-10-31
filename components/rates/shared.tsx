import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { DogSize, HostingPrefs, ItemSize, PetKind, ProviderRate } from '@/services/api';
import { MIN_VISITING_FEE } from '@/services/fees';
import type { MySkill } from '@/services/queries/provider';
import { Minus, Plus } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Switch, TouchableOpacity, View } from 'react-native';

// What Rates & hosting's cards share: units, choices, small controls, styles.

export type Unit = Extract<ProviderRate['unit'], 'HOUR' | 'VISIT' | 'DAY' | 'NIGHT' | 'WEEK' | 'MONTH'>;
export type Notify = (type: 'success' | 'error', title: string, message: string) => void;

// The prices a job can be booked at up front (docs/JOB_SHAPE_DESIGN.md) — in
// the words a provider thinks in, with an example of each.
export const UNITS: { unit: Unit; label: string; hint: string }[] = [
  { unit: 'HOUR', label: 'Per hour', hint: 'Booked by the hour. Empty uses your usual hourly rate' },
  { unit: 'VISIT', label: 'Per visit', hint: 'One set price for a visit or session' },
  { unit: 'DAY', label: 'Per day', hint: "Over days at the customer's place, or a full day at yours (like daycare)" },
  { unit: 'NIGHT', label: 'Per night', hint: 'Stays at your place — e.g. pet boarding (turn on hosting below)' },
  // Long stays: used by themselves when they come out cheaper than the nights
  // or days (skofy-backend/app/domain/rate_card.py best_price).
  { unit: 'WEEK', label: 'Per week', hint: 'Optional — for stays of 7 nights or days and more' },
  { unit: 'MONTH', label: 'Per month', hint: 'Optional — for stays of 30 and more, like storage' },
];

export const USUAL: { field: 'fee' | 'hourly'; label: string; hint: string }[] = [
  { field: 'fee', label: 'Visiting fee', hint: `Covers your trip — at least $${MIN_VISITING_FEE}` },
  { field: 'hourly', label: 'Hourly rate', hint: 'For the work itself' },
];

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
export const unitsFor = (sk: MySkill) => {
  const allowed = sk.pricing ? UNITS_BY_PRICING[sk.pricing] : null;
  return allowed ? UNITS.filter((u) => allowed.includes(u.unit)) : UNITS.filter((u) => u.unit !== 'VISIT');
};

// What a host takes in (skofy-backend/app/domain/care_sheet.py).
export const PET_KINDS: { value: PetKind; label: string }[] = [
  { value: 'DOG', label: 'Dogs' }, { value: 'CAT', label: 'Cats' }, { value: 'BIRD', label: 'Birds' },
  { value: 'SMALL_PET', label: 'Small pets' }, { value: 'REPTILE', label: 'Reptiles' },
  { value: 'FISH', label: 'Fish' }, { value: 'OTHER', label: 'Other' },
];
export const DOG_SIZES: { value: DogSize; label: string }[] = [
  { value: 'SMALL', label: 'Small' }, { value: 'MEDIUM', label: 'Medium' },
  { value: 'LARGE', label: 'Large' }, { value: 'GIANT', label: 'Any size' },
];
export const ITEM_SIZES: { value: ItemSize; label: string }[] = [
  { value: 'SMALL', label: 'Bag' }, { value: 'MEDIUM', label: 'Box' },
  { value: 'LARGE', label: 'Car trunk' }, { value: 'BULKY', label: 'Van' },
];
export const NO_HOSTING: HostingPrefs = { on: false, capacity: 1, pets: { on: false }, items: { on: false } };

/** A price typed into a box: digits and one point. */
export const priceText = (t: string) => t.replace(/[^0-9.]/g, '');

export function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <View style={rs.stepper}>
      <TouchableOpacity style={rs.stepBtn} onPress={() => onChange(Math.max(min, value - 1))}>
        <Minus size={16} color="#111827" />
      </TouchableOpacity>
      <ThemedText style={rs.stepValue}>{value}</ThemedText>
      <TouchableOpacity style={rs.stepBtn} onPress={() => onChange(Math.min(max, value + 1))}>
        <Plus size={16} color="#111827" />
      </TouchableOpacity>
    </View>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  // Colours set: Android's default thumb is its own teal-green.
  return <Switch value={value} onValueChange={onChange} trackColor={{ false: '#D1D5DB', true: '#FFCE48' }} thumbColor="#fff" />;
}

export const rs = StyleSheet.create({
  card: { padding: 16, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: '#111827' },
  item: { fontSize: 13.5, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
  hint: { fontSize: 11.5, lineHeight: 16, fontFamily: Fonts.poppins, color: '#6B7280' },
  muted: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppins, color: '#6B7280' },
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
