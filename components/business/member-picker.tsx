import { ThemedText } from '@/components/themed-text';
import { TeamMember } from '@/services/api';
import { Check } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Badge, C, Monogram, u } from './ui';
import { inHours } from './work-hours';

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
  /** When the job's work happens: someone not in their work hours then can't
   * be given it (docs/EMPLOYER_PARTNERS_DESIGN.md) — the server's rule too. */
  workTime?: Date | null;
}

/** Not in their agreed hours at `at`: false when the phone can't tell. */
function outOfHours(m: TeamMember, at: Date | null | undefined): boolean {
  const agreed = m.hours?.agreed;
  return !!(at && agreed && m.role !== 'OWNER' && inHours(agreed, at) === false);
}

// Choosing who on the team does a job. Only members who can do jobs (ID
// verified, background check clear) and are in their work hours for it can
// be picked; the rest say why not.
export function MemberPicker({ members, selectedId, onSelect, preferredIds = [], excludeId, workTime }: Props) {
  const list = members
    .filter((m) => m.status === 'ACTIVE' && m.provider_id && m.provider_id !== excludeId)
    .sort((a, b) => Number(preferredIds.includes(b.provider_id!)) - Number(preferredIds.includes(a.provider_id!)));
  if (list.length === 0) return <ThemedText style={u.muted}>No one else on the team yet.</ThemedText>;
  return (
    <View style={s.wrap}>
      {list.map((m) => {
        const offHours = outOfHours(m, workTime);
        const able = canDoJobs(m) && !offHours;
        const on = selectedId === m.provider_id;
        const reached = preferredIds.includes(m.provider_id!);
        return (
          <TouchableOpacity key={m.id} style={[s.row, on && s.rowOn, !able && s.dim]} disabled={!able} onPress={() => onSelect(m)} activeOpacity={0.8}>
            <Monogram name={m.name ?? m.phone} size={36} tone={on ? 'brand' : 'neutral'} />
            <View style={{ flex: 1, gap: 2 }}>
              <ThemedText style={u.label}>{m.name ?? m.phone}</ThemedText>
              <ThemedText style={u.muted}>
                {offHours ? `Not their hours then · ${m.hours?.agreed_label ?? ''}`
                  : !able ? (m.is_identity_verified ? "Background check hasn't cleared" : 'ID not verified yet')
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
