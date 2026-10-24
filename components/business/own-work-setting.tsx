import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { TeamMember } from '@/services/api';
import { Briefcase, Check, EyeOff, ShieldBan, Users } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { C, Monogram, Section, Toggle, u } from './ui';

interface Props {
  /** The owner sets whether members may; a member sets whether they do. */
  who: 'owner' | 'member';
  businessName: string;
  /** Owner: "all members"; member: their own switch. */
  value: boolean;
  busy: boolean;
  onChange: (on: boolean) => void;
  /** Owner: the team, each with their own setting. */
  members?: TeamMember[];
  /** Owner: the member whose setting is being saved. */
  busyMemberId?: string | null;
  onMemberChange?: (member: TeamMember, on: boolean) => void;
}

const ROLE: Record<string, string> = { DISPATCHER: 'Dispatcher', WORKER: 'Worker' };

// One person, two hats (docs/BUSINESS_PROVIDERS_DESIGN.md §7): whether team
// members can also take jobs for themselves on Dodorez, alongside the
// business's. The owner allows it for everyone or person by person; a member
// then chooses for themselves. Spelled out, since the rules behind it (never
// the business's customers, the owner never sees those jobs) are what make
// it safe to allow.
export function OwnWorkSetting({ who, businessName, value, busy, onChange, members, busyMemberId, onMemberChange }: Props) {
  const owner = who === 'owner';
  const team = (members ?? []).filter((m) => m.role !== 'OWNER');
  const allowedCount = team.filter((m) => m.own_work_allowed).length;

  const title = owner ? 'All members' : 'Take jobs for myself too';
  const state = owner
    ? value ? 'On — everyone, and people who join later'
      : team.length && allowedCount ? `${allowedCount} of ${team.length} allowed — choose below` : 'Off — choose person by person below'
    : value ? 'On — you also get your own jobs' : `Off — you only work through ${businessName}`;

  return (
    <Section title={owner ? 'Members’ own jobs' : 'Your own work'}>
      <ThemedText style={u.muted}>
        {owner ? 'Let team members also take jobs for themselves on Dodorez, as well as the ones you give them.'
          : `${businessName} lets you take jobs for yourself too, alongside the ones it gives you.`}
      </ThemedText>

      <View style={s.head}>
        <View style={s.icon}>{owner ? <Users size={18} color={C.ink} /> : <Briefcase size={18} color={C.ink} />}</View>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText style={s.title}>{title}</ThemedText>
          <ThemedText style={u.muted}>{state}</ThemedText>
        </View>
        {busy ? <ActivityIndicator color={C.ink} /> : <Toggle value={value} onChange={onChange} />}
      </View>

      {owner && team.length > 0 && (
        <View style={s.list}>
          {team.map((m, i) => (
            <View key={m.id} style={[s.member, i < team.length - 1 && s.line]}>
              <Monogram name={m.name ?? m.phone} size={34} tone={m.status === 'INVITED' ? 'neutral' : 'brand'} />
              <View style={{ flex: 1 }}>
                <ThemedText style={u.label} numberOfLines={1}>{m.name ?? m.phone}</ThemedText>
                <ThemedText style={u.muted}>{m.status === 'INVITED' ? 'Invited' : ROLE[m.role] ?? m.role}</ThemedText>
              </View>
              {busyMemberId === m.id ? <ActivityIndicator color={C.ink} />
                : <Toggle value={!!m.own_work_allowed} disabled={busy} onChange={(on) => onMemberChange?.(m, on)} />}
            </View>
          ))}
        </View>
      )}
      {owner && team.length === 0 && (
        <ThemedText style={u.muted}>Invite people to your team, then choose for each of them here.</ThemedText>
      )}

      <View style={s.rules}>
        <Rule icon={<Check size={14} color={C.ok} />}
          text={owner ? 'An allowed member chooses for themselves in their app whether to take their own jobs.'
            : 'Your own jobs show in your feed next to the ones the team gives you.'} />
        <Rule icon={<ShieldBan size={14} color={C.warn} />}
          text={owner ? `They can never work for ${businessName}’s customers — anyone they served for you in the last 12 months.`
            : `Never for ${businessName}’s customers — anyone you served for them in the last 12 months.`} />
        <Rule icon={<EyeOff size={14} color={C.muted} />}
          text={owner ? 'Their own jobs, earnings and location stay private — you don’t see them.'
            : `${businessName} doesn’t see your own jobs, earnings or location.`} />
      </View>
    </Section>
  );
}

function Rule({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View style={s.rule}>
      <View style={{ marginTop: 3 }}>{icon}</View>
      <ThemedText style={[u.muted, { flex: 1 }]}>{text}</ThemedText>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brandSoft },
  title: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsSemiBold, color: C.ink },
  list: { borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  line: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  rules: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: C.bg },
  rule: { flexDirection: 'row', gap: 8 },
});
