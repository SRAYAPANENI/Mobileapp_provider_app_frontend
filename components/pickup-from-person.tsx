import { Text, TextInput } from '@/components/scaled-text';
import { Fonts } from '@/constants/theme';
import { SkoFyApi } from '@/services/api';
import { PickupDetails } from '@/services/pickupDelivery';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ban, Camera, CheckSquare, Home, Phone, Square } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

interface Props {
  jobId: string;
  item: string | null | undefined;
  value: number | null | undefined;
  details: PickupDetails | null | undefined;
  /** All three checks are ticked: the item may be taken (Confirm Pickup). */
  onCheckedChange: (checked: boolean) => void;
  /** Where the provider is — the refusal is only accepted at the pickup. */
  getCoords: () => Promise<{ latitude: number; longitude: number } | null>;
  onRefused: () => void;
  onError: (title: string, message: string) => void;
}

const DEFAULT_BANNED = 'alcohol, tobacco or vapes, cannabis, medication, weapons, cash, or anything illegal';
type Reason = { key: string; label: string; photo?: boolean };

const DEFAULT_REASONS: Reason[] = [
  { key: 'prohibited', label: "Looks like an item we can't carry" },
  { key: 'mismatch', label: 'Not what the customer described' },
  { key: 'not_shown', label: "Wouldn't show the item" },
  { key: 'nobody_there', label: 'Nobody there to hand it over', photo: true },
];

