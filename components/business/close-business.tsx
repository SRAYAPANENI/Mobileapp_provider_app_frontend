import { ThemedText } from '@/components/themed-text';
import { SkoFyApi } from '@/services/api';
import { AlertTriangle, Archive, DoorClosed, Users } from 'lucide-react-native';
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Button, C, Field, Row, Section, u } from './ui';

interface Props {
  businessName: string;
  onClosed: (message: string) => void;
  onError: (message: string) => void;
}

// Closing the business (docs/BUSINESS_PROVIDERS_DESIGN.md §12): what happens,
// anything still open, then the owner types its name to confirm. After this
// the owner can also delete their own account.
export function CloseBusiness({ businessName, onClosed, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [blockers, setBlockers] = useState<string[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setOpen(true);
    try {
      setBlockers((await SkoFyApi.business.closureStatus()).blockers);
    } catch (err: any) {
      onError(err?.message ?? 'Please try again.');
      setOpen(false);
    }
  };

  const close = async () => {
    setBusy(true);
    try {
      onClosed((await SkoFyApi.business.close(name.trim())).message);
    } catch (err: any) {
      const reasons: string[] | undefined = err?.details?.reasons;
      if (reasons?.length) setBlockers(reasons);
      else onError(err?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Section title="Close business" flush>
        <Row last icon={<DoorClosed size={18} color={C.bad} />} tone="bad" onPress={start}
          title={<ThemedText style={[u.label, { color: C.bad }]}>Close {businessName}</ThemedText>}
          detail="Stop taking jobs and release your team" chevron />
      </Section>
    );
  }

  const blocked = !!blockers?.length;
  const matches = name.trim().toLowerCase() === businessName.trim().toLowerCase();
  return (
    <Section title="Close business">
      <View style={{ gap: 2 }}>
        <Row icon={<DoorClosed size={18} color={C.ink} />} title="It stops taking jobs" detail="Today, for good — its listing and applications go." />
        <Row icon={<Users size={18} color={C.ink} />} title="Your team is released" detail="Everyone leaves now and can take jobs for themselves." />
        <Row last icon={<Archive size={18} color={C.muted} />} title="Its history is kept"
          detail="Past jobs, payments and documents stay on record. Your own account stays — delete it separately if you want." />
      </View>

      {blockers === null ? null : blocked ? (
        <View style={{ gap: 6, padding: 12, borderRadius: 14, backgroundColor: C.warnSoft }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} color={C.warn} />
            <ThemedText style={[u.label, { color: C.warn }]}>Finish these first</ThemedText>
          </View>
          {blockers.map((b) => <ThemedText key={b} style={[u.muted, { color: '#78350F' }]}>• {b}</ThemedText>)}
        </View>
      ) : (
        <Field label={`Type “${businessName}” to confirm`}>
          <TextInput style={u.input} value={name} onChangeText={setName} placeholder={businessName}
            placeholderTextColor={C.faint} autoCapitalize="none" />
        </Field>
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button kind="secondary" label="Keep it" onPress={() => { setOpen(false); setName(''); }} disabled={busy} style={{ flex: 1 }} />
        <Button kind="danger" label="Close business" onPress={close} busy={busy} disabled={blocked || !matches}
          style={{ flex: 1 }} />
      </View>
    </Section>
  );
}
