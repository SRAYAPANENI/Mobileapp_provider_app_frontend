import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { padBottom } from '@/hooks/use-bottom-inset';
import { useAnswerRecorder } from '@/hooks/use-answer-recorder';
import type { SkillTestQuestion } from '@/services/api';
import { Audio } from 'expo-av';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { Camera, Check, EyeOff, Lock, Mic, RotateCcw, Square, Trash2, UserCheck } from 'lucide-react-native';
import { useTestStrings } from './strings';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';

// Camera skill tests (docs/SKILL_VERIFICATION_DESIGN.md §3): agreeing to the
// recording, the face photo, the small camera that stays on during the test,
// and the spoken questions. A person at Dodorez compares the photos with the
// ID — nothing here (or on the server) reads the face.

const C = {
  bg: '#F8FAFC', card: '#FFFFFF', ink: '#0F172A', body: '#475569', muted: '#94A3B8', line: '#E2E8F0',
  brand: '#FFCE48', brandSoft: '#FFF7DB', brandInk: '#8A6500', bad: '#DC2626', badSoft: '#FEF2F2',
};
const PHOTO_EVERY_MS = 15_000;

/** What being recorded means, agreed before anything is taken. */
export function ConsentStep({ onAgree, bottomInset }: { onAgree: () => void; bottomInset: number }) {
  const t = useTestStrings();
  const [agreed, setAgreed] = useState(false);
  const points = [Camera, Mic, UserCheck, Lock, Trash2].map((Icon, i) => ({ Icon, text: t.consentPoints[i] }));
  return (
    <>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, gap: 12 }}>
        <ThemedText style={s.lead}>{t.consentTitle}</ThemedText>
        <ThemedText style={s.body}>{t.consentWhy}</ThemedText>
        <View style={s.card}>
          {points.map(({ Icon, text }, i) => (
            <View key={i} style={[s.row, i < points.length - 1 && s.rowLine]}>
              <View style={s.icon}><Icon size={16} color={C.brandInk} /></View>
              <ThemedText style={[s.body, { flex: 1 }]}>{text}</ThemedText>
            </View>
          ))}
        </View>
        <TouchableOpacity style={s.agree} onPress={() => setAgreed((a) => !a)} activeOpacity={0.8}
          accessibilityRole="checkbox" accessibilityState={{ checked: agreed }}>
          <View style={[s.box, agreed && s.boxOn]}>{agreed && <Check size={14} color={C.ink} />}</View>
          <ThemedText style={[s.body, { flex: 1, color: C.ink }]}>{t.consentAgree}</ThemedText>
        </TouchableOpacity>
      </ScrollView>
      <View style={padBottom(s.footer, bottomInset)}>
        <TouchableOpacity style={[s.primary, !agreed && s.off]} disabled={!agreed} onPress={onAgree}>
          <ThemedText style={s.primaryText}>{t.continue}</ThemedText>
        </TouchableOpacity>
      </View>
    </>
  );
}

