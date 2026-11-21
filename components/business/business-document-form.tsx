import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { BusinessDocumentInput, BusinessDocumentKind } from '@/services/api';
import { usePhotoPicker } from '@/components/photo-picker';
import * as DocumentPicker from 'expo-document-picker';
import { FileCheck2, Upload } from 'lucide-react-native';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { TextInput } from '@/components/scaled-text';
import { asDate, isoDate } from '@/services/usDate';
import { Button, C, Field, RequiredLegend, u } from './ui';
import { StatePicker } from './state-picker';

const KINDS: { value: BusinessDocumentKind; label: string }[] = [
  { value: 'GENERAL_LIABILITY', label: 'General liability' },
  { value: 'WORKERS_COMP', label: "Workers' comp" },
  { value: 'LICENCE', label: 'Trade licence' },
];


interface Props {
  minLiability: number;
  initialKind?: BusinessDocumentKind;
  onSubmit: (doc: BusinessDocumentInput) => Promise<void>;
  onCancel: () => void;
}

// One insurance certificate or licence: the file (the insurer's PDF, or a
// photo of it) and what it says. Reviewed by Dodorez before it counts.
export function BusinessDocumentForm({ minLiability, initialKind, onSubmit, onCancel }: Props) {
  const [kind, setKind] = useState<BusinessDocumentKind>(initialKind ?? 'GENERAL_LIABILITY');
  const [file, setFile] = useState<BusinessDocumentInput['file'] | null>(null);
  const [issuer, setIssuer] = useState('');
  const [number, setNumber] = useState('');
  const [limit, setLimit] = useState('');
  const [trade, setTrade] = useState('');
  const [issuingState, setIssuingState] = useState('');
  const [expires, setExpires] = useState('');
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const insurance = kind !== 'LICENCE';
  const liability = kind === 'GENERAL_LIABILITY';
  const photoPicker = usePhotoPicker();

  // A photo of it (camera or gallery), or the PDF / file the issuer sent —
  // in the app's own popup (components/photo-picker.tsx). A photo of a
  // document is kept sharp enough to read ('document').
  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true,
    });
    const asset = result.canceled ? null : result.assets?.[0];
    if (asset) setFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? 'application/pdf' });
  };
  const pick = async () => {
    const [photo] = await photoPicker.pickPhotos({
      title: insurance ? 'Insurance Certificate' : 'Licence', size: 'document',
      extra: { label: 'Choose a File (PDF)', kind: 'file', onPress: () => { void pickFile(); } },
    });
    if (photo) setFile({ uri: photo.uri, name: 'document.jpg', mimeType: photo.mimeType });
  };

  // What's still missing — the same rules the server checks (validate_document
  // in skofy-backend app/domain/business.py), said under each field once
  // they've tried to upload, instead of one refusal at a time after it.
  const expiresOn = expires.trim() ? isoDate(expires) : null;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const limitAmount = Number(limit.replace(/[^0-9.]/g, ''));
  const missing = {
    file: file ? null : 'Choose the certificate or licence file.',
    issuer: issuer.trim() ? null : insurance ? 'Enter the insurer.' : 'Enter the licensing board.',
    number: number.trim() ? null : insurance ? 'Enter the policy number.' : 'Enter the licence number.',
    limit: !liability || (limit.trim() && limitAmount >= minLiability) ? null
      : `General liability must cover at least $${minLiability.toLocaleString()} per occurrence.`,
    trade: insurance || trade.trim() ? null : 'Enter the trade the licence is for, e.g. Plumbing.',
    state: insurance || issuingState ? null : 'Choose the state that issued the licence.',
    expires: expires.trim() && !expiresOn ? 'Enter the date as MM/DD/YYYY.'
      : expiresOn && expiresOn <= today ? 'This has already expired — upload one that’s still in date.'
      : insurance && !expiresOn ? 'Enter when the policy ends.' : null,
  };
  const complete = Object.values(missing).every((m) => !m);
  const shown = (key: keyof typeof missing) => (tried ? missing[key] : null);

  const save = async () => {
    if (!complete || !file) {
      setTried(true);
      return;
    }
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
      <RequiredLegend />
      <Field label="Document" required>
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

      <Field label="File" required error={shown('file')}>
        <TouchableOpacity style={[s.drop, file && s.dropFilled, !!shown('file') && s.dropMissing]} onPress={pick} activeOpacity={0.8}>
          {file ? <FileCheck2 size={22} color={C.ok} /> : <Upload size={22} color={shown('file') ? C.bad : C.muted} />}
          <View style={{ flex: 1 }}>
            <ThemedText style={s.dropTitle} numberOfLines={1}>{file ? file.name : 'Choose the file'}</ThemedText>
            <ThemedText style={u.muted}>{file ? 'Tap to choose another' : 'PDF, or a clear photo of it'}</ThemedText>
          </View>
        </TouchableOpacity>
      </Field>

      <Field label={insurance ? 'Insurer' : 'Licensing board'} required error={shown('issuer')}>
        <TextInput style={[u.input, !!shown('issuer') && u.inputBad]} value={issuer} onChangeText={setIssuer} placeholderTextColor={C.faint}
          placeholder={insurance ? 'e.g. State Farm' : 'e.g. Texas TDLR'} maxLength={150} />
      </Field>
      <Field label={insurance ? 'Policy number' : 'Licence number'} required error={shown('number')}>
        <TextInput style={[u.input, !!shown('number') && u.inputBad]} value={number} onChangeText={setNumber} placeholderTextColor={C.faint}
          placeholder="As printed on it" maxLength={100} />
      </Field>
      {insurance ? (
        // Required for general liability (the minimum cover); workers' comp has none.
        <Field label="Limit per occurrence" hint={liability ? 'In dollars' : 'In dollars, optional'} required={liability} error={shown('limit')}>
          <TextInput style={[u.input, !!shown('limit') && u.inputBad]} value={limit} onChangeText={setLimit} keyboardType="number-pad"
            placeholderTextColor={C.faint} placeholder="1000000" maxLength={10} />
        </Field>
      ) : (
        <>
          <Field label="Trade" required error={shown('trade')}>
            <TextInput style={[u.input, !!shown('trade') && u.inputBad]} value={trade} onChangeText={setTrade} placeholder="e.g. Plumbing"
              placeholderTextColor={C.faint} maxLength={100} />
          </Field>
          {/* Chosen from the list the server checks against — typed, any two
              letters went through ("FG"), and the licence was refused later. */}
          <Field label="State" required error={shown('state')}>
            <StatePicker value={issuingState} onChange={setIssuingState} title="State that issued the licence" invalid={!!shown('state')} />
          </Field>
        </>
      )}
      <Field label={insurance ? 'Policy ends' : 'Expires'} hint={insurance ? 'MM/DD/YYYY' : 'MM/DD/YYYY, if it does'}
        required={insurance} error={shown('expires')}>
        <TextInput style={[u.input, !!shown('expires') && u.inputBad]} value={expires} onChangeText={(t) => setExpires(asDate(t))}
          keyboardType="number-pad" maxLength={10} placeholderTextColor={C.faint} placeholder="12/31/2027" />
      </Field>

      {tried && !complete && (
        <ThemedText style={u.fieldError} accessibilityLiveRegion="polite">Fill in the fields marked * to upload.</ThemedText>
      )}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <Button kind="secondary" label="Cancel" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
        {/* Dimmed until complete; a tap says what's missing. */}
        <Button label="Upload" onPress={save} busy={saving} dimmed={!complete} style={{ flex: 1 }} />
      </View>
      {photoPicker.element}
    </View>
  );
}

const s = StyleSheet.create({
  drop: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#CBD2DB', backgroundColor: '#FBFCFD',
  },
  dropFilled: { borderStyle: 'solid', borderColor: '#A7D8C3', backgroundColor: C.okSoft },
  dropMissing: { borderColor: C.bad, backgroundColor: C.badSoft },
  dropTitle: { fontSize: 14.5, lineHeight: 20, fontFamily: Fonts.poppinsSemiBold, color: C.ink },
});
