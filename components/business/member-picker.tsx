import { ThemedText } from '@/components/themed-text';
import { TeamMember } from '@/services/api';
import { Check } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Badge, C, Monogram, u } from './ui';

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
  if (list.length === 0) return <ThemedText style={u.muted}>No one else on the team yet.</ThemedText>;
  return (
    <View style={s.wrap}>
      {list.map((m) => {
        const able = canDoJobs(m);
        const on = selectedId === m.provider_id;
        const reached = preferredIds.includes(m.provider_id!);
        return (
          <TouchableOpacity key={m.id} style={[s.row, on && s.rowOn, !able && s.dim]} disabled={!able} onPress={() => onSelect(m)} activeOpacity={0.8}>
            <Monogram name={m.name ?? m.phone} size={36} tone={on ? 'brand' : 'neutral'} />
            <View style={{ flex: 1, gap: 2 }}>
              <ThemedText style={u.label}>{m.name ?? m.phone}</ThemedText>
              <ThemedText style={u.muted}>
                {!able ? (m.is_identity_verified ? "Background check hasn't cleared" : 'ID not verified yet')
                  : m.leave_at ? `Leaving ${new Date(m.leave_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — only jobs before then`
                  : m.role === 'DISPATCHER' ? 'Dispatcher' : m.role === 'OWNER' ? 'Owner' : 'Worker'}
              </ThemedText>
            </View>
            {able && reached && <Badge label="Matched" tone="ok" />}
            <View style={[s.radio, on && s.radioOn]}>{on && <Check size={13} color="#FFFFFF" strokeWidth={3} />}</View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#DDE1E7', backgroundColor: C.card },
  rowOn: { borderColor: C.ink, borderWidth: 1.5 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#CBD2DB', alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: C.ink, borderColor: C.ink },
  dim: { opacity: 0.45 },
});
