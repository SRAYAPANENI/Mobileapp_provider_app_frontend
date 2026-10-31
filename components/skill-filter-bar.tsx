import { Fonts } from '@/constants/theme';
import { Bell, BellRing, Check, Lock } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/scaled-text';

export interface SkillRef { skill_id: string; name: string }
export interface MySkill { skill_id: string; name: string; is_verified: boolean }

interface Props {
  /** The open jobs the provider can browse (All Jobs, before filtering). */
  jobs: { skills?: string[]; skillRefs?: SkillRef[] }[];
  mySkills: MySkill[];
  selected: string | null;
  onSelect: (skill: string | null) => void;
  /** A skill jobs nearby need that the provider hasn't verified yet. */
  onLockedPress: (skill: SkillRef, jobCount: number) => void;
  /** How many skills job alerts are limited to (0 = all). */
  alertCount: number;
  onAlertsPress: () => void;
}

// The provider's verified skills as filters for the All Jobs feed, with a
// live count each — skills with jobs first, empty ones greyed at the end —
// then "locked" chips for skills nearby jobs need that they haven't
// verified yet: tapping one offers the skill test. The bell opens job alerts.
//
// A provider can have hundreds of skills: the chips are a list drawn as it
// scrolls, and the bar redraws only when its own inputs change — drawn all at
// once, it slowed Home on every change and on switching back from the team.
type Item =
  | { kind: 'bell' }
  | { kind: 'all' }
  | { kind: 'skill'; name: string; count: number }
  | { kind: 'locked'; ref: SkillRef; count: number };

const keyOf = (it: Item) =>
  it.kind === 'skill' ? `s:${it.name}` : it.kind === 'locked' ? `l:${it.ref.skill_id}` : it.kind;

export const SkillFilterBar = React.memo(function SkillFilterBar({ jobs, mySkills, selected, onSelect, onLockedPress, alertCount, onAlertsPress }: Props) {
  const { verified, locked } = useMemo(() => {
    const countBySkill = new Map<string, number>();
    const refByName = new Map<string, SkillRef>();
    for (const job of jobs) {
      for (const name of new Set(job.skills ?? [])) countBySkill.set(name, (countBySkill.get(name) ?? 0) + 1);
      for (const ref of job.skillRefs ?? []) refByName.set(ref.name, ref);
    }
    const verifiedNames = new Set(mySkills.filter(s => s.is_verified).map(s => s.name));
    const verified = [...verifiedNames]
      .map(name => ({ name, count: countBySkill.get(name) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const locked = [...countBySkill.entries()]
      .filter(([name]) => !verifiedNames.has(name) && refByName.has(name))
      .map(([name, count]) => ({ ref: refByName.get(name)!, count }))
      .sort((a, b) => b.count - a.count);
    return { verified, locked };
  }, [jobs, mySkills]);

  const items = useMemo<Item[]>(() => [
    { kind: 'bell' }, { kind: 'all' },
    ...verified.map(({ name, count }) => ({ kind: 'skill' as const, name, count })),
    ...locked.map(({ ref, count }) => ({ kind: 'locked' as const, ref, count })),
  ], [verified, locked]);

  if (verified.length === 0 && locked.length === 0) return null;

  const renderItem = ({ item }: { item: Item }) => {
    switch (item.kind) {
      case 'bell':
        return (
          <TouchableOpacity
            style={[s.bell, alertCount > 0 && s.bellOn]}
            onPress={onAlertsPress}
            accessibilityLabel={alertCount > 0 ? `Job alerts for ${alertCount} skills` : 'Job alerts for all skills'}
          >
            {alertCount > 0 ? <BellRing size={15} color="#111827" /> : <Bell size={15} color="#6B7280" />}
            {alertCount > 0 && <Text style={s.bellText}>{alertCount}</Text>}
          </TouchableOpacity>
        );
      case 'all':
        return <Chip label="All" count={jobs.length} active={selected === null} onPress={() => onSelect(null)} />;
      case 'skill':
        return (
          <Chip
            label={item.name}
            count={item.count}
            active={selected === item.name}
            dim={item.count === 0}
            verified
            onPress={() => onSelect(selected === item.name ? null : item.name)}
          />
        );
      case 'locked':
        return (
          <TouchableOpacity style={[s.chip, s.lockedChip]} onPress={() => onLockedPress(item.ref, item.count)}>
            <Lock size={11} color="#9CA3AF" />
            <Text style={s.lockedText} numberOfLines={1}>{item.ref.name}</Text>
            <Text style={s.lockedCount}>{item.count}</Text>
          </TouchableOpacity>
        );
    }
  };

  return (
    <View style={s.wrap}>
      <FlatList
        horizontal
        data={items}
        keyExtractor={keyOf}
        renderItem={renderItem}
        extraData={`${selected}|${alertCount}|${jobs.length}`}
        ItemSeparatorComponent={Gap}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.row}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
      />
    </View>
  );
});

const Gap = () => <View style={{ width: 8 }} />;

function Chip({ label, count, active, dim, verified, onPress }: {
  label: string; count: number; active: boolean; dim?: boolean; verified?: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[s.chip, active && s.chipActive, dim && !active && s.chipDim]} onPress={onPress}>
      {verified && <Check size={11} color={active ? '#111827' : '#10B981'} strokeWidth={3} />}
      <Text style={[s.chipText, active && s.chipTextActive]} numberOfLines={1}>{label}</Text>
      <View style={[s.count, active && s.countActive]}>
        <Text style={[s.countText, active && s.countTextActive]}>{count}</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: 8, marginHorizontal: -20 },
  row: { paddingHorizontal: 20, alignItems: 'center' },
  bell: {
    height: 34, minWidth: 34, paddingHorizontal: 9, borderRadius: 17, flexDirection: 'row', gap: 4,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6',
  },
  bellOn: { backgroundColor: '#FFCE48' },
  bellText: { fontSize: 12, fontFamily: Fonts.poppinsBold, color: '#111827' },
  chip: {
    height: 34, paddingHorizontal: 12, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', maxWidth: 220,
  },
  chipActive: { backgroundColor: '#FFCE48', borderColor: '#FFCE48' },
  chipDim: { opacity: 0.45 },
  chipText: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.poppinsSemiBold, color: '#374151', flexShrink: 1 },
  chipTextActive: { color: '#111827' },
  count: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  countActive: { backgroundColor: 'rgba(17,24,39,0.12)' },
  countText: { fontSize: 11, fontFamily: Fonts.poppinsBold, color: '#6B7280' },
  countTextActive: { color: '#111827' },
  lockedChip: { borderStyle: 'dashed', borderColor: '#D1D5DB', backgroundColor: '#FAFAFA' },
  lockedText: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.poppinsSemiBold, color: '#9CA3AF', flexShrink: 1 },
  lockedCount: { fontSize: 11, fontFamily: Fonts.poppinsBold, color: '#9CA3AF' },
});
