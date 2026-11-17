import { ThemedText } from '@/components/themed-text';
import { VehicleIcon } from '@/components/vehicles/vehicle-icon';
import { Fonts } from '@/constants/theme';
import { VehicleRoom } from '@/services/api';
import { router } from 'expo-router';
import { Briefcase, ChevronRight, House, MapPinned } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { RateGroup, rs } from './shared';

// The building blocks of Rates & hosting's three sections — your skills,
// Pickup & Delivery, stays and hosting (app/rates-and-hosting.tsx).

export const SECTION_INFO: Record<RateGroup, { title: string; short: string; about: string; tint: string; ink: string }> = {
  SKILLS: {
    title: 'Your skills', short: 'Skills',
    about: 'Priced by the hour or the visit — customers see your price and book. Quoted work is priced by your invoice after the visit.',
    tint: '#EFF6FF', ink: '#1D4ED8',
  },
  TRIP: {
    title: 'Pickup & Delivery', short: 'Delivery',
    about: 'A fare for each trip: your base fare plus a price per mile, extras by size, and waiting. Customers see your exact fare before they hire you.',
    tint: '#FFF7DB', ink: '#7A5600',
  },
  STAYS: {
    title: 'Stays, day care & hosting', short: 'Stays',
    about: 'Priced by the night or the day — at the customer’s place, or at yours if you host. Week and month prices are used for long stays when cheaper.',
    tint: '#ECFDF5', ink: '#047857',
  },
};

function GroupIcon({ group, size = 18 }: { group: RateGroup; size?: number }) {
  const color = SECTION_INFO[group].ink;
  if (group === 'TRIP') return <MapPinned size={size} color={color} />;
  if (group === 'STAYS') return <House size={size} color={color} />;
  return <Briefcase size={size} color={color} />;
}

/** Where a section stands, in a word and a colour. */
export interface SectionStatus { label: string; tone: 'ok' | 'warn' | 'off' }
const TONE = {
  ok: { fg: '#047857', bg: '#ECFDF5' },
  warn: { fg: '#B45309', bg: '#FFFBEB' },
  off: { fg: '#6B7280', bg: '#F3F4F6' },
};

export function statusOf(total: number, missing: number, offLabel: string): SectionStatus {
  if (total === 0) return { label: offLabel, tone: 'off' };
  if (missing > 0) return { label: `${missing} need${missing === 1 ? 's' : ''} a price`, tone: 'warn' };
  return { label: total === 1 ? 'Priced' : `All ${total} priced`, tone: 'ok' };
}

function Pill({ status }: { status: SectionStatus }) {
  const t = TONE[status.tone];
  return (
    <View style={[s.pill, { backgroundColor: t.bg }]}>
      <ThemedText style={[s.pillText, { color: t.fg }]}>{status.label}</ThemedText>
    </View>
  );
}

/** At the top: the three sections at a glance — tap one to show only it
 * (with hundreds of skills, scrolling to Delivery or Stays meant passing them
 * all); tap it again, or "Show all", for everything. */
