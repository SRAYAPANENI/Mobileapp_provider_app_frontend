import { ThemedText } from '@/components/themed-text';
import { MemberRole, Team, TeamMember } from '@/services/api';
import { MoreHorizontal, UserPlus } from 'lucide-react-native';
import React, { useState } from 'react';
import { TextInput, TouchableOpacity, View } from 'react-native';
import { Badge, Button, C, Field, Monogram, Row, Section, Tone, u } from './ui';

const ROLE_LABEL: Record<MemberRole, string> = { OWNER: 'Owner', DISPATCHER: 'Dispatcher', WORKER: 'Worker' };
const CHECK: Record<string, { text: string; tone: Tone }> = {
  CLEAR: { text: 'Check clear', tone: 'ok' },
  PENDING: { text: 'Check running', tone: 'info' },
  CONSIDER: { text: 'Check in review', tone: 'warn' },
  FAILED: { text: "Check didn't clear", tone: 'bad' },
  NOT_STARTED: { text: 'No check yet', tone: 'neutral' },
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const active = team.members.filter((m) => m.status === 'ACTIVE').length;

  return (
    <>
      <Section title={`Team · ${active}`} flush
        action={canManage && !inviteOpen ? (
          <Button small kind="ghost" label="Invite" icon={<UserPlus size={16} color={C.info} />} onPress={() => setInviteOpen(true)} />
        ) : undefined}>
        {team.members.map((m, i) => {
          const check = CHECK[m.background_check_status ?? 'NOT_STARTED'];
          const manageable = canManage && m.role !== 'OWNER';
          return (
            <View key={m.id}>
              <Row last={i === team.members.length - 1 && open !== m.id}
                icon={<Monogram name={m.name ?? m.phone} size={38} tone={m.status === 'INVITED' ? 'neutral' : 'brand'} />}
                tone="neutral"
                title={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <ThemedText style={u.label} numberOfLines={1}>{m.name ?? m.phone}</ThemedText>
                    <Badge label={m.status === 'INVITED' ? 'Invited' : ROLE_LABEL[m.role]} tone={m.role === 'OWNER' ? 'brand' : 'neutral'} />
                  </View>
                }
                detail={m.status === 'ACTIVE' ? (
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                    <Badge label={m.is_identity_verified ? 'ID verified' : 'ID not verified'} tone={m.is_identity_verified ? 'ok' : 'warn'} />
                    <Badge label={check.text} tone={check.tone} />
                  </View>
                ) : m.phone ?? undefined}
                right={manageable ? (
                  <TouchableOpacity hitSlop={10} onPress={() => setOpen(open === m.id ? null : m.id)}>
                    <MoreHorizontal size={20} color={C.muted} />
                  </TouchableOpacity>
                ) : undefined}
              />
              {open === m.id && (
                <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 12, paddingLeft: 50 }}>
                  {m.status === 'ACTIVE' && (
                    <Button small kind="secondary" label={`Make ${m.role === 'WORKER' ? 'dispatcher' : 'worker'}`}
                      onPress={() => { setOpen(null); onChangeRole(m, m.role === 'WORKER' ? 'DISPATCHER' : 'WORKER'); }} />
                  )}
                  <Button small kind="danger" label={m.status === 'INVITED' ? 'Cancel invite' : 'Remove'}
                    onPress={() => { setOpen(null); onRemove(m); }} />
                </View>
              )}
            </View>
          );
        })}
      </Section>

      {canManage && inviteOpen && (
        <InviteForm team={team} onInvite={onInvite} onClose={() => setInviteOpen(false)} />
      )}

      {canManage && team.check_charges.length > 0 && (
        <Section title="Background checks" flush>
          {team.check_charges.map((c, i) => (
            <Row key={c.id} last={i === team.check_charges.length - 1} title={c.name ?? 'Member'}
              detail={c.status === 'PENDING' ? 'Running' : c.free ? 'Free' : c.status === 'WAIVED' ? 'Not charged'
                : c.status === 'DEDUCTED' ? 'Paid from a payout' : 'From your next payout'}
              right={<ThemedText style={u.label}>{c.free || c.status === 'WAIVED' ? '$0' : `$${c.amount.toFixed(2)}`}</ThemedText>} />
          ))}
        </Section>
      )}
    </>
  );
}

function InviteForm({ team, onInvite, onClose }: { team: Team; onInvite: Props['onInvite']; onClose: () => void }) {
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<MemberRole>('WORKER');
  const [inviting, setInviting] = useState(false);

  const invite = async () => {
    setInviting(true);
    try {
      await onInvite(phone.trim(), role);
      onClose();
    } catch {
      // shown by the screen; the number stays for fixing
    } finally {
      setInviting(false);
    }
  };

  return (
    <Section title="Invite to the team">
      <Field label="Their phone">
        <TextInput style={u.input} value={phone} onChangeText={setPhone} placeholder="(512) 555-0100"
          keyboardType="phone-pad" placeholderTextColor={C.faint} autoFocus />
      </Field>
      <Field label="Role">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['WORKER', 'DISPATCHER'] as MemberRole[]).map((r) => (
            <TouchableOpacity key={r} style={[u.chip, role === r && u.chipOn]} onPress={() => setRole(r)}>
              <ThemedText style={[u.chipText, role === r && u.chipTextOn]}>{ROLE_LABEL[r]}</ThemedText>
            </TouchableOpacity>
          ))}
        </View>
        <ThemedText style={u.muted}>
          {role === 'WORKER' ? 'Does the jobs they’re given.' : 'Applies for jobs, gives them to the team and sees where everyone is.'}
        </ThemedText>
      </Field>
      <View style={{ padding: 12, borderRadius: 12, backgroundColor: C.bg }}>
        <ThemedText style={u.muted}>
          Dodorez runs a background check for anyone without a clear one — {team.free_checks_left > 0
            ? `${team.free_checks_left} more free, then $${team.check_cost.toFixed(2)} each`
            : `$${team.check_cost.toFixed(2)} each`}, taken from your payouts only if it clears.
        </ThemedText>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button kind="secondary" label="Cancel" onPress={onClose} disabled={inviting} style={{ flex: 1 }} />
        <Button label="Send invite" onPress={invite} busy={inviting} disabled={phone.trim().length < 10} style={{ flex: 1 }} />
      </View>
    </Section>
  );
}