/** A clear photo of their face, then the test starts. */
export function FaceStep({ onReady, bottomInset }: { onReady: (uri: string) => void; bottomInset: number }) {
  const t = useTestStrings();
  const [permission, requestPermission] = useCameraPermissions();
  // The microphone too, here — before the test starts. Asked mid-question,
  // its system prompt would send the app to the background.
  const [mic, requestMic] = Audio.usePermissions();
  const cam = useRef<CameraView>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (permission && !permission.granted && permission.canAskAgain) void requestPermission(); }, [permission?.granted]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (permission?.granted && mic && !mic.granted && mic.canAskAgain) void requestMic();
  }, [permission?.granted, mic?.granted]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!permission || !mic) return <View style={s.center}><ActivityIndicator color={C.brand} /></View>;
  if (permission.granted && !mic.granted) {
    return (
      <View style={s.center}>
        <View style={[s.bigIcon, { backgroundColor: C.badSoft }]}><Mic size={28} color={C.bad} /></View>
        <ThemedText style={[s.body, { textAlign: 'center', marginVertical: 16 }]}>{t.micNeeded}</ThemedText>
        <TouchableOpacity style={[s.primary, { alignSelf: 'stretch' }]}
          onPress={() => (mic.canAskAgain ? requestMic() : Linking.openSettings())}>
          <ThemedText style={s.primaryText}>{mic.canAskAgain ? t.allowMic : t.openSettings}</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }
  if (!permission.granted) {
    return (
      <View style={s.center}>
        <View style={[s.bigIcon, { backgroundColor: C.badSoft }]}><EyeOff size={28} color={C.bad} /></View>
        <ThemedText style={[s.body, { textAlign: 'center', marginVertical: 16 }]}>{t.cameraNeeded}</ThemedText>
        <TouchableOpacity style={[s.primary, { alignSelf: 'stretch' }]}
          onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}>
          <ThemedText style={s.primaryText}>{permission.canAskAgain ? t.allowCamera : t.openSettings}</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  const take = async () => {
    setBusy(true);
    try {
      const shot = await cam.current?.takePictureAsync({ quality: 0.5, shutterSound: false });
      if (shot?.uri) setPhoto(shot.uri);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <View style={{ flex: 1, paddingHorizontal: 20, gap: 12 }}>
        <ThemedText style={s.lead}>{t.faceTitle}</ThemedText>
        <ThemedText style={s.body}>{t.faceHow}</ThemedText>
        <View style={s.viewfinder}>
          {photo
            ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
            : <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="front" animateShutter={false} />}
          {!photo && <View pointerEvents="none" style={s.oval} />}
        </View>
      </View>
      <View style={padBottom([s.footer, { gap: 10 }], bottomInset)}>
        {photo ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={[s.secondary, { flex: 1 }]} onPress={() => setPhoto(null)}>
              <RotateCcw size={16} color={C.ink} />
              <ThemedText style={s.primaryText}>{t.retake}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={[s.primary, { flex: 1.4 }]} onPress={() => onReady(photo)}>
              <ThemedText style={s.primaryText}>{t.startTest}</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={s.primary} onPress={take} disabled={busy}>
            {busy ? <ActivityIndicator color={C.ink} /> : <ThemedText style={s.primaryText}>{t.takePhoto}</ThemedText>}
          </TouchableOpacity>
        )}
      </View>
    </>
  );
}

/** The camera that stays on during a camera test: shown in the corner (they
 * always know it's on) and taking a photo every 15 seconds. */
export function ProctorCam({ onPhoto }: { onPhoto: (uri: string) => void }) {
  const t = useTestStrings();
  const [permission] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const ready = useRef(false);
  const onPhotoRef = useRef(onPhoto);
  onPhotoRef.current = onPhoto;
  useEffect(() => {
    const id = setInterval(async () => {
      if (!ready.current) return;
      try {
        const shot = await cam.current?.takePictureAsync({ quality: 0.3, shutterSound: false, skipProcessing: true });
        if (shot?.uri) onPhotoRef.current(shot.uri);
      } catch { /* a missed photo only counts toward "the camera went quiet" */ }
    }, PHOTO_EVERY_MS);
    return () => clearInterval(id);
  }, []);
  if (!permission?.granted) {
    return <View style={[s.pip, s.pipOff]}><EyeOff size={16} color={C.bad} /></View>;
  }
  return (
    <View style={s.pip} accessibilityLabel={t.cameraOn}>
      <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="front" animateShutter={false}
        onCameraReady={() => { ready.current = true; }} />
      <View style={s.recDot} />
    </View>
  );
}

/** A question answered out loud: record, stop (or stopped at the limit), sent. */
export function SpokenQuestion({ question, submitting, onSend, registerTimeUp }: {
  question: SkillTestQuestion;
  submitting: boolean;
  onSend: (recording: { uri: string; mimeType: string } | null) => void;
  /** The screen's countdown calls this when the question's time is up. */
  registerTimeUp: (fn: () => void) => void;
}) {
  const t = useTestStrings();
  const max = question.max_clip_seconds ?? 60;
  const rec = useAnswerRecorder(max);
  const sent = useRef(false);

  const finish = async () => {
    if (sent.current) return;
    sent.current = true;
    const file = await rec.stop();
    onSend(file && file.seconds >= 1 ? { uri: file.uri, mimeType: file.mimeType } : null);
  };
  rec.onLimit.current = () => { void finish(); };
  useEffect(() => { registerTimeUp(() => { void finish(); }); });

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 14, gap: 16 }}>
      <Animated.View key={question.question_number} entering={FadeInRight.duration(220)} style={s.card}>
        <View style={s.spokenTag}><Mic size={13} color={C.brandInk} /><ThemedText style={s.spokenTagText}>{t.answerOutLoud}</ThemedText></View>
        <ThemedText style={s.question}>{question.question}</ThemedText>
        <ThemedText style={[s.small, { marginTop: 8 }]}>{t.spokenHow(max)}</ThemedText>
      </Animated.View>

      <View style={{ alignItems: 'center', gap: 12 }}>
        {submitting || sent.current ? (
          <Animated.View entering={FadeIn} style={{ alignItems: 'center', gap: 10 }}>
            {submitting ? <ActivityIndicator size="large" color={C.brand} /> : <Mic size={30} color={C.muted} />}
            <ThemedText style={s.body}>{submitting ? t.sending : t.recorded}</ThemedText>
          </Animated.View>
        ) : rec.recording ? (
          <>
            <TouchableOpacity style={[s.mic, s.micOn]} onPress={finish} accessibilityLabel={t.stopAndSend}>
              <Square size={30} color="#fff" fill="#fff" />
            </TouchableOpacity>
            <View style={s.clipRow}>
              <View style={s.recDotBig} />
              <ThemedText style={s.clipTime}>{rec.seconds}s / {max}s</ThemedText>
            </View>
            <ThemedText style={s.small}>{t.tapToStop}</ThemedText>
          </>
        ) : (
          <>
            <TouchableOpacity style={s.mic} onPress={() => void rec.start()} accessibilityLabel={t.startRecording}>
              <Mic size={34} color={C.ink} />
            </TouchableOpacity>
            <ThemedText style={s.small}>{t.tapToStart}</ThemedText>
          </>
        )}
        {!!rec.error && <ThemedText style={[s.small, { color: C.bad, textAlign: 'center' }]}>{rec.error === 'mic' ? t.micNeeded : t.micFailed}</ThemedText>}
      </View>
    </ScrollView>
  );
}

