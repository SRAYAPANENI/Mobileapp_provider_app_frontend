import { Text, TextInput } from '@/components/scaled-text';
import { Fonts } from '@/constants/theme';
import { SkoFyApi } from '@/services/api';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Camera, CheckCircle2, Clock, ShieldAlert, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';

interface Props {
  jobId: string;
  confidence: string | null | undefined;
  disputed: boolean;
  onChanged: () => void;
  onError: (title: string, message: string) => void;
}

// After the report: is the inspection confirmed? The customer confirms in
// their app — one tap, the one way (an end code to read out added nothing:
// it lived in the same app). Unanswered, it's paid in 24 hours if all is in
// order. If they say it wasn't done, the visiting fee is held and you add
// your side for support (docs/MONEY_RULES_DESIGN.md §4–5).
export function InspectionStatus({ jobId, confidence, disputed, onChanged, onError }: Props) {
  const [statement, setStatement] = useState('');
  const [photos, setPhotos] = useState<{ uri: string; mimeType: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const addPhoto = async () => {
    if (photos.length >= 3) return;
    const shot = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!shot.canceled && shot.assets[0]) {
      setPhotos((prev) => [...prev, { uri: shot.assets[0].uri, mimeType: shot.assets[0].mimeType || 'image/jpeg' }]);
    }
  };

  const sendStatement = async () => {
    setSending(true);
    try {
      await SkoFyApi.provider.addDisputeStatement(jobId, statement.trim(), photos);
      setSent(true);
    } catch (err: any) {
      onError('Could Not Send', err?.message ?? 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (confidence === 'CONFIRMED') {
    return (
      <View style={[s.card, s.ok]}>
        <CheckCircle2 size={16} color="#059669" />
        <Text style={s.okText}>The customer confirmed the inspection — your visiting fee is on its way.</Text>
      </View>
    );
  }

  if (disputed) {
    return (
      <View style={[s.card, s.warn]}>
        <View style={s.row}>
          <ShieldAlert size={16} color="#B45309" />
          <Text style={s.warnTitle}>The customer says the inspection wasn't done</Text>
        </View>
        <Text style={s.body}>Your visiting fee is held while support reviews it. Add your side — what you did, and photos.</Text>
        {sent ? (
          <Text style={s.okText}>Sent — support will see it.</Text>
        ) : (
          <>
            <TextInput
              style={s.input}
              placeholder="e.g. I was there 25 minutes and checked the outdoor unit and the thermostat."
              placeholderTextColor="#9CA3AF"
              value={statement}
              onChangeText={setStatement}
              multiline
              maxLength={2000}
            />
            <View style={s.photos}>
              {photos.map((p, i) => (
                <View key={p.uri}>
                  <Image source={{ uri: p.uri }} style={s.thumb} contentFit="cover" />
                  <TouchableOpacity style={s.remove} onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}>
                    <X size={10} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              {photos.length < 3 && (
                <TouchableOpacity style={s.add} onPress={addPhoto}>
                  <Camera size={16} color="#374151" />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[s.button, (statement.trim().length < 10 || sending) && { opacity: 0.5 }]}
              onPress={sendStatement}
              disabled={statement.trim().length < 10 || sending}
            >
              {sending ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Send my side</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={s.card}>
      <View style={s.row}>
        <Clock size={16} color="#374151" />
        <Text style={s.title}>Waiting for the customer to confirm</Text>
      </View>
      <Text style={s.body}>
        {confidence === 'REVIEW'
          ? 'Support will check this one before the visiting fee is paid — ask the customer to confirm in their app.'
          : 'They confirm with one tap in their app. If they don’t answer, it’s paid in 24 hours if all is in order.'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginBottom: 10, padding: 12, borderRadius: 14, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', gap: 8 },
  ok: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  okText: { flex: 1, fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.poppinsSemiBold, color: '#047857' },
  warn: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  warnTitle: { flex: 1, fontSize: 13.5, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: '#92400E' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 13.5, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: '#111827' },
  body: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.poppins, color: '#4B5563' },
  input: {
    minHeight: 80, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 10, backgroundColor: '#FFFFFF',
    fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppins, color: '#111827', textAlignVertical: 'top',
  },
  photos: { flexDirection: 'row', gap: 8 },
  thumb: { width: 52, height: 52, borderRadius: 8 },
  remove: { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  add: { width: 52, height: 52, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: '#9CA3AF', alignItems: 'center', justifyContent: 'center' },
  button: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#111827' },
  buttonText: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppinsBold, color: '#FFFFFF' },
});
