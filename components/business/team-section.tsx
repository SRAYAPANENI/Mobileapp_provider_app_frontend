import { ThemedText } from '@/components/themed-text';
import { MemberRole, Team, TeamMember, WorkHours } from '@/services/api';
import { Clock, MoreHorizontal, UserPlus } from 'lucide-react-native';
import React, { useState } from 'react';
import { TextInput, TouchableOpacity, View } from 'react-native';
import { Badge, Button, C, Field, Monogram, Row, Section, Tone, u } from './ui';
import { defaultHours, sameHours, WorkHoursEditor } from './work-hours';

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
  onInvite: (phone: string, role: MemberRole, hours: WorkHours) => Promise<void>;
  /** Offer work hours: a change for a member, or other hours on an invite. */
  onOfferHours: (member: TeamMember, hours: WorkHours) => Promise<boolean>;
  /** Accept or decline hours a member sent. */
  onAnswerHours: (member: TeamMember, accept: boolean) => void;
  onChangeRole: (member: TeamMember, role: MemberRole) => void;
  onRemove: (member: TeamMember) => void;
  /** Let someone who asked to leave go now. */
  onRelease?: (member: TeamMember) => void;
  /** Share the invite again — for someone not on Dodorez, who only hears
   *  about it from the owner. */
  onResend?: (member: TeamMember) => void;
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// The team: who's on it, their checks and their work hours, and — for the
// owner — inviting people by phone with the hours offered, changing hours and
// roles, and removing them. A member can do jobs once their ID is verified
// and their background check is clear, and only in their agreed hours
// (docs/EMPLOYER_PARTNERS_DESIGN.md).
export function TeamSection({ team, canManage, onInvite, onOfferHours, onAnswerHours, onChangeRole, onRemove, onRelease,
  onResend }: Props) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [editingHours, setEditingHours] = useState<string | null>(null);
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
          const offer = m.hours?.offer ?? null;
          const theirOffer = offer?.from === 'MEMBER';
          const hoursText = m.status === 'ACTIVE' ? m.hours?.agreed_label : offer?.label;
          return (
            <View key={m.id}>
              <Row last={i === team.members.length - 1 && open !== m.id}
                icon={<Monogram name={m.name ?? m.phone} size={38} tone={m.status === 'INVITED' ? 'neutral' : 'brand'} />}
                tone="neutral"
                title={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <ThemedText style={u.label} numberOfLines={1}>{m.name ?? m.phone}</ThemedText>
                    <Badge label={m.status === 'INVITED' ? 'Invited' : ROLE_LABEL[m.role]} tone={m.role === 'OWNER' ? 'brand' : 'neutral'} />
                    {m.leave_at && <Badge label={`Leaving ${shortDate(m.leave_at)}`} tone="warn" />}
                    {theirOffer && <Badge label={m.status === 'INVITED' ? 'Sent other hours' : 'Asks for new hours'} tone="warn" />}
                    {offer?.from === 'BUSINESS' && m.status === 'ACTIVE' && <Badge label="Hours offered" tone="info" />}
                  </View>
                }
                detail={m.status === 'ACTIVE' ? (
                  <View style={{ gap: 4, marginTop: 2 }}>
                    {hoursText && <HoursLine text={hoursText} />}
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      <Badge label={m.is_identity_verified ? 'ID verified' : 'ID not verified'} tone={m.is_identity_verified ? 'ok' : 'warn'} />
                      <Badge label={check.text} tone={check.tone} />
                    </View>
                  </View>
                ) : (
                  <View style={{ gap: 2 }}>
                    {m.phone && <ThemedText style={u.muted}>{m.phone}</ThemedText>}
                    {hoursText && <HoursLine text={hoursText} />}
                  </View>
                )}
                right={manageable ? (
                  <TouchableOpacity hitSlop={10} onPress={() => setOpen(open === m.id ? null : m.id)}>
                    <MoreHorizontal size={20} color={C.muted} />
                  </TouchableOpacity>
                ) : undefined}
              />
              {/* Their hours, sent back or asked for: the owner answers. */}
              {canManage && theirOffer && offer && editingHours !== m.id && (
                <View style={{ gap: 8, paddingBottom: 12, paddingLeft: 50 }}>
                  <ThemedText style={u.muted}>
                    {m.status === 'INVITED' ? 'They’d join for these hours:' : 'They asked for:'} {offer.label}
                  </ThemedText>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    <Button small label={m.status === 'INVITED' ? 'Accept and add them' : 'Accept'} onPress={() => onAnswerHours(m, true)} />
                    <Button small kind="secondary" label="Offer other hours" onPress={() => setEditingHours(m.id)} />
                    <Button small kind="secondary" label={m.status === 'INVITED' ? 'Withdraw invite' : 'Decline'}
                      onPress={() => onAnswerHours(m, false)} />
                  </View>
                </View>
              )}
              {editingHours === m.id && (
                <HoursForm initial={offer?.hours ?? m.hours?.agreed ?? defaultHours()} current={m.status === 'ACTIVE' ? m.hours?.agreed ?? null : null}
                  onCancel={() => setEditingHours(null)}
                  onSend={async (h) => { if (await onOfferHours(m, h)) setEditingHours(null); }} />
              )}
              {open === m.id && (
                <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 12, paddingLeft: 50, flexWrap: 'wrap' }}>
                  {!theirOffer && (
                    <Button small kind="secondary" label="Change hours" onPress={() => { setOpen(null); setEditingHours(m.id); }} />
                  )}
                  {m.leave_at && onRelease && (
                    <Button small kind="secondary" label="Release now" onPress={() => { setOpen(null); onRelease(m); }} />
                  )}
                  {m.status === 'ACTIVE' && !m.leave_at && (
                    <Button small kind="secondary" label={`Make ${m.role === 'WORKER' ? 'dispatcher' : 'worker'}`}
                      onPress={() => { setOpen(null); onChangeRole(m, m.role === 'WORKER' ? 'DISPATCHER' : 'WORKER'); }} />
                  )}
                  {m.status === 'INVITED' && !m.provider_id && m.phone && onResend && (
                    <Button small kind="secondary" label="Send invite" onPress={() => { setOpen(null); onResend(m); }} />
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

function HoursLine({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Clock size={12} color={C.muted} />
      <ThemedText style={u.muted} numberOfLines={1}>{text}</ThemedText>
    </View>
  );
}

/** Offering a member hours: they accept, decline or send their own. */
function HoursForm({ initial, current, onCancel, onSend }: {
  initial: WorkHours; current: WorkHours | null; onCancel: () => void; onSend: (hours: WorkHours) => Promise<void>;
}) {
  const [hours, setHours] = useState<WorkHours>(initial);
  const [sending, setSending] = useState(false);
  const unchanged = !!current && sameHours(hours, current);
  return (
    <View style={{ gap: 10, paddingBottom: 12, paddingLeft: 50 }}>
      <WorkHoursEditor value={hours} onChange={setHours} />
      <ThemedText style={u.muted}>They answer in their app. Their hours stay as they are until they accept.</ThemedText>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button small kind="secondary" label="Cancel" onPress={onCancel} disabled={sending} />
        <Button small label="Offer these hours" busy={sending} disabled={unchanged || sending}
          onPress={async () => { setSending(true); try { await onSend(hours); } finally { setSending(false); } }} />
      </View>
    </View>
  );
}

function InviteForm({ team, onInvite, onClose }: { team: Team; onInvite: Props['onInvite']; onClose: () => void }) {
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<MemberRole>('WORKER');
  const [hours, setHours] = useState<WorkHours>(defaultHours());
  const [inviting, setInviting] = useState(false);

  const invite = async () => {
    setInviting(true);
    try {
      await onInvite(phone.trim(), role, hours);
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
      <Field label="Their hours with you">
        <WorkHoursEditor value={hours} onChange={setHours} />
        <ThemedText style={u.muted}>
          In these hours, jobs that reach them come to you to apply for and assign. Outside them they work for
          themselves. They can accept these hours or suggest others.
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
