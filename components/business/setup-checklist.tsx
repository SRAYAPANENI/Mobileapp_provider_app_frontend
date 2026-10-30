import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { Business, BusinessDocumentKind } from '@/services/api';
import { Check } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Badge, Button, C, Progress, Section, Tone, u } from './ui';

type StepState = 'done' | 'review' | 'fix' | 'todo';
const STATE_BADGE: Record<Exclude<StepState, 'todo'>, { label: string; tone: Tone }> = {
  done: { label: 'Done', tone: 'ok' }, review: { label: 'In review', tone: 'info' }, fix: { label: 'Needs changes', tone: 'bad' },
};

// The readiness check's own words for each requirement (app/domain/business.py)
// — it decides "done"; the documents only say how far along an upload is.
const MISSING_PREFIX: Record<string, string> = { GENERAL_LIABILITY: 'General liability', LICENCE: 'A trade licence', PAYOUTS: 'Payouts' };
const listed = (business: Business, key: string) => business.missing.some((m) => m.startsWith(MISSING_PREFIX[key]));

/** Where a document requirement stands — the best of its kind's uploads —
 * and, when it needs fixing, why: our team's own words when they turned it down. */
function docState(business: Business, kind: BusinessDocumentKind): { state: StepState; why?: string } {
  const docs = business.documents.filter((d) => d.kind === kind);
  if (!listed(business, kind)) return { state: 'done' };
  if (docs.some((d) => d.status === 'PENDING_REVIEW')) return { state: 'review' };
  const turnedDown = docs.find((d) => d.status === 'REJECTED');
  if (turnedDown) return { state: 'fix', why: `Not accepted: ${turnedDown.review_note || 'see the document below'}` };
  if (docs.some((d) => d.status === 'EXPIRED')) return { state: 'fix', why: 'It has ended — upload the new one' };
  if (docs.some((d) => d.status === 'APPROVED')) return { state: 'fix', why: 'Out of date or not enough cover — upload a new one' };
  return { state: 'todo' };
}

interface Props {
  business: Business;
  minLiability: number;
  canAct: boolean;
  busy: string | null;
  onUpload: (kind: BusinessDocumentKind) => void;
  onPayouts: () => void;
  onSubmit: () => void;
}

// Getting a business approved, as steps (docs/BUSINESS_PROVIDERS_DESIGN.md §2):
// each says where it stands and offers the one thing to do next.
export function SetupChecklist({ business, minLiability, canAct, busy, onUpload, onPayouts, onSubmit }: Props) {
  // Also done with demo payouts on, before any Stripe account.
  const payoutsDone = !listed(business, 'PAYOUTS');
  const review: StepState = business.status === 'APPROVED' ? 'done' : business.status === 'PENDING_REVIEW' ? 'review'
    : business.status === 'REJECTED' ? 'fix' : 'todo';
  const liability = docState(business, 'GENERAL_LIABILITY');
  const licence = docState(business, 'LICENCE');
  const steps: { title: string; detail: string; state: StepState; action?: React.ReactNode }[] = [
    { title: 'Business details', detail: `${business.legal_name} · ${business.state}`, state: 'done' },
    {
      title: 'General liability insurance', detail: liability.why ?? `$${minLiability.toLocaleString()} or more per occurrence`,
      state: liability.state,
      action: <Button small kind="secondary" label="Upload" onPress={() => onUpload('GENERAL_LIABILITY')} />,
    },
    {
      title: 'Trade licence', detail: licence.why ?? 'For the trades your team does', state: licence.state,
      action: <Button small kind="secondary" label="Upload" onPress={() => onUpload('LICENCE')} />,
    },
    {
      title: 'Payouts with Stripe', detail: "Paid to the company's bank account", state: payoutsDone ? 'done' : 'todo',
      action: <Button small kind="secondary" label={business.connect_onboarding_status === 'NOT_STARTED' ? 'Set up' : 'Continue'}
        busy={busy === 'payouts'} onPress={onPayouts} />,
    },
  ];
  const ready = steps.every((s) => s.state === 'done' || s.state === 'review');
  steps.push({
    title: 'Review by Dodorez',
    detail: review === 'review' ? 'Usually within 2 business days'
      : review === 'fix' ? (business.review_note ? `Needs changes: ${business.review_note}` : 'See what to change')
      : ready ? 'Everything is in — send it' : 'Once the steps above are in',
    state: review,
  });
  const done = steps.filter((s) => s.state === 'done').length;

  return (
    <Section title="Get approved">
      <View style={{ gap: 8 }}>
        <View style={st.head}>
          <ThemedText style={st.headTitle}>{done} of {steps.length} done</ThemedText>
          <ThemedText style={u.muted}>Then your team can take jobs</ThemedText>
        </View>
        <Progress value={done / steps.length} />
      </View>

      <View>
        {steps.map((step, i) => (
          <View key={step.title} style={st.step}>
            <View style={st.rail}>
              <View style={[st.dot, step.state === 'done' && st.dotDone, step.state === 'review' && st.dotReview, step.state === 'fix' && st.dotFix]}>
                {step.state === 'done' ? <Check size={14} color="#FFFFFF" strokeWidth={3} />
                  : <ThemedText style={[st.dotText, step.state !== 'todo' && { color: '#FFFFFF' }]}>{i + 1}</ThemedText>}
              </View>
              {i < steps.length - 1 && <View style={[st.line, step.state === 'done' && st.lineDone]} />}
            </View>
            <View style={st.stepBody}>
              <View style={{ flex: 1, gap: 2 }}>
                <ThemedText style={[st.stepTitle, step.state === 'done' && st.stepTitleDone]}>{step.title}</ThemedText>
                {/* A reason from our team is shown in full. */}
                <ThemedText style={[u.muted, step.state === 'fix' && { color: C.bad }]} numberOfLines={step.state === 'fix' ? undefined : 2}>
                  {step.detail}
                </ThemedText>
              </View>
              {step.state === 'todo' || step.state === 'fix' ? (canAct && step.action) : <Badge {...STATE_BADGE[step.state]} />}
            </View>
          </View>
        ))}
      </View>

      {canAct && (review === 'todo' || review === 'fix') && (
        <Button label={review === 'fix' ? 'Send again for review' : 'Send for review'} disabled={!ready}
          busy={busy === 'submit'} onPress={onSubmit} />
      )}
    </Section>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  headTitle: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.poppinsBold, color: C.ink },
  step: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 26 },
  dot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#D5DAE1', backgroundColor: C.card },
  dotDone: { backgroundColor: C.ok, borderColor: C.ok },
  dotReview: { backgroundColor: C.info, borderColor: C.info },
  dotFix: { backgroundColor: C.bad, borderColor: C.bad },
  dotText: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.poppinsBold, color: C.muted },
  line: { flex: 1, width: 2, minHeight: 14, backgroundColor: '#E5E8EC', marginVertical: 2 },
  lineDone: { backgroundColor: '#A7D8C3' },
  stepBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 16, minHeight: 44 },
  stepTitle: { fontSize: 14.5, lineHeight: 20, fontFamily: Fonts.poppinsSemiBold, color: C.ink },
  stepTitleDone: { color: C.body },
});
