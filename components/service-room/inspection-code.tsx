import { MapPin } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import { Pressable, TextInput, TouchableOpacity, View } from 'react-native';
import { showDialog } from '@/components/alert-host';
import { ThemedText } from '@/components/themed-text';
import { SkoFyApi } from '@/services/api';
import { currentPosition } from '@/services/live-position';
import { roomStyles as s } from './styles';

// At the customer's place: ask for the 4-digit code on their screen, enter it,
// and the inspection starts — checked against where the provider is.

export function InspectionCode({ jobId, onVerified, arrived, atYourPlace = false }: {
  jobId: string;
  onVerified: () => void;
  /** "I'm here" recorded at the customer's: the code is asked for only then (the server too). */
  arrived: boolean;
  /** The job is at the provider's own place: the customer comes, and shows the code there. */
  atYourPlace?: boolean;
}) {
  const [code, setCode] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const request = async () => {
    setRequesting(true);
    try {
      await SkoFyApi.jobs.requestInspectionOtp(jobId);
      showDialog('Code Sent', 'Ask the customer for the 4-digit code on their screen.', undefined, { type: 'success' });
    } catch (err: any) {
      showDialog('Failed', err?.message ?? 'Could not request the inspection code. Please try again.', undefined, { type: 'error' });
    } finally {
      setRequesting(false);
    }
  };

  const verify = async () => {
    if (code.length !== 4) return;
    const coords = await currentPosition();
    if (!coords) {
      showDialog('Location Required', 'Turn on location to start the inspection.', undefined, { type: 'error' });
      return;
    }
    setVerifying(true);
    try {
      await SkoFyApi.jobs.verifyInspectionOtp(jobId, code, coords.latitude, coords.longitude);
      setCode('');
      onVerified();
    } catch (err: any) {
      if (err?.error_code === 'NOT_AT_LOCATION') {
        showDialog('Too Far From Job Site', err.message ?? "You need to be at the customer's location.", undefined, { type: 'warning' });
      } else {
        showDialog('Invalid Code', err?.message ?? 'That code is incorrect or expired.', undefined, { type: 'error' });
      }
    } finally {
      setVerifying(false);
    }
  };

  const intro = (
      <ThemedText style={s.note}>
        {atYourPlace
          ? 'When the customer arrives at your place, ask for the 4-digit code on their screen to start inspecting.'
          : arrived
            ? 'The customer has a 4-digit code on their screen. Ask for it and enter it here to start inspecting.'
            : 'Tap “I’m here” when you arrive — the customer gets a 4-digit code to give you.'}
      </ThemedText>
  );
  // "I'm here" first (the button above): there's no code to enter yet.
  if (!arrived) return intro;

  return (
    <View>
      {intro}
      {/* At the customer's, "I'm here" already sent it: this only sends it again. */}
      {atYourPlace && (
        <TouchableOpacity style={[s.primaryBtn, requesting && { opacity: 0.5 }]} onPress={request} disabled={requesting}>
          <MapPin size={20} color="#fff" />
          <ThemedText style={s.primaryBtnText}>{requesting ? 'Sending…' : 'Show the customer their code'}</ThemedText>
        </TouchableOpacity>
      )}

      <ThemedText style={s.otpLabel}>Enter the 4-digit code</ThemedText>
      <View style={s.otpContainer}>
        <Pressable onPress={() => inputRef.current?.focus()} style={s.otpBoxesRow} accessibilityLabel="Enter the 4-digit code">
          {[0, 1, 2, 3].map((idx) => {
            const digit = code[idx] || '';
            const focused = code.length === idx || (code.length === 4 && idx === 3);
            return (
              <View key={idx} style={[s.otpBox, digit ? s.otpBoxFilled : null, focused ? s.otpBoxFocused : null]}>
                <ThemedText style={[s.otpDigit, digit ? s.otpDigitFilled : null]}>{digit}</ThemedText>
              </View>
            );
          })}
        </Pressable>
        <TextInput
          ref={inputRef}
          style={s.hiddenInput}
          keyboardType="number-pad"
          maxLength={4}
          value={code}
          onChangeText={(text) => setCode(text.replace(/[^0-9]/g, ''))}
          caretHidden
        />
      </View>
      <TouchableOpacity
        style={[s.primaryBtn, (verifying || code.length !== 4) && { opacity: 0.5 }]}
        onPress={verify}
        disabled={verifying || code.length !== 4}
      >
        <ThemedText style={s.primaryBtnText}>{verifying ? 'Verifying…' : 'Verify & Start Inspection'}</ThemedText>
      </TouchableOpacity>
      {!atYourPlace && (
        <TouchableOpacity onPress={request} disabled={requesting} style={{ paddingVertical: 12 }} accessibilityRole="button">
          <ThemedText style={[s.note, { textAlign: 'center', textDecorationLine: 'underline', marginBottom: 0 }]}>
            {requesting ? 'Sending…' : 'Customer can’t see a code? Send it again'}
          </ThemedText>
        </TouchableOpacity>
      )}
    </View>
  );
}
