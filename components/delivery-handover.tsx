import { useAppAlert } from '@/components/app-alert';
import { Text, TextInput } from '@/components/scaled-text';
import { Fonts } from '@/constants/theme';
import { SkoFyApi } from '@/services/api';
import * as Location from 'expo-location';
import { PackageCheck, ShieldCheck } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';

const CODE_LENGTH = 4;

// Handing a Pickup & Drop order over: ask for the customer's drop-off code,
// enter it at the drop-off, done. The server checks the code and that the
// phone is at the drop-off (app/services/delivery_service.py).
export function DeliveryHandover({ jobId, onDelivered, recipientName }: {
  jobId: string; onDelivered: () => void;
  /** Sent by the customer: who receives it — the customer sends them the code. */
  recipientName?: string | null;
}) {
  const appAlert = useAppAlert();
  const inputRef = useRef<TextInput>(null);
  const [code, setCode] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const requestCode = async () => {
    setRequesting(true);
    try {
      await SkoFyApi.jobs.requestDeliveryCode(jobId);
      appAlert.show(
        'success', 'Ask for the code',
        recipientName
          ? `The customer is sending ${recipientName} a 4-digit code. Ask ${recipientName} for it.`
          : 'The customer now sees a 4-digit drop-off code in their app.',
      );
      inputRef.current?.focus();
    } catch (err: any) {
      appAlert.show('error', 'Could not get a code', err?.message ?? 'Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  const confirm = async () => {
    if (code.length !== CODE_LENGTH) return;
    setVerifying(true);
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
      if (!loc) {
        appAlert.show('error', 'Location needed', 'Turn on location to confirm the delivery.');
        return;
      }
      await SkoFyApi.jobs.verifyDeliveryCode(jobId, code, loc.coords.latitude, loc.coords.longitude);
      setCode('');
      onDelivered();
    } catch (err: any) {
      if (err?.error_code === 'NOT_AT_LOCATION') {
        appAlert.show('warning', 'Not at the drop-off', err.message ?? 'You need to be at the drop-off address.');
      } else {
        appAlert.show('error', 'Wrong code', err?.message ?? 'That code is incorrect or expired.');
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <ShieldCheck size={16} color="#111827" />
        <Text style={s.title}>Hand over the order</Text>
      </View>
      <Text style={s.body}>
        {recipientName
          ? `At the drop-off, tap below — the customer sends ${recipientName} a 4-digit code. Ask ${recipientName} for it.`
          : 'At the drop-off, ask the customer for the 4-digit code on their screen.'}
      </Text>

      <TouchableOpacity style={[s.secondary, requesting && s.dim]} onPress={requestCode} disabled={requesting}>
        <Text style={s.secondaryText}>{requesting ? 'Sending…' : 'Ask for the drop-off code'}</Text>
      </TouchableOpacity>

      <Pressable style={s.boxes} onPress={() => inputRef.current?.focus()}>
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <View key={i} style={[s.box, code[i] ? s.boxFilled : null]}>
            <Text style={s.digit}>{code[i] ?? ''}</Text>
          </View>
        ))}
      </Pressable>
      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        style={s.hiddenInput}
        caretHidden
      />

      <TouchableOpacity
        style={[s.primary, (code.length !== CODE_LENGTH || verifying) && s.dim]}
        onPress={confirm}
        disabled={code.length !== CODE_LENGTH || verifying}
      >
        <PackageCheck size={20} color="#fff" />
        <Text style={s.primaryText}>{verifying ? 'Checking…' : 'Confirm delivery'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 10, marginTop: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: '#111827' },
  body: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppins, color: '#6B7280' },
  secondary: { height: 46, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  secondaryText: { fontSize: 14, fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
  boxes: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginVertical: 4 },
  box: { width: 54, height: 60, borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB' },
  boxFilled: { borderColor: '#FFCE48', backgroundColor: '#FFFBEB' },
  digit: { fontSize: 24, fontFamily: Fonts.poppinsBold, color: '#111827' },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  primary: { height: 52, borderRadius: 16, backgroundColor: '#10B981', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { fontSize: 15, fontFamily: Fonts.poppinsBold, color: '#fff' },
  dim: { opacity: 0.6 },
});
