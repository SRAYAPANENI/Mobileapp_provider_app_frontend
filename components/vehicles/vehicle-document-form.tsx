import { Button, C, Field, u } from '@/components/business/ui';
import { TextInput } from '@/components/scaled-text';
import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { NewVehicleDocument, PickedFile, VehicleDocumentKind } from '@/services/api';
import { asDate, isoDate } from '@/services/usDate';
import { usePhotoPicker } from '@/components/photo-picker';
import * as DocumentPicker from 'expo-document-picker';
import { FileCheck2, Upload } from 'lucide-react-native';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface Props {
  kind: VehicleDocumentKind;
  onSubmit: (doc: NewVehicleDocument) => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}

// A renewed registration, or proof of insurance, for a vehicle already added.
// The approved one it renews keeps counting until it ends.
export function VehicleDocumentForm({ kind, onSubmit, onCancel, onError }: Props) {
  const insurance = kind === 'INSURANCE';
  const [file, setFile] = useState<PickedFile | null>(null);
  const [ends, setEnds] = useState('');
  const [issuer, setIssuer] = useState('');
  const [number, setNumber] = useState('');
  const [saving, setSaving] = useState(false);
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
      title: insurance ? 'Insurance Card' : 'Registration', size: 'document',
      extra: { label: 'Choose a File (PDF)', kind: 'file', onPress: () => { void pickFile(); } },
    });
    if (photo) setFile({ uri: photo.uri, name: 'document.jpg', mimeType: photo.mimeType });
  };

  const save = async () => {
    if (!file) return onError(insurance ? 'Choose the insurance card or policy first.' : 'Choose the registration first.');
    const expiresOn = isoDate(ends);
    if (!expiresOn) return onError('Enter when it ends, as MM/DD/YYYY.');
    if (insurance && (!issuer.trim() || !number.trim())) return onError('Enter the insurer and the policy number.');
    setSaving(true);
    try {
      await onSubmit({ kind, file, expires_on: expiresOn, issuer: issuer.trim() || undefined, number: number.trim() || undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <TouchableOpacity style={[s.drop, file && s.dropFilled]} onPress={pick} activeOpacity={0.8}>
        {file ? <FileCheck2 size={22} color={C.ok} /> : <Upload size={22} color={C.muted} />}
        <View style={{ flex: 1 }}>
          <ThemedText style={s.dropTitle} numberOfLines={1}>
            {file ? file.name : insurance ? 'Choose the insurance card' : 'Choose the new registration'}
          </ThemedText>
          <ThemedText style={u.muted}>{file ? 'Tap to choose another' : 'PDF, or a clear photo of it'}</ThemedText>
        </View>
      </TouchableOpacity>
      {insurance && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Insurer">
              <TextInput style={u.input} value={issuer} onChangeText={setIssuer} placeholder="Progressive" placeholderTextColor={C.faint} maxLength={100} />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Policy number">
              <TextInput style={u.input} value={number} onChangeText={setNumber} placeholder="As printed" placeholderTextColor={C.faint} maxLength={60} />
            </Field>
          </View>
        </View>
      )}
      <Field label={insurance ? 'Policy ends' : 'Registration ends'} hint="MM/DD/YYYY">
        <TextInput style={u.input} value={ends} onChangeText={(t) => setEnds(asDate(t))} keyboardType="number-pad"
          maxLength={10} placeholder="03/31/2027" placeholderTextColor={C.faint} />
      </Field>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <Button kind="secondary" label="Cancel" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
        <Button label="Upload" onPress={save} busy={saving} disabled={!file} style={{ flex: 1 }} />
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
  dropTitle: { fontSize: 14.5, lineHeight: 20, fontFamily: Fonts.poppinsSemiBold, color: C.ink },
});