export function CameraRulesNote() {
  const t = useTestStrings();
  return (
    <View style={s.note}>
      <Camera size={15} color={C.brandInk} />
      <ThemedText style={[s.small, { flex: 1, color: C.brandInk }]}>{t.cameraNote}</ThemedText>
    </View>
  );
}


const s = StyleSheet.create({
  lead: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.poppinsBold, color: C.ink },
  body: { fontSize: 14, lineHeight: 21, fontFamily: Fonts.poppins, color: C.body },
  small: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppins, color: C.muted },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.line },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 11 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  icon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brandSoft },
  agree: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.muted, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: C.brand, borderColor: C.brand },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: C.card },
  primary: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brand },
  secondary: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  off: { opacity: 0.45 },
  primaryText: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: C.ink },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  bigIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  viewfinder: { flex: 1, minHeight: 280, borderRadius: 24, overflow: 'hidden', backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' },
  oval: { width: '62%', aspectRatio: 0.78, borderRadius: 999, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)' },
  pip: { width: 54, height: 70, borderRadius: 12, overflow: 'hidden', backgroundColor: '#0F172A', borderWidth: 2, borderColor: C.card },
  pipOff: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.badSoft },
  recDot: { position: 'absolute', top: 5, right: 5, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  question: { fontSize: 17, lineHeight: 25, fontFamily: Fonts.poppinsSemiBold, color: C.ink },
  spokenTag: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: C.brandSoft, marginBottom: 10 },
  spokenTagText: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.poppinsSemiBold, color: C.brandInk },
  mic: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brand },
  micOn: { backgroundColor: '#EF4444' },
  clipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recDotBig: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },
  clipTime: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: C.ink },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 14, backgroundColor: C.brandSoft },
});
