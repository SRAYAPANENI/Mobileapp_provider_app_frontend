import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { MemberRole, Team, TeamMember } from '@/services/api';
import { Users } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

const ROLE_LABEL: Record<MemberRole, string> = { OWNER: 'Owner', DISPATCHER: 'Dispatcher', WORKER: 'Worker' };
const CHECK_LABEL: Record<string, { text: string; color: string }> = {
  CLEAR: { text: 'Background check clear', color: '#065F46' },
  PENDING: { text: 'Background check running', color: '#92400E' },
  CONSIDER: { text: 'Background check being reviewed', color: '#92400E' },
  FAILED: { text: "Background check didn't clear", color: '#B91C1C' },
  NOT_STARTED: { text: 'No background check yet', color: '#6B7280' },
};

interface Props {
  team: Team;
  canManage: boolean;
  onInvite: (phone: string, role: MemberRole) => Promise<void>;
  onChangeRole: (member: TeamMember, role: MemberRole) => void;
  onRemove: (member: TeamMember) => void;
}

// The team: who's on it and their checks, and — for the owner — inviting
// people by phone, changing roles and removing them. A member can do jobs
// once their ID is verified and their background check is clear.
export function TeamSection({ team, canManage, onInvite, onChangeRole, onRemove }: Props) {
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<MemberRole>('WORKER');
  const [inviting, setInviting] = useState(false);

  const invite = async () => {
    setInviting(true);
    try {
      await onInvite(phone.trim(), role);
      setPhone('');
    } catch {
      // shown by the screen; the number stays for fixing
    } finally {
      setInviting(false);
    }
  };

  return (
    <View style={s.card}>
      <View style={s.row}><Users size={18} color="#111827" /><ThemedText style={s.title}>Team</ThemedText></View>
      {team.members.map((m) => {
        const check = CHECK_LABEL[m.background_check_status ?? 'NOT_STARTED'];
        return (
          <View key={m.id} style={s.member}>
            <View style={{ flex: 1, gap: 2 }}>
              <ThemedText style={s.name}>{m.name ?? m.phone}{m.status === 'INVITED' ? ' — invited' : ''}</ThemedText>
              <ThemedText style={s.muted}>{ROLE_LABEL[m.role]}{m.name && m.phone ? ` · ${m.phone}` : ''}</ThemedText>
              {m.status === 'ACTIVE' && (
                <>
                  <ThemedText style={[s.small, { color: m.is_identity_verified ? '#065F46' : '#92400E' }]}>
                    {m.is_identity_verified ? 'ID verified' : 'ID not verified yet'}
                  </ThemedText>
                  <ThemedText style={[s.small, { color: check.color }]}>{check.text}</ThemedText>
                </>
              )}
            </View>
            {canManage && m.role !== 'OWNER' && (
              <View style={{ gap: 6, alignItems: 'flex-end' }}>
                {m.status === 'ACTIVE' && (
                  <TouchableOpacity onPress={() => onChangeRole(m, m.role === 'WORKER' ? 'DISPATCHER' : 'WORKER')}>
                    <ThemedText style={s.link}>Make {m.role === 'WORKER' ? 'dispatcher' : 'worker'}</ThemedText>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => onRemove(m)}>
                  <ThemedText style={[s.link, { color: '#B91C1C' }]}>{m.status === 'INVITED' ? 'Cancel invite' : 'Remove'}</ThemedText>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}

      {canManage && (
        <View style={s.invite}>
          <ThemedText style={s.label}>Invite someone</ThemedText>
          <TextInput style={s.input} value={phone} onChangeText={setPhone} placeholder="Their phone, e.g. (512) 555-0100"
            keyboardType="phone-pad" placeholderTextColor="#9CA3AF" />
          <View style={s.row}>
            {(['WORKER', 'DISPATCHER'] as MemberRole[]).map((r) => (
              <TouchableOpacity key={r} style={[s.chip, role === r && s.chipOn]} onPress={() => setRole(r)}>
                <ThemedText style={[s.chipText, role === r && s.chipTextOn]}>{ROLE_LABEL[r]}</ThemedText>
              </TouchableOpacity>
            ))}
          </View>
          <ThemedText style={s.muted}>
            A dispatcher assigns jobs and sees the team; a worker does the jobs they're given. Dodorez runs a background
            check for anyone without a clear one: {team.free_checks_left > 0
              ? `${team.free_checks_left} more free, then $${team.check_cost.toFixed(2)} each`
              : `$${team.check_cost.toFixed(2)} each`}, taken from your payouts only if it clears.
          </ThemedText>
          <TouchableOpacity style={[s.primary, phone.trim().length < 10 && s.dim]} onPress={invite} disabled={phone.trim().length < 10 || inviting}>
            {inviting ? <ActivityIndicator color="#111827" /> : <ThemedText style={s.primaryText}>Send invite</ThemedText>}
          </TouchableOpacity>
        </View>
      )}

      {canManage && team.check_charges.length > 0 && (
        <View style={s.invite}>
          <ThemedText style={s.label}>Background checks</ThemedText>
          {team.check_charges.map((c) => (
            <ThemedText key={c.id} style={s.muted}>
              {c.name} — {c.status === 'PENDING' ? 'running' : c.free ? 'free' : c.status === 'WAIVED' ? 'not charged'
                : `$${c.amount.toFixed(2)}${c.status === 'DEDUCTED' ? ', paid from a payout' : ', from your next payout'}`}
            </ThemedText>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { padding: 16, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: '#111827' },
  member: { flexDirection: 'row', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  name: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
  muted: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppins, color: '#6B7280' },
  small: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.poppinsSemiBold },
  link: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.poppinsSemiBold, color: '#2563EB' },
  invite: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  label: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: '#374151' },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, fontSize: 14, fontFamily: Fonts.poppins, color: '#111827', backgroundColor: '#F9FAFB' },
  chip: { flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  chipText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppins, color: '#374151' },
  chipTextOn: { fontFamily: Fonts.poppinsBold, color: '#111827' },
  primary: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#FFCE48' },
  primaryText: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppinsBold, color: '#111827' },
  dim: { opacity: 0.5 },
});
