import { Text, TextInput } from '@/components/scaled-text';
import { Fonts } from '@/constants/theme';
import { SkoFyApi } from '@/services/api';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Camera, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';

const MAX_PHOTOS = 5;

interface Props {
  jobId: string;
  getCoords: () => Promise<{ latitude: number; longitude: number } | null>;
  onSubmitted: () => void;
  onError: (title: string, message: string) => void;
}

// Finishing an inspection: what you found, photos taken here and now (the
// camera — not the gallery), and whether work is needed. The customer then
// confirms it; until they do — or the hold passes — the visiting fee waits
// (docs/MONEY_RULES_DESIGN.md §4).
export function InspectionReportForm({ jobId, getCoords, onSubmitted, onError }: Props) {
  const [findings, setFindings] = useState('');
  const [result, setResult] = useState<'QUOTE' | 'NO_WORK'>('QUOTE');
  const [photos, setPhotos] = useState<{ uri: string; mimeType: string }[]>([]);
  const [sending, setSending] = useState(false);

  const takePhoto = async () => {
    if (photos.length >= MAX_PHOTOS) return;
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      onError('Camera Permission Required', 'Allow camera access to photograph what you inspected.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!shot.canceled && shot.assets[0]) {
      setPhotos((prev) => [...prev, { uri: shot.assets[0].uri, mimeType: shot.assets[0].mimeType || 'image/jpeg' }]);
    }
  };

  const ready = findings.trim().length >= 10 && photos.length > 0 && !sending;

  const submit = async () => {
    if (!ready) return;
    setSending(true);
    try {
      const coords = await getCoords();
      if (!coords) {
        onError('Location Required', 'Turn on location — the report is sent from the job.');
        return;
      }
      await SkoFyApi.jobs.submitInspectionReport(jobId, findings.trim(), result, coords.latitude, coords.longitude, photos);
      onSubmitted();
    } catch (err: any) {
      onError(err?.error_code === 'NOT_AT_LOCATION' ? 'Not at the Job' : 'Could Not Send', err?.message ?? 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={s.card}>
      <Text style={s.title}>Inspection report</Text>
      <Text style={s.hint}>The customer sees this and confirms the inspection is done.</Text>
      <TextInput
        style={s.input}
        placeholder="What did you find? e.g. The compressor fan is seized; the coil is clean."
        placeholderTextColor="#9CA3AF"
        value={findings}
        onChangeText={setFindings}
        multiline
        maxLength={2000}
      />
      <View style={s.toggle}>
        {([['QUOTE', 'Work needed'], ['NO_WORK', 'No work needed']] as const).map(([key, label]) => (
          <TouchableOpacity key={key} style={[s.chip, result === key && s.chipOn]} onPress={() => setResult(key)}>
            <Text style={[s.chipText, result === key && s.chipTextOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={s.photos}>
        {photos.map((p, i) => (
          <View key={p.uri}>
            <Image source={{ uri: p.uri }} style={s.thumb} contentFit="cover" />
            <TouchableOpacity style={s.remove} onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}>
              <X size={10} color="#fff" />
            </TouchableOpacity>
          </View>
        ))}
        {photos.length < MAX_PHOTOS && (
          <TouchableOpacity style={s.add} onPress={takePhoto}>
            <Camera size={18} color="#374151" />
            <Text style={s.addText}>Photo</Text>
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity style={[s.submit, !ready && { opacity: 0.5 }]} onPress={submit} disabled={!ready}>
        {sending ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Send report</Text>}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginBottom: 10, padding: 12, borderRadius: 14, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', gap: 8 },
  title: { fontSize: 14.5, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: '#111827' },
  hint: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.poppins, color: '#6B7280' },
  input: {
    minHeight: 84, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 10, backgroundColor: '#FFFFFF',
    fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppins, color: '#111827', textAlignVertical: 'top',
  },
  toggle: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, paddingVertical: 9, borderRadius: 999, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  chipOn: { borderColor: '#111827', backgroundColor: '#FEF3C7' },
  chipText: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.poppinsSemiBold, color: '#6B7280' },
  chipTextOn: { color: '#111827' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 60, height: 60, borderRadius: 10 },
  remove: { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  add: { width: 60, height: 60, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#9CA3AF', alignItems: 'center', justifyContent: 'center', gap: 2 },
  addText: { fontSize: 10.5, lineHeight: 14, fontFamily: Fonts.poppinsSemiBold, color: '#374151' },
  submit: { paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: '#111827' },
  submitText: { fontSize: 14.5, lineHeight: 19, fontFamily: Fonts.poppinsBold, color: '#FFFFFF' },
});
