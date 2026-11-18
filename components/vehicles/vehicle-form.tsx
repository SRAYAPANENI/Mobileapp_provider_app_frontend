import { useAppAlert } from '@/components/app-alert';
import { Button, C, Field, u } from '@/components/business/ui';
import { StatePicker } from '@/components/business/state-picker';
import { TextInput } from '@/components/scaled-text';
import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { NewVehicle, PickedFile, VehicleType } from '@/services/api';
import { asDate, isoDate } from '@/services/usDate';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { usePhotoPicker } from '@/components/photo-picker';
import { Camera, FileCheck2, Upload } from 'lucide-react-native';
import { VehicleIcon } from './vehicle-icon';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

// Adding a vehicle (skofy-backend app/domain/vehicles.py): what it is, its
// plate, a photo of its front with the plate readable, one of where things
// go, and its registration. Dodorez checks the photos against the plate and
// the registration before car-trunk or van-size trips reach the provider.

export const VEHICLE_TYPES: { value: VehicleType; label: string; takes: string }[] = [
  { value: 'CAR', label: 'Car', takes: 'Car-trunk loads' },
  { value: 'SUV', label: 'SUV', takes: 'Car-trunk loads' },
  { value: 'MINIVAN', label: 'Minivan', takes: 'Car-trunk loads' },
  { value: 'PICKUP_TRUCK', label: 'Pickup truck', takes: 'Car-trunk and van loads' },
  { value: 'CARGO_VAN', label: 'Cargo van', takes: 'Car-trunk and van loads' },
  { value: 'BOX_TRUCK', label: 'Box truck', takes: 'Car-trunk and van loads' },
];

type PhotoSlot = 'front_photo' | 'cargo_photo';
const PHOTO_SLOTS: { key: PhotoSlot; title: string; hint: string }[] = [
  { key: 'front_photo', title: 'Front, plate readable', hint: 'Stand back so the whole front shows' },
  { key: 'cargo_photo', title: 'Where things go', hint: 'The trunk, bed or cargo area, open' },
];

interface Props {
  onSubmit: (vehicle: NewVehicle) => Promise<void>;
  onCancel: () => void;
}

