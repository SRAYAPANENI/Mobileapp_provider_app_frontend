import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { Briefcase, Check, EyeOff, ShieldBan } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { C, Section, u } from './ui';

interface Props {
  /** The owner sets whether members may; a member sets whether they do. */
  who: 'owner' | 'member';
  businessName: string;
  value: boolean;
  busy: boolean;
  onChange: (on: boolean) => void;
}

// One person, two hats (docs/BUSINESS_PROVIDERS_DESIGN.md §7): whether team
// members can also take jobs for themselves on Dodorez, alongside the
// business's. Spelled out, since the rules behind it (never the business's
// customers, the owner never sees those jobs) are what make it safe to allow.
export function OwnWorkSetting({ who, businessName, value, busy, onChange }: Props) {
  const owner = who === 'owner';
  const title = owner ? 'Members’ own jobs' : 'Take jobs for myself too';
  const state = owner
    ? value ? 'On — each member chooses for themselves' : `Off — members only work through ${businessName}`
    : value ? 'On — you also get your own jobs' : `Off — you only work through ${businessName}`;

  return (
    <Section title={owner ? 'Team rules' : 'Your own work'}>
      <View style={s.head}>
        <View style={s.icon}><Briefcase size={18} color={C.ink} /></View>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText style={s.title}>{title}</ThemedText>
          <ThemedText style={[u.muted, value && { color: C.ok }]}>{state}</ThemedText>
        </View>
        <Switch value={value} disabled={busy} onValueChange={onChange} trackColor={{ true: C.brand, false: '#E2E8F0' }} />
      </View>
      <View style={s.rules}>
        <Rule icon={<Check size={14} color={C.ok} />}
          text={owner ? 'If on, members can turn on their own jobs in their app — on top of the jobs you give them.'
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
  rules: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: C.bg },
  rule: { flexDirection: 'row', gap: 8 },
});