// A pickup from a person (any address, e.g. a friend's house): who hands it
// over, what the customer said it is, and the check before taking it — see
// it, it matches, it isn't on the list. Or refuse it: the job is cancelled
// and the trip is still paid (server: JobService.refuse_pickup).
export function PickupFromPerson({ jobId, item, value, details, onCheckedChange, getCoords, onRefused, onError }: Props) {
  const [rules, setRules] = useState<{ banned: string; refusal_reasons: Reason[] }>({ banned: DEFAULT_BANNED, refusal_reasons: DEFAULT_REASONS });
  const [checks, setChecks] = useState([false, false, false]);
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  // A photo of the door, for the reasons that need one ("nobody there").
  const [photo, setPhoto] = useState<{ uri: string; mimeType: string } | null>(null);
  const [sending, setSending] = useState(false);

  // The boxes start unticked each time this card mounts (the manage modal
  // unmounts it when closed) — so must the parent's Confirm Pickup gate.
  useEffect(() => {
    onCheckedChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    SkoFyApi.jobs.getPersonPickupRules()
      .then((r) => setRules({ banned: r.banned, refusal_reasons: r.refusal_reasons }))
      .catch(() => {});
  }, []);

  const checkLabels = [
    'I can see the item',
    `It matches: ${item || 'what the customer described'}`,
    `It isn't ${rules.banned}`,
  ];

  const toggle = (i: number) => {
    const next = checks.map((c, j) => (j === i ? !c : c));
    setChecks(next);
    onCheckedChange(next.every(Boolean));
  };

  const needsPhoto = !!rules.refusal_reasons.find((r) => r.key === reason)?.photo;
  const canSend = !!reason && (!needsPhoto || !!photo) && !sending;

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      onError('Camera Permission Required', 'Allow camera access to take a photo of the door.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      setPhoto({ uri: result.assets[0].uri, mimeType: result.assets[0].mimeType || 'image/jpeg' });
    }
  };

  const refuse = async () => {
    if (!canSend || !reason) return;
    setSending(true);
    try {
      const coords = await getCoords();
      if (!coords) {
        onError('Location Required', 'Turn on location — the refusal is recorded at the pickup.');
        return;
      }
      await SkoFyApi.jobs.refusePickup(
        jobId, reason, coords.latitude, coords.longitude, note.trim(), needsPhoto && photo ? photo : undefined,
      );
      setRefusing(false);
      onRefused();
    } catch (err: any) {
      onError(
        err?.error_code === 'NOT_AT_LOCATION' ? 'Too Far From Pickup' : 'Could Not Refuse',
        err?.message ?? 'Please try again.',
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Home size={16} color="#111827" />
        <Text style={s.title}>Pickup from a person</Text>
      </View>

      <View style={s.row}>
        <Text style={s.label}>Item</Text>
        <Text style={s.value}>{item || '—'}</Text>
      </View>
      {value != null && (
        <View style={s.row}>
          <Text style={s.label}>Worth (customer says)</Text>
          <Text style={s.value}>${Number(value).toFixed(2)}</Text>
        </View>
      )}
      {!!details?.handover_name && (
        <View style={s.row}>
          <Text style={s.label}>Handing it over</Text>
          <Text style={s.value}>{details.handover_name}</Text>
        </View>
      )}
      {!!details?.handover_phone && (
        <TouchableOpacity style={s.call} onPress={() => Linking.openURL(`tel:${details.handover_phone}`)}>
          <Phone size={14} color="#2563EB" />
          <Text style={s.callText}>Call {details.handover_name || 'them'} · {details.handover_phone}</Text>
        </TouchableOpacity>
      )}

      <Text style={s.checkTitle}>Before you take it — ask to see it:</Text>
      {checkLabels.map((label, i) => (
        <TouchableOpacity key={i} style={s.check} onPress={() => toggle(i)}>
          {checks[i] ? <CheckSquare size={18} color="#10B981" /> : <Square size={18} color="#9CA3AF" />}
          <Text style={s.checkText}>{label}</Text>
        </TouchableOpacity>
      ))}
      <Text style={s.hint}>A sealed box you can't check? You can refuse it.</Text>

      <TouchableOpacity style={s.refuseBtn} onPress={() => { setReason(null); setNote(''); setPhoto(null); setRefusing(true); }}>
        <Ban size={16} color="#B91C1C" />
        <Text style={s.refuseText}>Can't take it</Text>
      </TouchableOpacity>

      <Modal visible={refusing} transparent animationType="fade" onRequestClose={() => setRefusing(false)}>
        <KeyboardAvoidingView behavior="padding" style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Not taking the item</Text>
            <Text style={s.sheetSub}>The job is cancelled and your trip fee is kept. The customer is told why.</Text>
            {rules.refusal_reasons.map((r) => (
              <TouchableOpacity key={r.key} style={[s.reason, reason === r.key && s.reasonOn]} onPress={() => setReason(r.key)}>
                <Text style={[s.reasonText, reason === r.key && s.reasonTextOn]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
            {needsPhoto && (
              <TouchableOpacity style={s.photoBtn} onPress={takePhoto} disabled={sending}>
                {photo
                  ? <Image source={{ uri: photo.uri }} style={s.photoThumb} contentFit="cover" />
                  : <Camera size={18} color="#374151" />}
                <Text style={s.photoText}>
                  {photo ? 'Retake the photo' : 'Take a photo of the door — it shows you were there'}
                </Text>
              </TouchableOpacity>
            )}
            <TextInput
              style={s.note}
              placeholder="Anything support should know? (optional)"
              placeholderTextColor="#9CA3AF"
              value={note}
              onChangeText={setNote}
              maxLength={300}
              multiline
            />
            <View style={s.sheetButtons}>
              <TouchableOpacity style={s.secondary} onPress={() => setRefusing(false)} disabled={sending}>
                <Text style={s.secondaryText}>Go back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.primary, !canSend && { opacity: 0.5 }]} onPress={refuse} disabled={!canSend}>
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Refuse item</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginTop: 12, padding: 14, borderRadius: 14, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', gap: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  title: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: '#111827' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  label: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppins, color: '#6B7280' },
  value: { flexShrink: 1, textAlign: 'right', fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
  call: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  callText: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: '#2563EB' },
  checkTitle: { marginTop: 6, fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: '#111827' },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 3 },
  checkText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppins, color: '#111827' },
  hint: { fontSize: 11.5, lineHeight: 16, fontFamily: Fonts.poppins, color: '#6B7280' },
  refuseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6,
    paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2',
  },
  refuseText: { fontSize: 13.5, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: '#B91C1C' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: '#fff', borderRadius: 20, padding: 20, gap: 8 },
  sheetTitle: { fontSize: 17, lineHeight: 22, fontFamily: Fonts.poppinsBold, color: '#111827' },
  sheetSub: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppins, color: '#6B7280', marginBottom: 4 },
  reason: { paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  reasonOn: { borderColor: '#B91C1C', backgroundColor: '#FEF2F2' },
  reasonText: { fontSize: 13.5, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: '#374151' },
  reasonTextOn: { color: '#B91C1C' },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12,
    borderWidth: 1, borderStyle: 'dashed', borderColor: '#9CA3AF',
  },
  photoThumb: { width: 40, height: 40, borderRadius: 8 },
  photoText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: '#374151' },
  note: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 10, minHeight: 60,
    fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppins, color: '#111827', textAlignVertical: 'top',
  },
  sheetButtons: { flexDirection: 'row', gap: 10, marginTop: 6 },
  secondary: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: '#F3F4F6' },
  secondaryText: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: '#374151' },
  primary: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: '#B91C1C' },
  primaryText: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppinsBold, color: '#fff' },
});