export function Overview({ statuses, selected, onPick }: {
  statuses: Record<RateGroup, SectionStatus | null>;
  selected: RateGroup | null;
  onPick: (g: RateGroup | null) => void;
}) {
  const groups = (Object.keys(SECTION_INFO) as RateGroup[]).filter((g) => statuses[g]);
  return (
    <View style={{ gap: 8 }}>
      <View style={s.overview}>
        {groups.map((g) => {
          const on = selected === g;
          return (
            <TouchableOpacity
              key={g}
              style={[s.tile, { backgroundColor: SECTION_INFO[g].tint }, on && { borderColor: SECTION_INFO[g].ink }, selected && !on && s.tileDim]}
              onPress={() => onPick(on ? null : g)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${SECTION_INFO[g].title}: ${statuses[g]!.label}${on ? ', showing only this' : ''}`}
            >
              <GroupIcon group={g} size={20} />
              <ThemedText style={s.tileTitle} numberOfLines={1}>{SECTION_INFO[g].short}</ThemedText>
              <ThemedText style={[s.tileStatus, { color: TONE[statuses[g]!.tone].fg }]} numberOfLines={2}>{statuses[g]!.label}</ThemedText>
            </TouchableOpacity>
          );
        })}
      </View>
      {selected && (
        <View style={s.filterRow}>
          <ThemedText style={s.filterText}>Showing {SECTION_INFO[selected].title} only</ThemedText>
          <TouchableOpacity onPress={() => onPick(null)} hitSlop={8} accessibilityRole="button">
            <ThemedText style={s.filterAll}>Show all</ThemedText>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/** A section's heading: what it is, what it's for, and where it stands. */
export function SectionHead({ group, status }: { group: RateGroup; status: SectionStatus }) {
  const info = SECTION_INFO[group];
  return (
    <View style={s.head}>
      <View style={s.headRow}>
        <View style={[s.headIcon, { backgroundColor: info.tint }]}><GroupIcon group={group} /></View>
        <ThemedText style={s.headTitle}>{info.title}</ThemedText>
        <Pill status={status} />
      </View>
      <ThemedText style={rs.muted}>{info.about}</ThemedText>
    </View>
  );
}

/** Pickup & Delivery off: switch it on here (it needs a verified ID, not a test). */
export function OfferDelivery({ busy, onOffer }: { busy: boolean; onOffer: () => void }) {
  return (
    <View style={rs.card}>
      <ThemedText style={rs.cardTitle}>You don't do pickups and deliveries yet</ThemedText>
      <ThemedText style={rs.muted}>
        Collect from a store or a person and drop it off — a quick way to earn between jobs. It needs your ID verified,
        not a test.
      </ThemedText>
      <TouchableOpacity style={rs.primary} onPress={onOffer} disabled={busy}>
        {busy ? <ActivityIndicator color="#111827" /> : <ThemedText style={rs.primaryText}>Offer Pickup & Delivery</ThemedText>}
      </TouchableOpacity>
    </View>
  );
}

/** Car-trunk and van loads: the vehicle that backs those prices, or what's needed. */
export function VehicleRoomCard({ room }: { room: VehicleRoom | undefined }) {
  if (!room) return null;
  const rows: { size: 'LARGE' | 'BULKY'; label: string; icon: string }[] = [
    { size: 'LARGE', label: 'Car-trunk loads', icon: 'CAR' },
    { size: 'BULKY', label: 'Van-size loads', icon: 'CARGO_VAN' },
  ];
  return (
    <TouchableOpacity style={rs.card} onPress={() => router.push('/vehicles' as any)} activeOpacity={0.8}
      accessibilityRole="link" accessibilityLabel="My vehicles">
      <View style={rs.row}>
        <ThemedText style={[rs.cardTitle, { flex: 1 }]}>Your vehicles</ThemedText>
        <ThemedText style={s.link}>My vehicles</ThemedText>
        <ChevronRight size={16} color="#2563EB" />
      </View>
      {rows.map(({ size, label, icon }) => {
        const r = room[size];
        const tone = r.status === 'READY' ? TONE.ok : r.status === 'PENDING' ? TONE.warn : TONE.off;
        return (
          <View key={size} style={rs.row}>
            <VehicleIcon type={icon} size={18} color="#374151" />
            <View style={{ flex: 1 }}>
              <ThemedText style={rs.item}>{label}</ThemedText>
              <ThemedText style={rs.hint}>{r.vehicle ? `In ${r.vehicle}` : `Needs ${r.needs} we've checked`}</ThemedText>
            </View>
            <View style={[s.pill, { backgroundColor: tone.bg }]}>
              <ThemedText style={[s.pillText, { color: tone.fg }]}>
                {r.status === 'READY' ? 'Reaches you' : r.status === 'PENDING' ? 'Being checked' : 'Not yet'}
              </ThemedText>
            </View>
          </View>
        );
      })}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  overview: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, borderRadius: 16, padding: 12, gap: 4, borderWidth: 2, borderColor: 'transparent' },
  tileDim: { opacity: 0.55 },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  filterText: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: '#4B5563' },
  filterAll: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: '#0369A1' },
  tileTitle: { fontSize: 13.5, lineHeight: 19, fontFamily: Fonts.poppinsBold, color: '#111827', marginTop: 4 },
  tileStatus: { fontSize: 11.5, lineHeight: 15, fontFamily: Fonts.poppinsSemiBold },
  head: { gap: 6, paddingTop: 22, paddingBottom: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headTitle: { flex: 1, fontSize: 17, lineHeight: 23, fontFamily: Fonts.poppinsBold, color: '#111827' },
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 11.5, lineHeight: 16, fontFamily: Fonts.poppinsSemiBold },
  link: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: '#2563EB' },
});
