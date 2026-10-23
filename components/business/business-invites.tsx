import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { BusinessInvite } from '@/services/api';
import { CheckSquare, MapPin, ShieldCheck, Square } from 'lucide-react-native';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Badge, Button, C, Monogram, Section, u } from './ui';

const ROLE_WORDS: Record<string, string> = { DISPATCHER: 'Dispatcher', WORKER: 'Worker', OWNER: 'Owner' };

interface Props {
  invites: BusinessInvite[];
  onAnswer: (invite: BusinessInvite, accept: boolean, acknowledged: boolean, authorizedCheck: boolean) => Promise<void>;
}

// Invites to join a business's team. Joining means the business can see your
// location while you're on its jobs — the notice is shown in full and must be
// accepted (docs/BUSINESS_PROVIDERS_DESIGN.md §5).
export function BusinessInvites({ invites, onAnswer }: Props) {
  return (
    <>
      {invites.map((invite) => <InviteCard key={invite.id} invite={invite} onAnswer={onAnswer} />)}
    </>
  );
}

function InviteCard({ invite, onAnswer }: { invite: BusinessInvite; onAnswer: Props['onAnswer'] }) {
  const [agreed, setAgreed] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const ready = agreed && (!invite.needs_check || authorized);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const answer = async (accept: boolean) => {
    setBusy(accept ? 'accept' : 'decline');
    try {
      await onAnswer(invite, accept, agreed, authorized);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="Team invite">
      <View style={s.head}>
        <Monogram name={invite.business_name} size={48} />
        <View style={{ flex: 1, gap: 4 }}>
          <ThemedText style={s.title}>{invite.business_name}</ThemedText>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Badge label={ROLE_WORDS[invite.role]} tone="brand" />
            {invite.invited_by && <ThemedText style={u.muted} numberOfLines={1}>from {invite.invited_by}</ThemedText>}
          </View>
        </View>
      </View>
      {invite.needs_check && <ThemedText style={u.body}>Dodorez runs a background check first — at no cost to you.</ThemedText>}

      <Consent icon={<MapPin size={16} color={C.warn} />} title="Your location" text={invite.notice}
        checked={agreed} onToggle={() => setAgreed((a) => !a)} label="I've read this and agree" />
      {invite.needs_check && invite.check_disclosure && (
        <Consent icon={<ShieldCheck size={16} color={C.warn} />} title="Background check" text={invite.check_disclosure}
          checked={authorized} onToggle={() => setAuthorized((a) => !a)} label="I authorise Dodorez to get this background check" />
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button kind="secondary" label="Decline" onPress={() => answer(false)} busy={busy === 'decline'} disabled={!!busy} style={{ flex: 1 }} />
        <Button label="Join the team" onPress={() => answer(true)} busy={busy === 'accept'} disabled={!ready || !!busy} style={{ flex: 1 }} />
      </View>
    </Section>
  );
}

function Consent({ icon, title, text, checked, onToggle, label }: {
  icon: React.ReactNode; title: string; text: string; checked: boolean; onToggle: () => void; label: string;
}) {
  return (
    <View style={s.consent}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{icon}<ThemedText style={s.consentTitle}>{title}</ThemedText></View>
      <ThemedText style={s.consentText}>{text}</ThemedText>
      <TouchableOpacity style={s.check} onPress={onToggle} activeOpacity={0.7}>
        {checked ? <CheckSquare size={20} color={C.ink} /> : <Square size={20} color={C.faint} />}
        <ThemedText style={[u.label, { flex: 1 }]}>{label}</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 17, lineHeight: 23, fontFamily: Fonts.poppinsBold, color: C.ink },
  consent: { padding: 14, borderRadius: 14, backgroundColor: C.warnSoft, gap: 8 },
  consentTitle: { fontSize: 13.5, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: C.warn },
  consentText: { fontSize: 12.5, lineHeight: 19, fontFamily: Fonts.poppins, color: '#78350F' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F5D9A8' },
});
