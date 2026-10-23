import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { Business, BusinessProfileInput } from '@/services/api';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

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
    <View style={s.wrap}>
      <ThemedText style={s.label}>Business name customers see</ThemedText>
      <TextInput style={s.input} value={name} onChangeText={setName} placeholder="ABC Plumbing" placeholderTextColor="#9CA3AF" />
      <ThemedText style={s.label}>Legal name, as registered with the state</ThemedText>
      <TextInput style={s.input} value={legalName} onChangeText={setLegalName} placeholder="ABC Plumbing LLC" placeholderTextColor="#9CA3AF" />
      <ThemedText style={s.label}>Type of business</ThemedText>
      <View style={s.chips}>
        {ENTITY_TYPES.map((t) => (
          <TouchableOpacity key={t.value} style={[s.chip, entity === t.value && s.chipOn]} onPress={() => setEntity(t.value)}>
            <ThemedText style={[s.chipText, entity === t.value && s.chipTextOn]}>{t.label}</ThemedText>
          </TouchableOpacity>
        ))}
      </View>
      <ThemedText style={s.label}>State it's registered in</ThemedText>
      <TextInput style={[s.input, { width: 90 }]} value={state} onChangeText={(t) => setState(t.replace(/[^a-zA-Z]/g, '').slice(0, 2))}
        placeholder="TX" autoCapitalize="characters" placeholderTextColor="#9CA3AF" />
      <ThemedText style={s.label}>Business email and phone (optional)</ThemedText>
      <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="office@abcplumbing.com"
        keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#9CA3AF" />
      <TextInput style={s.input} value={phone} onChangeText={setPhone} placeholder="(512) 555-0100"
        keyboardType="phone-pad" placeholderTextColor="#9CA3AF" />
      <View style={s.row}>
        {onCancel && (
          <TouchableOpacity style={s.secondary} onPress={onCancel} disabled={saving}>
            <ThemedText style={s.secondaryText}>Cancel</ThemedText>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.primary} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#111827" /> : <ThemedText style={s.primaryText}>{submitLabel}</ThemedText>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 8 },
  label: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.poppinsSemiBold, color: '#374151', marginTop: 4 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, fontSize: 14, fontFamily: Fonts.poppins, color: '#111827', backgroundColor: '#F9FAFB' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  chipText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppins, color: '#374151' },
  chipTextOn: { fontFamily: Fonts.poppinsBold, color: '#111827' },
  row: { flexDirection: 'row', gap: 10, marginTop: 8 },
  primary: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: '#FFCE48' },
  primaryText: { fontSize: 14.5, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: '#111827' },
  secondary: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: '#F3F4F6' },
  secondaryText: { fontSize: 14.5, lineHeight: 20, fontFamily: Fonts.poppinsSemiBold, color: '#374151' },
});
