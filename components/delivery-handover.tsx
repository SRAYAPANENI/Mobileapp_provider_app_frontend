import { useAppAlert } from '@/components/app-alert';
import { CodeHandoverForm } from '@/components/code-handover-form';
import { Text } from '@/components/scaled-text';
import { Fonts } from '@/constants/theme';
import { SkoFyApi } from '@/services/api';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Camera, CheckCircle2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';

// Handing back what the customer is waiting for: a Pickup & Drop order at the
// drop-off, or what was left in your care (kind "care"). A delivery is
// photographed at the drop-off first — what was handed over, kept with the
// job — then the customer's code, done. The server checks the code and that
// the phone is at the right place (app/services/delivery_service.py).
export function DeliveryHandover({ jobId, onDelivered, recipientName, kind = 'delivery', photoUrl, onPhotoSaved }: {
  jobId: string; onDelivered: () => void;
  /** Sent by the customer: who receives it — the customer sends them the code. */
  recipientName?: string | null;
  kind?: 'delivery' | 'care';
  /** A delivery: the drop-off photo already saved for this job, if any. */
  photoUrl?: string | null;
  onPhotoSaved?: () => void;
}) {
  const care = kind === 'care';
  const appAlert = useAppAlert();
  // What's shown: the photo just taken, else the one saved before (a reopened screen).
  const [taken, setTaken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const shown = taken ?? photoUrl ?? null;

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      appAlert.show('warning', 'Camera Permission Required', 'Allow camera access in your device settings to photograph the delivery.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    const asset = !result.canceled ? result.assets[0] : null;
    if (!asset) return;
    setSaving(true);
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
      if (!loc) {
        appAlert.show('error', 'Location needed', 'Turn on location — the photo only counts at the drop-off.');
        return;
      }
      await SkoFyApi.jobs.uploadDropoffPhoto(
        jobId, { uri: asset.uri, mimeType: asset.mimeType || 'image/jpeg' }, loc.coords.latitude, loc.coords.longitude,
      );
      setTaken(asset.uri);
      onPhotoSaved?.();
    } catch (err: any) {
      appAlert.show(
        err?.error_code === 'NOT_AT_LOCATION' ? 'warning' : 'error',
        err?.error_code === 'NOT_AT_LOCATION' ? 'Too Far From the Drop-off' : 'Could Not Save the Photo',
        err?.message ?? 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const photoStep = !care && (
    <View style={s.wrap}>
      <View style={s.header}>
        {shown ? <CheckCircle2 size={16} color="#10B981" /> : <Camera size={16} color="#111827" />}
        <Text style={s.title}>Photo of the order</Text>
      </View>
      <Text style={s.body}>
        {shown
          ? 'Saved with the job. Retake it if it doesn’t show the order clearly.'
          : 'At the drop-off, take a photo that shows the order as you hand it over. It’s kept with the job.'}
      </Text>
      {shown && <Image source={{ uri: shown }} style={s.preview} contentFit="cover" />}
      <TouchableOpacity style={[s.secondary, saving && s.dim]} onPress={takePhoto} disabled={saving}>
        {saving ? <ActivityIndicator color="#111827" /> : (
          <>
            <Camera size={18} color="#111827" />
            <Text style={s.secondaryText}>{shown ? 'Retake Photo' : 'Take Photo'}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <>
      {photoStep}
      {(care || shown) && (
        <CodeHandoverForm
          title={care ? 'Hand it back' : 'Hand over the order'}
          body={care
            ? "When the customer collects it (or you're done at their place), ask for the 4-digit code on their screen."
            : recipientName
              ? `At the drop-off, tap below — the customer sends ${recipientName} a 4-digit code. Ask ${recipientName} for it.`
              : 'At the drop-off, ask the customer for the 4-digit code on their screen.'}
          requestLabel={care ? 'Ask for the hand-back code' : 'Ask for the drop-off code'}
          confirmLabel={care ? 'Confirm hand-back' : 'Confirm delivery'}
          requestedMessage={recipientName
            ? `The customer is sending ${recipientName} a 4-digit code. Ask ${recipientName} for it.`
            : `The customer now sees a 4-digit ${care ? 'hand-back' : 'drop-off'} code in their app.`}
          placeName={care ? 'the hand-back place' : 'the drop-off'}
          onRequest={() => SkoFyApi.jobs.requestDeliveryCode(jobId)}
          onVerify={(code, lat, lng) => SkoFyApi.jobs.verifyDeliveryCode(jobId, code, lat, lng)}
          onDone={onDelivered}
        />
      )}
    </>
  );
}

// The same look as the code form below it (components/code-handover-form.tsx).
const s = StyleSheet.create({
  wrap: { gap: 10, marginTop: 4, marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: '#111827' },
  body: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppins, color: '#6B7280' },
  preview: { width: '100%', height: 180, borderRadius: 14, backgroundColor: '#F3F4F6' },
  secondary: {
    height: 46, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  secondaryText: { fontSize: 14, fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
  dim: { opacity: 0.6 },
});
