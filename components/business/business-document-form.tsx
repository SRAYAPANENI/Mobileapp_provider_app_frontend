import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { BusinessDocumentInput, BusinessDocumentKind } from '@/services/api';
import * as DocumentPicker from 'expo-document-picker';
import { FileText } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

const KINDS: { value: BusinessDocumentKind; label: string }[] = [
  { value: 'GENERAL_LIABILITY', label: 'General liability' },
  { value: 'WORKERS_COMP', label: "Workers' comp" },
  { value: 'LICENCE', label: 'Trade licence' },
];

/** "MM/DD/YYYY" → "YYYY-MM-DD", or null if it isn't a real date. */
function isoDate(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [month, day, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface Props {
  minLiability: number;
  onSubmit: (doc: BusinessDocumentInput) => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}

// One insurance certificate or licence: the file (the insurer's PDF, or a
// photo of it) and what it says. Reviewed by Dodorez before it counts.
export function BusinessDocumentForm({ minLiability, onSubmit, onCancel, onError }: Props) {
  const [kind, setKind] = useState<BusinessDocumentKind>('GENERAL_LIABILITY');
  const [file, setFile] = useState<BusinessDocumentInput['file'] | null>(null);
  const [issuer, setIssuer] = useState('');
  const [number, setNumber] = useState('');
  const [limit, setLimit] = useState('');
  const [trade, setTrade] = useState('');
  const [issuingState, setIssuingState] = useState('');
  const [expires, setExpires] = useState('');
  const [saving, setSaving] = useState(false);
  const insurance = kind !== 'LICENCE';

  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true });
    const asset = result.canceled ? null : result.assets?.[0];
    if (asset) setFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? 'application/pdf' });
  };

  const save = async () => {
    if (!file) return onError('Choose the certificate or licence file first.');
    const expiresOn = expires.trim() ? isoDate(expires) : null;
    if (expires.trim() && !expiresOn) return onError('Enter the end date as MM/DD/YYYY.');
    setSaving(true);
    try {
      await onSubmit({
        kind, file, issuer: issuer.trim(), number: number.trim(),
        coverage_limit: insurance ? limit.replace(/[^0-9.]/g, '') : undefined,
        trade: insurance ? undefined : trade.trim(),
        issuing_state: insurance ? undefined : issuingState.trim().toUpperCase(),
        expires_on: expiresOn ?? undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={s.wrap}>
      <View style={s.chips}>
        {KINDS.map((k) => (
          <TouchableOpacity key={k.value} style={[s.chip, kind === k.value && s.chipOn]} onPress={() => setKind(k.value)}>
            <ThemedText style={[s.chipText, kind === k.value && s.chipTextOn]}>{k.label}</ThemedText>
          </TouchableOpacity>
        ))}
      </View>
      {kind === 'GENERAL_LIABILITY' && (
        <ThemedText style={s.hint}>Needed for work at homes and on site: at least ${minLiability.toLocaleString()} per occurrence.</ThemedText>
      )}

      <TouchableOpacity style={s.file} onPress={pick}>
        <FileText size={18} color="#111827" />
        <ThemedText style={s.fileText} numberOfLines={1}>{file ? file.name : 'Choose the PDF or a photo'}</ThemedText>
      </TouchableOpacity>

      <TextInput style={s.input} value={issuer} onChangeText={setIssuer} placeholderTextColor="#9CA3AF"
        placeholder={insurance ? 'Insurer, e.g. State Farm' : 'Licensing board, e.g. Texas TDLR'} />
      <TextInput style={s.input} value={number} onChangeText={setNumber} placeholderTextColor="#9CA3AF"
        placeholder={insurance ? 'Policy number' : 'Licence number'} />
      {insurance ? (
        <TextInput style={s.input} value={limit} onChangeText={setLimit} keyboardType="number-pad" placeholderTextColor="#9CA3AF"
          placeholder="Limit per occurrence, e.g. 1000000" />
      ) : (
        <View style={s.row}>
          <TextInput style={[s.input, { flex: 1 }]} value={trade} onChangeText={setTrade} placeholder="Trade, e.g. Plumbing" placeholderTextColor="#9CA3AF" />
          <TextInput style={[s.input, { width: 80 }]} value={issuingState} autoCapitalize="characters" placeholderTextColor="#9CA3AF"
            onChangeText={(t) => setIssuingState(t.replace(/[^a-zA-Z]/g, '').slice(0, 2))} placeholder="State" />
        </View>
      )}
      <TextInput style={s.input} value={expires} onChangeText={setExpires} keyboardType="numbers-and-punctuation" placeholderTextColor="#9CA3AF"
        placeholder={insurance ? 'Policy ends (MM/DD/YYYY)' : 'Expires (MM/DD/YYYY), if it does'} />

      <View style={s.row}>
        <TouchableOpacity style={s.secondary} onPress={onCancel} disabled={saving}>
          <ThemedText style={s.secondaryText}>Cancel</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={s.primary} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#111827" /> : <ThemedText style={s.primaryText}>Upload</ThemedText>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  chipText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppins, color: '#374151' },
  chipTextOn: { fontFamily: Fonts.poppinsBold, color: '#111827' },
  hint: { fontSize: 12, lineHeight: 17, fontFamily: Fonts.poppins, color: '#6B7280' },
  file: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#D1D5DB', backgroundColor: '#fff' },
  fileText: { flex: 1, fontSize: 13.5, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, fontSize: 14, fontFamily: Fonts.poppins, color: '#111827', backgroundColor: '#F9FAFB' },
  row: { flexDirection: 'row', gap: 10 },
  primary: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: '#FFCE48' },
  primaryText: { fontSize: 14.5, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: '#111827' },
  secondary: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: '#F3F4F6' },
  secondaryText: { fontSize: 14.5, lineHeight: 20, fontFamily: Fonts.poppinsSemiBold, color: '#374151' },
});
