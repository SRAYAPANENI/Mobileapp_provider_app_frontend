import { ThemedText } from '@/components/themed-text';
import { Business, BusinessProfileInput } from '@/services/api';
import React, { useState } from 'react';
import { TextInput, TouchableOpacity, View } from 'react-native';
import { Button, C, Field, u } from './ui';

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
  const complete = name.trim() && legalName.trim() && state.trim().length === 2;

  const save = async () => {
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
      <Field label="Business name" hint="What customers see">
        <TextInput style={u.input} value={name} onChangeText={setName} placeholder="ABC Plumbing" placeholderTextColor={C.faint} />
      </Field>
      <Field label="Legal name" hint="As registered with the state">
        <TextInput style={u.input} value={legalName} onChangeText={setLegalName} placeholder="ABC Plumbing LLC" placeholderTextColor={C.faint} />
      </Field>
      <Field label="Type of business">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ENTITY_TYPES.map((t) => (
            <TouchableOpacity key={t.value} style={[u.chip, entity === t.value && u.chipOn]} onPress={() => setEntity(t.value)}>
              <ThemedText style={[u.chipText, entity === t.value && u.chipTextOn]}>{t.label}</ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </Field>
      <Field label="State registered in">
        <TextInput style={[u.input, { width: 96 }]} value={state} onChangeText={(t) => setState(t.replace(/[^a-zA-Z]/g, '').slice(0, 2))}
          placeholder="TX" autoCapitalize="characters" placeholderTextColor={C.faint} />
      </Field>
      <Field label="Business contact" hint="Optional">
        <View style={{ gap: 8 }}>
          <TextInput style={u.input} value={email} onChangeText={setEmail} placeholder="office@abcplumbing.com"
            keyboardType="email-address" autoCapitalize="none" placeholderTextColor={C.faint} />
          <TextInput style={u.input} value={phone} onChangeText={setPhone} placeholder="(512) 555-0100"
            keyboardType="phone-pad" placeholderTextColor={C.faint} />
        </View>
      </Field>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        {onCancel && <Button kind="secondary" label="Cancel" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />}
        <Button label={submitLabel} onPress={save} busy={saving} disabled={!complete} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
