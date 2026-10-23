import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { MyBusinessState } from '@/hooks/use-my-business';
import { router } from 'expo-router';
import { Briefcase, ChevronRight, Map as MapIcon, Users } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Badge, Button, C, Monogram, Tone, u } from './ui';

const go = (path: string) => router.push(path as any);

// The business on the home screen (docs/BUSINESS_PROVIDERS_DESIGN.md) — so an
// owner runs the team from where they start their day, not from settings.
// Shows nothing for someone with no business and no invite.
export function BusinessHomeCard({ state }: { state: MyBusinessState }) {
  const { data, invites, board, canDispatch } = state;
  if (!data?.enabled) return null;
  const business = data.business;

  if (!business) {
    if (invites.length === 0) return null;
    return (
      <Line name={invites[0].business_name} title={`${invites[0].business_name} invited you`}
        badge={{ label: 'Team invite', tone: 'brand' }}
        detail={invites.length > 1 ? `And ${invites.length - 1} more — tap to answer` : 'Tap to see and answer'} />
    );
  }

  if (business.status !== 'APPROVED') {
    if (data.role !== 'OWNER') return null;
    const inReview = business.status === 'PENDING_REVIEW';
    const toDo = business.missing.filter((m) => !m.startsWith('Approval')).length;
    return (
      <Line name={business.name} title={business.name}
        badge={inReview ? { label: 'In review', tone: 'info' } : business.status === 'REJECTED' ? { label: 'Needs changes', tone: 'bad' } : { label: 'Setting up', tone: 'neutral' }}
        detail={inReview ? "We'll let you know — usually within 2 business days"
          : toDo ? `${toDo} ${toDo === 1 ? 'step' : 'steps'} left before your team can take jobs` : 'Ready to send for review'} />
    );
  }

  if (!canDispatch) {
    return (
      <Line name={business.name} title={business.name} badge={{ label: data.role === 'DISPATCHER' ? 'Dispatcher' : 'Worker', tone: 'brand' }}
        detail={data.works_for_self ? 'Its jobs show under Ongoing. You take your own too.' : 'Jobs it gives you show under Ongoing'} />
    );
  }

  const open = board?.open.filter((j) => !j.applied).length ?? 0;
  const active = board?.active.length ?? 0;
  return (
    <View style={[u.card, s.card]}>
      <TouchableOpacity style={s.head} activeOpacity={0.7} onPress={() => go('/business')}>
        <Monogram name={business.name} size={40} />
        <View style={{ flex: 1 }}>
          <ThemedText style={s.title} numberOfLines={1}>{business.name}</ThemedText>
          {business.ready_for_on_site_work ? <ThemedText style={u.muted}>Your team</ThemedText>
            : <ThemedText style={[u.muted, { color: C.warn }]}>Needs attention — tap to fix</ThemedText>}
        </View>
        <ChevronRight size={18} color={C.faint} />
      </TouchableOpacity>
      <View style={s.stats}>
        <Stat value={open} label={open === 1 ? 'open job for the team' : 'open jobs for the team'} hot={open > 0} />
        <Stat value={active} label="under way" />
      </View>
      <View style={s.actions}>
        <Button label="Team jobs" icon={<Briefcase size={16} color={C.ink} />} onPress={() => go('/business-jobs')} style={{ flex: 1, height: 44 }} />
        <Button kind="secondary" label="Team map" icon={<MapIcon size={16} color={C.ink} />} onPress={() => go('/business-map')} style={{ flex: 1, height: 44 }} />
      </View>
    </View>
  );
}

function Line({ name, title, badge, detail }: { name: string; title: string; badge: { label: string; tone: Tone }; detail: string }) {
  return (
    <TouchableOpacity style={[u.card, s.card, s.line]} activeOpacity={0.8} onPress={() => go('/business')}>
      <Monogram name={name} size={40} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ThemedText style={[s.title, { flexShrink: 1 }]} numberOfLines={1}>{title}</ThemedText>
          <Badge {...badge} />
        </View>
        <ThemedText style={u.muted} numberOfLines={2}>{detail}</ThemedText>
      </View>
      {badge.label === 'Team invite' ? <Users size={18} color={C.faint} /> : <ChevronRight size={18} color={C.faint} />}
    </TouchableOpacity>
  );
}

function Stat({ value, label, hot }: { value: number; label: string; hot?: boolean }) {
  return (
    <View style={[s.stat, hot && s.statHot]}>
      <ThemedText style={s.statValue}>{value}</ThemedText>
      <ThemedText style={u.muted} numberOfLines={1}>{label}</ThemedText>
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginBottom: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 15.5, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: C.ink },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: C.bg },
  statHot: { backgroundColor: C.brandSoft },
  statValue: { fontSize: 22, lineHeight: 28, fontFamily: Fonts.poppinsBold, color: C.ink },
  actions: { flexDirection: 'row', gap: 10 },
});
