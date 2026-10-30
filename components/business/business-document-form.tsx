import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { BusinessDocumentInput, BusinessDocumentKind } from '@/services/api';
import * as DocumentPicker from 'expo-document-picker';
import { FileCheck2, Upload } from 'lucide-react-native';
import React, { useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Button, C, Field, u } from './ui';

const KINDS: { value: BusinessDocumentKind; label: string }[] = [
  { value: 'GENERAL_LIABILITY', label: 'General liability' },
  { value: 'WORKERS_COMP', label: "Workers' comp" },
  { value: 'LICENCE', label: 'Trade licence' },
];

/** Typed digits shown as MM/DD/YYYY — the slashes go in by themselves,
 * and deleting works through them as if they weren't there. */
function asDate(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/');
}

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
  initialKind?: BusinessDocumentKind;
  onSubmit: (doc: BusinessDocumentInput) => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}

// One insurance certificate or licence: the file (the insurer's PDF, or a
// photo of it) and what it says. Reviewed by Dodorez before it counts.
export function BusinessDocumentForm({ minLiability, initialKind, onSubmit, onCancel, onError }: Props) {
  const [kind, setKind] = useState<BusinessDocumentKind>(initialKind ?? 'GENERAL_LIABILITY');
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
    <View style={{ gap: 14 }}>
      <Field label="Document">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {KINDS.map((k) => (
            <TouchableOpacity key={k.value} style={[u.chip, kind === k.value && u.chipOn]} onPress={() => setKind(k.value)}>
              <ThemedText style={[u.chipText, kind === k.value && u.chipTextOn]}>{k.label}</ThemedText>
            </TouchableOpacity>
          ))}
        </View>
        {kind === 'GENERAL_LIABILITY' && (
          <ThemedText style={u.muted}>Needed for work at homes and on site: at least ${minLiability.toLocaleString()} per occurrence.</ThemedText>
        )}
      </Field>

      <TouchableOpacity style={[s.drop, file && s.dropFilled]} onPress={pick} activeOpacity={0.8}>
        {file ? <FileCheck2 size={22} color={C.ok} /> : <Upload size={22} color={C.muted} />}
        <View style={{ flex: 1 }}>
          <ThemedText style={s.dropTitle} numberOfLines={1}>{file ? file.name : 'Choose the file'}</ThemedText>
          <ThemedText style={u.muted}>{file ? 'Tap to choose another' : 'PDF, or a clear photo of it'}</ThemedText>
        </View>
      </TouchableOpacity>

      <Field label={insurance ? 'Insurer' : 'Licensing board'}>
        <TextInput style={u.input} value={issuer} onChangeText={setIssuer} placeholderTextColor={C.faint}
          placeholder={insurance ? 'e.g. State Farm' : 'e.g. Texas TDLR'} />
      </Field>
      <Field label={insurance ? 'Policy number' : 'Licence number'}>
        <TextInput style={u.input} value={number} onChangeText={setNumber} placeholderTextColor={C.faint} placeholder="As printed on it" />
      </Field>
      {insurance ? (
        <Field label="Limit per occurrence" hint="In dollars">
          <TextInput style={u.input} value={limit} onChangeText={setLimit} keyboardType="number-pad" placeholderTextColor={C.faint}
            placeholder="1000000" />
        </Field>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Trade">
              <TextInput style={u.input} value={trade} onChangeText={setTrade} placeholder="e.g. Plumbing" placeholderTextColor={C.faint} />
            </Field>
          </View>
          <Field label="State">
            <TextInput style={[u.input, { width: 84 }]} value={issuingState} autoCapitalize="characters" placeholderTextColor={C.faint}
              onChangeText={(t) => setIssuingState(t.replace(/[^a-zA-Z]/g, '').slice(0, 2))} placeholder="TX" />
          </Field>
        </View>
      )}
      <Field label={insurance ? 'Policy ends' : 'Expires'} hint={insurance ? 'MM/DD/YYYY' : 'MM/DD/YYYY, if it does'}>
        <TextInput style={u.input} value={expires} onChangeText={(t) => setExpires(asDate(t))} keyboardType="number-pad"
          maxLength={10} placeholderTextColor={C.faint} placeholder="12/31/2027" />
      </Field>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <Button kind="secondary" label="Cancel" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
        <Button label="Upload" onPress={save} busy={saving} disabled={!file} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  drop: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#CBD2DB', backgroundColor: '#FBFCFD',
  },
  dropFilled: { borderStyle: 'solid', borderColor: '#A7D8C3', backgroundColor: C.okSoft },
  dropTitle: { fontSize: 14.5, lineHeight: 20, fontFamily: Fonts.poppinsSemiBold, color: C.ink },
});
