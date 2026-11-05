import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { HoursView, WorkHours } from '@/services/api';
import { Briefcase, Clock, User } from 'lucide-react-native';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Badge, Button, C, Section, u } from './ui';
import { defaultHours, inMyZone, sameHours, tzLabel, WorkHoursEditor } from './work-hours';

interface Props {
  businessName: string;
  hours: HoursView;
  /** Which action is saving, if any. */
  busy: 'answer-yes' | 'answer-no' | 'offer' | 'withdraw' | null;
  onAnswer: (accept: boolean) => void;
  onOffer: (hours: WorkHours) => Promise<boolean>;
  onWithdraw: () => void;
}

const lapse = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;

// A member's work hours with their business (docs/EMPLOYER_PARTNERS_DESIGN.md):
// what's agreed, which hat they're wearing right now, and changes either side
// has offered — the other side answers. The agreed hours stay until both agree.
export function MyHours({ businessName, hours, busy, onAnswer, onOffer, onWithdraw }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WorkHours>(hours.agreed ?? defaultHours());
  const offer = hours.offer;
  const fromBusiness = offer?.from === 'BUSINESS';
  const fromMe = offer?.from === 'MEMBER';
  const unchanged = !!hours.agreed && sameHours(draft, hours.agreed);

  return (
    <Section title="Your hours">
      <View style={s.now}>
        <View style={[s.nowIcon, { backgroundColor: hours.for_business_now ? C.brandSoft : C.okSoft }]}>
          {hours.for_business_now ? <Briefcase size={18} color={C.brandInk} /> : <User size={18} color={C.ok} />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText style={s.nowTitle}>
            {hours.for_business_now ? `Working for ${businessName} now` : 'Working for yourself now'}
          </ThemedText>
          <ThemedText style={u.muted}>
            {hours.for_business_now ? `Jobs come through ${businessName} until your hours end.`
              : 'New jobs in your feed are yours — your prices, your customers.'}
          </ThemedText>
        </View>
      </View>

      <View style={s.agreed}>
        <Clock size={16} color={C.muted} />
        <ThemedText style={[u.label, { flex: 1 }]}>
          With {businessName}: {hours.agreed_label}
          {hours.agreed && hours.agreed_label !== 'All the time' ? ` · ${tzLabel(hours.agreed.tz)}` : ''}
        </ThemedText>
      </View>

      {fromBusiness && offer && (
        <View style={s.offer}>
          <Badge label="New hours offered" tone="info" />
          <ThemedText style={s.offerValue}>{offer.label}</ThemedText>
          <ThemedText style={u.muted}>
            {tzLabel(offer.hours.tz)}. {businessName} offered these.{lapse(offer.lapses_at) ? ` Answer by ${lapse(offer.lapses_at)} — after that your hours stay as they are.` : ''}
          </ThemedText>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button kind="secondary" label="Decline" style={{ flex: 1 }} busy={busy === 'answer-no'} disabled={!!busy}
              onPress={() => onAnswer(false)} />
            <Button label="Accept" style={{ flex: 1 }} busy={busy === 'answer-yes'} disabled={!!busy} onPress={() => onAnswer(true)} />
          </View>
        </View>
      )}

      {fromMe && offer && (
        <View style={s.offer}>
          <Badge label="Waiting for them" tone="warn" />
          <ThemedText style={s.offerValue}>{offer.label}</ThemedText>
          <ThemedText style={u.muted}>You asked {businessName} for these. Your hours stay as they are until they accept.</ThemedText>
          <Button small kind="secondary" label="Withdraw" busy={busy === 'withdraw'} disabled={!!busy} onPress={onWithdraw} />
        </View>
      )}

      {editing ? (
        <View style={{ gap: 10 }}>
          <WorkHoursEditor value={draft} onChange={setDraft} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button kind="secondary" label="Cancel" style={{ flex: 1 }} disabled={busy === 'offer'} onPress={() => setEditing(false)} />
            <Button label={`Send to ${businessName}`} style={{ flex: 1 }} busy={busy === 'offer'} disabled={unchanged || !!busy}
              onPress={async () => { if (await onOffer(draft)) setEditing(false); }} />
          </View>
        </View>
      ) : !offer && (
        <Button kind="secondary" label="Ask for different hours" onPress={() => { setDraft(inMyZone(hours.agreed ?? defaultHours())); setEditing(true); }} />
      )}
    </Section>
  );
}

const s = StyleSheet.create({
  now: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nowIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  nowTitle: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsSemiBold, color: C.ink },
  agreed: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: C.bg },
  offer: { gap: 8, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: C.line },
  offerValue: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.poppinsBold, color: C.ink },
});