export function VehicleForm({ onSubmit, onCancel }: Props) {
  const alert = useAppAlert();
  // Camera or gallery, in the app's own popup (components/photo-picker.tsx).
  const photoPicker = usePhotoPicker();
  const [type, setType] = useState<VehicleType | null>(null);
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [colour, setColour] = useState('');
  const [plate, setPlate] = useState('');
  const [plateState, setPlateState] = useState('');
  const [photos, setPhotos] = useState<Partial<Record<PhotoSlot, PickedFile>>>({});
  const [registration, setRegistration] = useState<PickedFile | null>(null);
  const [regEnds, setRegEnds] = useState('');
  const [saving, setSaving] = useState(false);
  const chosen = VEHICLE_TYPES.find((t) => t.value === type);

  // A JPEG the server can check, shrunk to send quickly (services/photo.ts).
  const choosePhoto = async (slot: PhotoSlot) => {
    const [photo] = await photoPicker.pickPhotos({ title: slot === 'front_photo' ? 'Front of the Vehicle' : 'Cargo Space' });
    if (photo) setPhotos((p) => ({ ...p, [slot]: { uri: photo.uri, name: `${slot}.jpg`, mimeType: photo.mimeType } }));
  };

  // A photo of the registration (kept sharp enough to read), or its PDF.
  const pickRegistrationFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true,
    });
    const asset = result.canceled ? null : result.assets?.[0];
    if (asset) setRegistration({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? 'application/pdf' });
  };
  const pickRegistration = async () => {
    const [photo] = await photoPicker.pickPhotos({
      title: 'Registration', size: 'document',
      extra: { label: 'Choose a File (PDF)', kind: 'file', onPress: () => { void pickRegistrationFile(); } },
    });
    if (photo) setRegistration({ uri: photo.uri, name: 'registration.jpg', mimeType: photo.mimeType });
  };

  const missing = (): string | null => {
    if (!type) return 'Choose what kind of vehicle it is.';
    if (!make.trim() || !model.trim()) return 'Enter the make and model.';
    if (!/^\d{4}$/.test(year.trim())) return 'Enter the year it was made, like 2019.';
    if (!colour.trim()) return 'Enter its colour.';
    if (!plate.trim() || !plateState) return 'Enter the plate number and its state.';
    if (!photos.front_photo || !photos.cargo_photo) return 'Add both photos.';
    if (!registration) return 'Add the registration.';
    if (!isoDate(regEnds)) return 'Enter when the registration ends, as MM/DD/YYYY.';
    return null;
  };

  const save = async () => {
    const problem = missing();
    if (problem) {
      alert.show('warning', 'Almost there', problem);
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        vehicle_type: type!, make: make.trim(), model: model.trim(), year: year.trim(), colour: colour.trim(),
        plate: plate.trim(), plate_state: plateState, registration_expires_on: isoDate(regEnds)!,
        front_photo: photos.front_photo!, cargo_photo: photos.cargo_photo!, registration: registration!,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <Field label="What is it?">
        <View style={s.types}>
          {VEHICLE_TYPES.map((t) => {
            const on = type === t.value;
            return (
              <TouchableOpacity key={t.value} style={[s.type, on && s.typeOn]} onPress={() => setType(t.value)} activeOpacity={0.8}>
                <VehicleIcon type={t.value} size={22} color={on ? '#FFFFFF' : C.body} />
                <ThemedText style={[s.typeText, on && s.typeTextOn]} numberOfLines={1}>{t.label}</ThemedText>
              </TouchableOpacity>
            );
          })}
        </View>
        {chosen && <ThemedText style={u.muted}>{chosen.takes} — once it's checked.</ThemedText>}
      </Field>

      <View style={s.pair}>
        <View style={s.half}>
          <Field label="Make">
            <TextInput style={u.input} value={make} onChangeText={setMake} placeholder="Ford" placeholderTextColor={C.faint} maxLength={40} />
          </Field>
        </View>
        <View style={s.half}>
          <Field label="Model">
            <TextInput style={u.input} value={model} onChangeText={setModel} placeholder="Transit" placeholderTextColor={C.faint} maxLength={40} />
          </Field>
        </View>
      </View>
      <View style={s.pair}>
        <View style={s.half}>
          <Field label="Year">
            <TextInput style={u.input} value={year} onChangeText={(t) => setYear(t.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad" placeholder="2019" placeholderTextColor={C.faint} />
          </Field>
        </View>
        <View style={s.half}>
          <Field label="Colour">
            <TextInput style={u.input} value={colour} onChangeText={setColour} placeholder="White" placeholderTextColor={C.faint} maxLength={20} />
          </Field>
        </View>
      </View>
      <View style={s.pair}>
        <View style={s.half}>
          <Field label="Plate number">
            <TextInput style={u.input} value={plate} autoCapitalize="characters" maxLength={10}
              onChangeText={(t) => setPlate(t.toUpperCase())} placeholder="7ABC123" placeholderTextColor={C.faint} />
          </Field>
        </View>
        <View style={s.half}>
          <Field label="State">
            <StatePicker value={plateState} onChange={setPlateState} title="State on the plate" />
          </Field>
        </View>
      </View>

      <Field label="Photos" hint="Checked against the plate">
        <View style={s.pair}>
          {PHOTO_SLOTS.map((slot) => {
            const photo = photos[slot.key];
            return (
              <TouchableOpacity key={slot.key} style={[s.photo, photo && s.photoFilled]} onPress={() => choosePhoto(slot.key)} activeOpacity={0.85}>
                {photo ? <Image source={{ uri: photo.uri }} style={s.photoImage} contentFit="cover" /> : (
                  <View style={s.photoEmpty}>
                    <Camera size={22} color={C.muted} />
                    <ThemedText style={s.photoTitle}>{slot.title}</ThemedText>
                    <ThemedText style={[u.muted, { textAlign: 'center', fontSize: 11.5 }]}>{slot.hint}</ThemedText>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </Field>

      <Field label="Registration">
        <TouchableOpacity style={[s.drop, registration && s.dropFilled]} onPress={pickRegistration} activeOpacity={0.8}>
          {registration ? <FileCheck2 size={22} color={C.ok} /> : <Upload size={22} color={C.muted} />}
          <View style={{ flex: 1 }}>
            <ThemedText style={s.dropTitle} numberOfLines={1}>{registration ? registration.name : 'Choose the registration card'}</ThemedText>
            <ThemedText style={u.muted}>{registration ? 'Tap to choose another' : 'PDF, or a clear photo of it'}</ThemedText>
          </View>
        </TouchableOpacity>
      </Field>
      <Field label="Registration ends" hint="MM/DD/YYYY">
        <TextInput style={u.input} value={regEnds} onChangeText={(t) => setRegEnds(asDate(t))} keyboardType="number-pad"
          maxLength={10} placeholder="03/31/2027" placeholderTextColor={C.faint} />
      </Field>

      <ThemedText style={u.muted}>
        We check it usually within a day. Customers see the vehicle on your application, and its plate once they hire
        you — so they know it when you pull up.
      </ThemedText>
      <View style={s.pair}>
        <Button kind="secondary" label="Cancel" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
        <Button label="Send for checking" onPress={save} busy={saving} style={{ flex: 1.4 }} />
      </View>
      {alert.element}
      {photoPicker.element}
    </View>
  );
}

const s = StyleSheet.create({
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  type: {
    flexBasis: '31%', flexGrow: 1, alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: 14,
    borderWidth: 1, borderColor: '#DDE1E7', backgroundColor: C.card,
  },
  typeOn: { backgroundColor: C.ink, borderColor: C.ink },
  typeText: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.poppinsSemiBold, color: C.body },
  typeTextOn: { color: '#FFFFFF' },
  pair: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  photo: {
    flex: 1, height: 132, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#CBD2DB',
    backgroundColor: '#FBFCFD', overflow: 'hidden',
  },
  photoFilled: { borderStyle: 'solid', borderColor: '#A7D8C3' },
  photoImage: { width: '100%', height: '100%' },
  photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 10 },
  photoTitle: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.poppinsSemiBold, color: C.ink, textAlign: 'center' },
  drop: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#CBD2DB', backgroundColor: '#FBFCFD',
  },
  dropFilled: { borderStyle: 'solid', borderColor: '#A7D8C3', backgroundColor: C.okSoft },
  dropTitle: { fontSize: 14.5, lineHeight: 20, fontFamily: Fonts.poppinsSemiBold, color: C.ink },
});
