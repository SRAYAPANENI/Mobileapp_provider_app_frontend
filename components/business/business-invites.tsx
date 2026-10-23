import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { BusinessInvite } from '@/services/api';
import { CheckSquare, MapPin, ShieldCheck, Square } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';

const ROLE_WORDS: Record<string, string> = { DISPATCHER: 'a dispatcher', WORKER: 'a worker', OWNER: 'the owner' };

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
    <View style={s.card}>
      <ThemedText style={s.title}>{invite.business_name} invited you</ThemedText>
      <ThemedText style={s.body}>
        Join their team as {ROLE_WORDS[invite.role]}{invite.invited_by ? ` — invited by ${invite.invited_by}` : ''}.
        {invite.needs_check ? ' Dodorez runs a background check first — at no cost to you.' : ''}
      </ThemedText>
      <View style={s.notice}>
        <View style={s.row}><MapPin size={15} color="#92400E" /><ThemedText style={s.noticeTitle}>Your location</ThemedText></View>
        <ThemedText style={s.noticeText}>{invite.notice}</ThemedText>
      </View>
      <TouchableOpacity style={s.row} onPress={() => setAgreed((a) => !a)}>
        {agreed ? <CheckSquare size={20} color="#111827" /> : <Square size={20} color="#9CA3AF" />}
        <ThemedText style={s.body}>I've read this and agree</ThemedText>
      </TouchableOpacity>
      {invite.needs_check && invite.check_disclosure && (
        <>
          <View style={s.notice}>
            <View style={s.row}><ShieldCheck size={15} color="#92400E" /><ThemedText style={s.noticeTitle}>Background check</ThemedText></View>
            <ThemedText style={s.noticeText}>{invite.check_disclosure}</ThemedText>
          </View>
          <TouchableOpacity style={s.row} onPress={() => setAuthorized((a) => !a)}>
            {authorized ? <CheckSquare size={20} color="#111827" /> : <Square size={20} color="#9CA3AF" />}
            <ThemedText style={s.body}>I authorise Dodorez to get this background check</ThemedText>
          </TouchableOpacity>
        </>
      )}
      <View style={s.row}>
        <TouchableOpacity style={s.secondary} onPress={() => answer(false)} disabled={!!busy}>
          {busy === 'decline' ? <ActivityIndicator color="#374151" /> : <ThemedText style={s.secondaryText}>Decline</ThemedText>}
        </TouchableOpacity>
        <TouchableOpacity style={[s.primary, !ready && s.dim]} onPress={() => answer(true)} disabled={!ready || !!busy}>
          {busy === 'accept' ? <ActivityIndicator color="#111827" /> : <ThemedText style={s.primaryText}>Join the team</ThemedText>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { padding: 16, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FDE68A', gap: 10 },
  title: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: '#111827' },
  body: { flex: 1, fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppins, color: '#374151' },
  notice: { padding: 12, borderRadius: 12, backgroundColor: '#FFFBEB', gap: 6 },
  noticeTitle: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: '#92400E' },
  noticeText: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppins, color: '#92400E' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primary: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#FFCE48' },
  primaryText: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppinsBold, color: '#111827' },
  secondary: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#F3F4F6' },
  secondaryText: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: '#374151' },
  dim: { opacity: 0.5 },
});
