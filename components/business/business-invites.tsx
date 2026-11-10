import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { BusinessInvite, WorkHours } from '@/services/api';
import { CheckSquare, Clock, MapPin, ShieldCheck, Square } from 'lucide-react-native';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Badge, Button, C, Monogram, Section, u } from './ui';
import { defaultHours, inMyZone, sameHours, tzLabel, WorkHoursEditor } from './work-hours';

const ROLE_WORDS: Record<string, string> = { DISPATCHER: 'Dispatcher', WORKER: 'Worker', OWNER: 'Owner' };

interface Props {
  invites: BusinessInvite[];
  /** `hours`: other hours than offered — sends the invite back with them. */
  onAnswer: (invite: BusinessInvite, accept: boolean, acknowledged: boolean, authorizedCheck: boolean,
    hours?: WorkHours) => Promise<void>;
}

// Invites to join a business's team. The invite offers work hours: inside
// them jobs come through the business, outside them the person works for
// themselves. They accept, edit the hours and send them back, or decline.
// Joining means the business can see your location while you're on its jobs
// — the notice is shown in full and must be accepted
// (docs/BUSINESS_PROVIDERS_DESIGN.md §5, docs/EMPLOYER_PARTNERS_DESIGN.md).
export function BusinessInvites({ invites, onAnswer }: Props) {
  return (
    <>
      {/* Keyed by the offer too: a new offer from the business starts the card afresh. */}
      {invites.map((invite) => (
        <InviteCard key={`${invite.id}-${invite.waiting_on}-${invite.offer?.label ?? ''}`} invite={invite} onAnswer={onAnswer} />
      ))}
    </>
  );
}

function InviteCard({ invite, onAnswer }: { invite: BusinessInvite; onAnswer: Props['onAnswer'] }) {
  const [agreed, setAgreed] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const offered = invite.offer?.hours ?? null;
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState<WorkHours>(offered ?? defaultHours());
  const ready = agreed && (!invite.needs_check || authorized);
  const [busy, setBusy] = useState<'accept' | 'send' | 'decline' | null>(null);
  const waiting = invite.waiting_on === 'BUSINESS';
  const changed = editing && (!offered || !sameHours(hours, offered));
  const mine = invite.requested_by === 'MEMBER';

  const answer = async (kind: 'accept' | 'send' | 'decline') => {
    setBusy(kind);
    try {
      await onAnswer(invite, kind !== 'decline', agreed, authorized, kind === 'send' ? hours : undefined);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title={mine ? 'Your request to join' : 'Team invite'}>
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

      {/* The hours on offer, and what they mean. */}
      <View style={s.hours}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Clock size={16} color={C.info} />
          <ThemedText style={s.hoursTitle}>{waiting ? 'The hours you sent' : 'Your hours with them'}</ThemedText>
        </View>
        <ThemedText style={s.hoursValue}>{invite.offer?.label ?? 'All the time'}</ThemedText>
        {offered && offered.days.length < 7 && <ThemedText style={s.hoursText}>{tzLabel(offered.tz)}</ThemedText>}
        <ThemedText style={s.hoursText}>
          In these hours, jobs come to you through {invite.business_name}, at its prices. Outside them you work for
          yourself, as now — your own jobs, your own prices, and {invite.business_name} doesn’t see them.
        </ThemedText>
      </View>

      {waiting ? (
        <>
          <ThemedText style={u.body}>Sent to {invite.business_name} — you’ll join once they accept your hours.</ThemedText>
          <Button kind="secondary" label="Withdraw" onPress={() => answer('decline')} busy={busy === 'decline'} disabled={!!busy} />
        </>
      ) : (
        <>
          {editing ? (
            <View style={{ gap: 10 }}>
              <ThemedText style={u.label}>Suggest other hours</ThemedText>
              <WorkHoursEditor value={hours} onChange={setHours} />
            </View>
          ) : (
            <TouchableOpacity onPress={() => { setHours(inMyZone(offered ?? defaultHours())); setEditing(true); }} hitSlop={8}>
              <ThemedText style={s.link}>These hours don’t suit you? Suggest others</ThemedText>
            </TouchableOpacity>
          )}

          {invite.needs_check && <ThemedText style={u.body}>Dodorez runs a background check first — at no cost to you.</ThemedText>}
          <Consent icon={<MapPin size={16} color={C.warn} />} title="Your location" text={invite.notice}
            checked={agreed} onToggle={() => setAgreed((a) => !a)} label="I've read this and agree" />
          {invite.needs_check && invite.check_disclosure && (
            <Consent icon={<ShieldCheck size={16} color={C.warn} />} title="Background check" text={invite.check_disclosure}
              checked={authorized} onToggle={() => setAuthorized((a) => !a)} label="I authorise Dodorez to get this background check" />
          )}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button kind="secondary" label="Decline" onPress={() => answer('decline')} busy={busy === 'decline'} disabled={!!busy} style={{ flex: 1 }} />
            {changed ? (
              <Button label="Send my hours" onPress={() => answer('send')} busy={busy === 'send'} disabled={!ready || !!busy} style={{ flex: 1 }} />
            ) : (
              <Button label="Join the team" onPress={() => answer('accept')} busy={busy === 'accept'} disabled={!ready || !!busy} style={{ flex: 1 }} />
            )}
          </View>
        </>
      )}
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
  hours: { padding: 14, borderRadius: 14, backgroundColor: C.infoSoft, gap: 6 },
  hoursTitle: { fontSize: 13.5, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: C.info },
  hoursValue: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.poppinsBold, color: C.ink },
  hoursText: { fontSize: 12.5, lineHeight: 19, fontFamily: Fonts.poppins, color: '#1E3A8A' },
  link: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: C.info },
  consent: { padding: 14, borderRadius: 14, backgroundColor: C.warnSoft, gap: 8 },
  consentTitle: { fontSize: 13.5, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: C.warn },
  consentText: { fontSize: 12.5, lineHeight: 19, fontFamily: Fonts.poppins, color: '#78350F' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F5D9A8' },
});
