import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { NearbyBusiness } from '@/services/api';
import { kmToMiles } from '@/services/schedulingEngine';
import { BadgeCheck, Briefcase, ShieldCheck, Sparkles, Star, Users } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Badge, C } from './ui';

// A business as a provider deciding whether to join sees it — its record,
// never its people (docs/BUSINESS_DISCOVERY_DESIGN.md). Shared by Businesses
// near you and the business's own page.

/** "Under 1 mi away", "12 mi away". The server sends it in whole
 * kilometres — it's to the owner's own location, often their home, so it's
 * never exact enough to find them by — and it's said that roughly here too. */
export function milesAway(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(Number(km))) return null;
  const mi = kmToMiles(Number(km));
  return mi < 1 ? 'Under 1 mi away' : `${Math.round(mi)} mi away`;
}

/** "★ 4.8 (37) · 120 jobs done · 5 on the team" — or, before any job,
 * "New on Dodorez" (never a 0.0 that reads as a bad one). */
export function RecordLine({ business }: { business: NearbyBusiness }) {
  const isNew = business.jobs_completed === 0 && business.review_count === 0;
  return (
    <View style={s.line}>
      {isNew ? (
        <View style={s.item}>
          <Sparkles size={13} color={C.brandInk} />
          <ThemedText style={[s.text, { color: C.brandInk }]}>New on Dodorez</ThemedText>
        </View>
      ) : (
        <>
          {business.avg_rating != null && (
            <View style={s.item}>
              <Star size={13} color="#D97706" fill="#F59E0B" />
              <ThemedText style={s.strong}>{business.avg_rating.toFixed(1)}</ThemedText>
              <ThemedText style={s.text}>({business.review_count})</ThemedText>
            </View>
          )}
          <View style={s.item}>
            <Briefcase size={13} color={C.muted} />
            <ThemedText style={s.text}>{business.jobs_completed} job{business.jobs_completed === 1 ? '' : 's'} done</ThemedText>
          </View>
        </>
      )}
      <View style={s.item}>
        <Users size={13} color={C.muted} />
        <ThemedText style={s.text}>{business.team_size} on the team</ThemedText>
      </View>
    </View>
  );
}

/** Verified (every listed business is — only approved ones are shown), insured when it is. */
export function TrustBadges({ business }: { business: NearbyBusiness }) {
  return (
    <View style={s.badges}>
      <Badge icon={<BadgeCheck size={11} color={C.ok} />} label="Verified by Dodorez" tone="ok" />
      {business.insured && <Badge icon={<ShieldCheck size={11} color={C.info} />} label="Insured" tone="info" />}
    </View>
  );
}

/** The kinds of work it does — its jobs first, then its team's skills. */
export function TradeChips({ trades }: { trades: string[] }) {
  if (!trades.length) return null;
  return (
    <View style={s.badges}>
      {trades.map((t) => (
        <View key={t} style={s.chip}><ThemedText style={s.chipText} numberOfLines={1}>{t}</ThemedText></View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 12, rowGap: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  text: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.poppins, color: C.muted },
  strong: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.poppinsBold, color: C.ink },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#F1F5F9', maxWidth: '100%' },
  chipText: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.poppinsSemiBold, color: C.body },
});
