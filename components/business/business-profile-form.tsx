import { ThemedText } from '@/components/themed-text';
import { Business, BusinessProfileInput } from '@/services/api';
import React, { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { TextInput } from '@/components/scaled-text';
import { StatePicker } from './state-picker';
import { Button, C, Field, RequiredLegend, u } from './ui';

const ENTITY_TYPES: { value: Business['entity_type']; label: string }[] = [
  { value: 'LLC', label: 'LLC' },
  { value: 'CORPORATION', label: 'Corporation' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'SOLE_PROPRIETOR', label: 'Sole proprietor' },
];

interface Props {
  initial?: Business | null;
  submitLabel: string;
  onSubmit: (input: BusinessProfileInput) => Promise<void>;
  onCancel?: () => void;
}

// The company's details — what the state has it registered as, and the name
// customers see. Tax ID, owners and bank account are never asked here:
// Stripe collects and checks them during payout setup.
export function BusinessProfileForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [legalName, setLegalName] = useState(initial?.legal_name ?? '');
  const [entity, setEntity] = useState<Business['entity_type']>(initial?.entity_type ?? 'LLC');
  const [state, setState] = useState(initial?.state ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [saving, setSaving] = useState(false);
  // What's still missing — said under each field once they've tried to send
  // the form, not while they're still filling it in.
  // The same limits the server checks (validate_profile in
  // skofy-backend app/domain/business.py), so a tap never fails there instead.
  const missing = {
    name: name.trim().length >= 2 ? null : 'Enter the name customers will see (at least 2 characters).',
    legalName: legalName.trim().length >= 2 ? null : 'Enter the name as registered with the state.',
    state: state.trim().length === 2 ? null : 'Choose the state it’s registered in.',
    // Optional — but if given, it must look like an email.
    email: !email.trim() || email.includes('@') ? null : 'Enter a valid email, or leave it empty.',
  };
  const complete = !missing.name && !missing.legalName && !missing.state && !missing.email;
  const [tried, setTried] = useState(false);
  const shown = (key: keyof typeof missing) => (tried ? missing[key] : null);

  const save = async () => {
    if (!complete) {
      setTried(true);
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(), legal_name: legalName.trim(), entity_type: entity, state: state.trim().toUpperCase(),
        email: email.trim() || undefined, phone: phone.trim() || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <RequiredLegend />
      <Field label="Business name" hint="What customers see" required error={shown('name')}>
        <TextInput style={[u.input, !!shown('name') && u.inputBad]} value={name} onChangeText={setName}
          placeholder="ABC Plumbing" placeholderTextColor={C.faint} maxLength={120} />
      </Field>
      <Field label="Legal name" hint="As registered with the state" required error={shown('legalName')}>
        <TextInput style={[u.input, !!shown('legalName') && u.inputBad]} value={legalName} onChangeText={setLegalName}
          placeholder="ABC Plumbing LLC" placeholderTextColor={C.faint} maxLength={200} />
      </Field>
      <Field label="Type of business" required>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ENTITY_TYPES.map((t) => (
            <TouchableOpacity key={t.value} style={[u.chip, entity === t.value && u.chipOn]} onPress={() => setEntity(t.value)}>
              <ThemedText style={[u.chipText, entity === t.value && u.chipTextOn]}>{t.label}</ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </Field>
      <Field label="State registered in" required error={shown('state')}>
        <StatePicker value={state} onChange={setState} invalid={!!shown('state')} />
      </Field>
      <Field label="Business contact" hint="Optional" error={shown('email')}>
        <View style={{ gap: 8 }}>
          <TextInput style={[u.input, !!shown('email') && u.inputBad]} value={email} onChangeText={setEmail}
            placeholder="office@abcplumbing.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
            placeholderTextColor={C.faint} maxLength={255} />
          <TextInput style={u.input} value={phone} onChangeText={setPhone} placeholder="(512) 555-0100"
            keyboardType="phone-pad" placeholderTextColor={C.faint} maxLength={20} />
        </View>
      </Field>
      {tried && !complete && (
        <ThemedText style={u.fieldError} accessibilityLiveRegion="polite">
          {missing.name || missing.legalName || missing.state ? 'Fill in the fields marked * to continue.' : missing.email}
        </ThemedText>
      )}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        {onCancel && <Button kind="secondary" label="Cancel" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />}
        {/* Dimmed until complete, but a tap says what's missing (it used to do nothing). */}
        <Button label={submitLabel} onPress={save} busy={saving} dimmed={!complete} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
