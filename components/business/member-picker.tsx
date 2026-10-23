import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { TeamMember } from '@/services/api';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

/** Whether a member can be given a job — the server's rule (can_do_jobs), shown up front. */
export function canDoJobs(m: TeamMember): boolean {
  return m.status === 'ACTIVE' && !!m.is_identity_verified && m.background_check_status === 'CLEAR';
}

interface Props {
  members: TeamMember[];
  selectedId: string | null;
  onSelect: (member: TeamMember) => void;
  /** Members the job reached — listed first. */
  preferredIds?: string[];
  excludeId?: string | null;
}

// Choosing who on the team does a job. Only members who can do jobs (ID
// verified, background check clear) can be picked; the rest say why not.
export function MemberPicker({ members, selectedId, onSelect, preferredIds = [], excludeId }: Props) {
  const list = members
    .filter((m) => m.status === 'ACTIVE' && m.provider_id && m.provider_id !== excludeId)
    .sort((a, b) => Number(preferredIds.includes(b.provider_id!)) - Number(preferredIds.includes(a.provider_id!)));
  if (list.length === 0) return <ThemedText style={s.muted}>No one else on the team yet.</ThemedText>;
  return (
    <View style={s.wrap}>
      {list.map((m) => {
        const able = canDoJobs(m);
        const on = selectedId === m.provider_id;
        return (
          <TouchableOpacity key={m.id} style={[s.row, on && s.rowOn, !able && s.dim]} disabled={!able} onPress={() => onSelect(m)}>
            <View style={{ flex: 1 }}>
              <ThemedText style={s.name}>{m.name ?? m.phone}</ThemedText>
              <ThemedText style={s.muted}>
                {!able ? (m.is_identity_verified ? "Background check hasn't cleared" : 'ID not verified yet')
                  : preferredIds.includes(m.provider_id!) ? 'This job reached them' : m.role === 'DISPATCHER' ? 'Dispatcher' : 'Worker'}
              </ThemedText>
            </View>
            {on && <ThemedText style={s.check}>✓</ThemedText>}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  rowOn: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  name: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
  muted: { fontSize: 12, lineHeight: 17, fontFamily: Fonts.poppins, color: '#6B7280' },
  check: { fontSize: 16, fontFamily: Fonts.poppinsBold, color: '#111827' },
  dim: { opacity: 0.5 },
});
