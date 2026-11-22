import { useAppAlert } from '@/components/app-alert';
import { Popup } from '@/components/popup';
import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { padBottom, useBottomInset } from '@/hooks/use-bottom-inset';
import { SkillTestPhase, useSkillTest } from '@/hooks/use-skill-test';
import { CameraRulesNote, ConsentStep, FaceStep, ProctorCam, SpokenQuestion } from './camera-steps';
import { STRINGS, TestLanguage, TestLanguageContext, useTestStrings } from './strings';
import {
  AlertTriangle, CheckCircle2, Clock, EyeOff, Hourglass, Languages, ListChecks, LogOut, ShieldCheck, Smartphone, Timer, X, XCircle,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const C = {
  bg: '#F8FAFC', card: '#FFFFFF', ink: '#0F172A', body: '#475569', muted: '#94A3B8', line: '#E2E8F0',
  brand: '#FFCE48', brandSoft: '#FFF7DB', brandInk: '#8A6500',
  ok: '#059669', okSoft: '#ECFDF5', bad: '#DC2626', badSoft: '#FEF2F2', warn: '#B45309', warnSoft: '#FFFBEB',
  info: '#1D4ED8', infoSoft: '#EFF6FF',
};
const LETTERS = ['A', 'B', 'C', 'D'];

interface Props {
  skillId: string;
  skillName: string;
  /** A test of theirs is still open: pick it up instead of showing the rules. */
  resume: boolean;
  /** A camera test (docs/SKILL_VERIFICATION_DESIGN.md §3). */
  camera?: boolean;
  /** Gone from the screen. */
  onClose: () => void;
  /** It ended (finished or abandoned) — reload the skill's status. */
  onEnded: () => void;
}

// The skill test, full screen and in one go (docs/SKILL_VERIFICATION_DESIGN.md):
// the rules first, then five questions on the server's clock, then the
// score. It can't be put aside half-way — closing it counts as a try.
export function SkillTestScreen({ skillId, skillName, resume, camera = false, onClose, onEnded }: Props) {
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();
  const alert = useAppAlert();
  const test = useSkillTest({ skillId, resume, camera, onEnded });
  const { phase } = test;
  const t = STRINGS[test.language];

  const askToLeave = () => {
    // Closed while it was starting: it may have opened on the server — the
    // profile reloads, so the skill says "Resume Test" instead of "Take Test".
    if (phase.kind === 'starting' || phase.kind === 'preparing') { onEnded(); onClose(); return; }
    if (phase.kind !== 'question') { onClose(); return; }
    alert.show('warning', t.leaveTitle, t.leaveBody, [
      { text: t.keepGoing, variant: 'secondary', cancel: true },
      { text: t.leave, variant: 'destructive', onPress: () => { void test.abandon().finally(onClose); } },
    ]);
  };

  return (
    <TestLanguageContext.Provider value={test.language}>
    <Popup visible closeOn="back" animationType="slide" onClose={askToLeave} statusBarTranslucent>
      <View style={[s.screen, { paddingTop: insets.top + 8 }]}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <ThemedText style={s.kicker}>{t.kicker}</ThemedText>
            <ThemedText style={s.title} numberOfLines={1}>{skillName}</ThemedText>
          </View>
          {phase.kind === 'question' && phase.question.proctored && <ProctorCam onPhoto={test.sendPhoto} />}
          <TouchableOpacity onPress={askToLeave} style={s.close} accessibilityLabel={t.close} hitSlop={8}>
            <X size={20} color={C.ink} />
          </TouchableOpacity>
        </View>

        {phase.kind === 'intro' ? (
          <Rules onStart={test.proceed} camera={test.camera} language={test.language}
            onLanguage={test.setLanguage} bottomInset={bottomInset} />
        ) : phase.kind === 'consent' ? (
          <ConsentStep onAgree={test.proceed} bottomInset={bottomInset} />
        ) : phase.kind === 'face' ? (
          <FaceStep onReady={(uri) => { void test.start({ consent: true, facePhotoUri: uri }); }} bottomInset={bottomInset} />
        ) : phase.kind === 'starting' ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color={C.brand} />
            <ThemedText style={[s.body, { marginTop: 12 }]}>{t.preparing}</ThemedText>
          </View>
        ) : phase.kind === 'preparing' ? (
          <View style={[s.center, { paddingHorizontal: 32 }]}>
            <ActivityIndicator size="large" color={C.brand} />
            <ThemedText style={[s.lead, { marginTop: 16, textAlign: 'center' }]}>{t.firstTimeTitle}</ThemedText>
            <ThemedText style={[s.body, { marginTop: 8, textAlign: 'center' }]}>{t.firstTimeBody}</ThemedText>
          </View>
        ) : phase.kind === 'failed' ? (
          <View style={s.center}>
            <View style={[s.bigIcon, { backgroundColor: C.badSoft }]}><AlertTriangle size={30} color={C.bad} /></View>
            <ThemedText style={[s.body, { textAlign: 'center', marginVertical: 16 }]}>{phase.message}</ThemedText>
            <TouchableOpacity style={[s.primary, { alignSelf: 'stretch' }]} onPress={onClose}>
              <ThemedText style={s.primaryText}>{t.closeBtn}</ThemedText>
            </TouchableOpacity>
          </View>
        ) : phase.kind === 'question' ? (
          <QuestionView phase={phase} test={test} bottomInset={bottomInset} />
        ) : (
          <Result phase={phase} skillName={skillName} camera={test.camera} onDone={onClose} bottomInset={bottomInset} />
        )}
      </View>
      {alert.element}
    </Popup>
    </TestLanguageContext.Provider>
  );
}

const RULE_ICONS = [ListChecks, Timer, Smartphone, EyeOff, LogOut, ShieldCheck];

function Rules({ onStart, camera, language, onLanguage, bottomInset }: {
  onStart: () => void; camera: boolean; language: TestLanguage; onLanguage: (l: TestLanguage) => void; bottomInset: number;
}) {
  const t = useTestStrings();
  const rules = t.rules.map((text, i) => ({ Icon: RULE_ICONS[i], text }));
  return (
    <>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, gap: 12 }}>
        <View style={s.langRow}>
          <Languages size={15} color={C.body} />
          <ThemedText style={[s.small, { flex: 1, color: C.body }]}>{t.languageLabel}</ThemedText>
          <View style={s.langTrack} accessibilityRole="radiogroup">
            {([['en', 'English'], ['es', 'Español']] as const).map(([code, label]) => (
              <TouchableOpacity key={code} onPress={() => onLanguage(code)} style={[s.langTab, language === code && s.langTabOn]}
                accessibilityRole="radio" accessibilityState={{ selected: language === code }}>
                <ThemedText style={[s.langText, language === code && s.langTextOn]}>{label}</ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <ThemedText style={s.lead}>{t.beforeStart}</ThemedText>
        {camera && <CameraRulesNote />}
        <View style={s.card}>
          {rules.map(({ Icon, text }, i) => (
            <View key={i} style={[s.rule, i < rules.length - 1 && s.ruleLine]}>
              <View style={s.ruleIcon}><Icon size={16} color={C.brandInk} /></View>
              <ThemedText style={[s.body, { flex: 1 }]}>{text}</ThemedText>
            </View>
          ))}
        </View>
        <ThemedText style={s.small}>{t.quietMoment}</ThemedText>
      </ScrollView>
      <View style={padBottom(s.footer, bottomInset)}>
        <TouchableOpacity style={s.primary} onPress={() => onStart()} accessibilityRole="button">
          <ThemedText style={s.primaryText}>{camera ? t.continue : t.startTest}</ThemedText>
        </TouchableOpacity>
      </View>
    </>
  );
}

type Test = ReturnType<typeof useSkillTest>;

function QuestionView({ phase, test, bottomInset }: {
  phase: Extract<SkillTestPhase, { kind: 'question' }>; test: Test; bottomInset: number;
}) {
  const t = useTestStrings();
  const q = phase.question;
  const total = q.total_questions;
  const spoken = q.kind === 'SPOKEN';
  // Lost already (the app was left, then closed): sent as it stands.
  useEffect(() => { if (q.question_lost) void test.submit(null); }, [q.session_id, q.question_number]); // eslint-disable-line react-hooks/exhaustive-deps
  // A spoken question's time running out stops the recording and sends it.
  // Null until the recorder has mounted — a resumed question already out of
  // time fires at once, before that: then it's sent with nothing recorded.
  const spokenTimeUp = useRef<(() => void) | null>(null);
  const lastClip = useRef<{ uri: string; mimeType: string } | null>(null);
  const timeUp = () => {
    if (!spoken) void test.submit();
    else if (spokenTimeUp.current) spokenTimeUp.current();
    else void test.submit(null);
  };

  return (
    <>
      <View style={{ paddingHorizontal: 20, gap: 10 }}>
        <View style={s.progressRow}>
          <ThemedText style={s.step}>{t.questionOf(q.question_number, total)}</ThemedText>
          <Countdown key={`${q.session_id}:${q.question_number}`} deadline={phase.deadline}
            seconds={q.seconds_per_question ?? 30} onTimeUp={timeUp} />
        </View>
        <View style={s.dots}>
          {Array.from({ length: total }, (_, i) => (
            <View key={i} style={[s.dot, i < q.question_number - 1 && s.dotDone, i === q.question_number - 1 && s.dotNow]} />
          ))}
        </View>
        {test.notice && <Notice kind={test.notice} />}
      </View>

      {spoken ? (
        <SpokenQuestion key={`${q.session_id}:${q.question_number}`} question={q} submitting={test.submitting}
          registerTimeUp={(fn) => { spokenTimeUp.current = fn; }}
          onSend={(clip) => { lastClip.current = clip; void test.submit(clip); }} />
      ) : (
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 14 }} keyboardShouldPersistTaps="handled">
        <Animated.View key={q.question_number} entering={FadeInRight.duration(220)} style={s.card}>
          <ThemedText style={s.question}>{q.question}</ThemedText>
          <View style={{ gap: 10, marginTop: 16 }}>
            {q.options.map((opt, i) => {
              const on = test.selected === opt;
              return (
                <TouchableOpacity key={`${i}:${opt}`} onPress={() => test.choose(opt)} activeOpacity={0.8}
                  style={[s.option, on && s.optionOn]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                  <View style={[s.letter, on && s.letterOn]}>
                    <ThemedText style={[s.letterText, on && { color: C.ink }]}>{LETTERS[i]}</ThemedText>
                  </View>
                  <ThemedText style={s.optionText}>{opt}</ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </ScrollView>
      )}

      {spoken ? (test.notice === 'send_failed' && (
        <View style={padBottom(s.footer, bottomInset)}>
          <TouchableOpacity style={s.primary} disabled={test.submitting} onPress={() => { void test.submit(lastClip.current); }}>
            {test.submitting ? <ActivityIndicator color={C.ink} /> : <ThemedText style={s.primaryText}>{t.sendAgain}</ThemedText>}
          </TouchableOpacity>
        </View>
      )) : (
      <View style={padBottom(s.footer, bottomInset)}>
        <TouchableOpacity
          style={[s.primary, (!test.selected || test.submitting) && test.notice !== 'send_failed' && s.primaryOff]}
          disabled={(!test.selected && test.notice !== 'send_failed') || test.submitting}
          onPress={() => { void test.submit(); }}>
          {test.submitting
            ? <ActivityIndicator color={C.ink} />
            : <ThemedText style={s.primaryText}>
                {test.notice === 'send_failed' ? t.sendAgain : q.question_number >= total ? t.finish : t.next}
              </ThemedText>}
        </TouchableOpacity>
      </View>
      )}
    </>
  );
}

/** The question's time, counted down to the server's deadline — it ticks on
 * its own, so the question isn't redrawn every second. */
function Countdown({ deadline, seconds, onTimeUp }: { deadline: number; seconds: number; onTimeUp: () => void }) {
  const leftNow = () => Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  const [left, setLeft] = useState(leftNow);
  const fired = useRef(false);
  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;
  // A steady ticker, independent of redraws. (Re-arming a timeout from each
  // render stalled: four ticks a second mostly set the same whole second,
  // React skipped that render, and with it the next tick — the clock froze
  // until something else, like choosing an answer, redrew the screen.)
  useEffect(() => {
    fired.current = false;
    const tick = () => {
      const now = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(now);
      if (now <= 0 && !fired.current) {
        fired.current = true;
        clearInterval(id);
        onTimeUpRef.current();
      }
    };
    const id = setInterval(tick, 250);
    tick();
    return () => clearInterval(id);
  }, [deadline]);
  const low = left <= 5;
  const t = useTestStrings();
  return (
    <View style={[s.timer, low && s.timerLow]} accessibilityLabel={t.secondsLeft(left)}>
      <Clock size={14} color={low ? C.bad : C.ink} />
      <ThemedText style={[s.timerText, low && { color: C.bad }]}>{left}s</ThemedText>
      <View style={s.timerTrack}>
        <View style={[s.timerFill, { width: `${(left / seconds) * 100}%` }, low && { backgroundColor: C.bad }]} />
      </View>
    </View>
  );
}

function Notice({ kind }: { kind: NonNullable<Test['notice']> }) {
  const t = useTestStrings();
  const text = kind === 'left_app' ? t.leftApp : kind === 'timed_out' ? t.timedOut : t.sendFailed;
  const bad = kind === 'send_failed';
  return (
    <Animated.View entering={FadeIn} style={[s.notice, bad && { backgroundColor: C.badSoft }]}>
      <AlertTriangle size={14} color={bad ? C.bad : C.warn} />
      <ThemedText style={[s.noticeText, bad && { color: C.bad }]}>{text}</ThemedText>
    </Animated.View>
  );
}

function Result({ phase, skillName, camera, onDone, bottomInset }: {
  phase: Extract<SkillTestPhase, { kind: 'done' }>; skillName: string; camera: boolean; onDone: () => void; bottomInset: number;
}) {
  const t = useTestStrings();
  const tone = phase.underReview
    ? { Icon: Hourglass, fg: C.info, bg: C.infoSoft, title: t.reviewing }
    : phase.passed
    ? { Icon: CheckCircle2, fg: C.ok, bg: C.okSoft, title: t.verified(skillName) }
    : { Icon: XCircle, fg: C.bad, bg: C.badSoft, title: t.notThisTime };
  return (
    <>
      <View style={[s.center, { paddingHorizontal: 28 }]}>
        <Animated.View entering={FadeIn.duration(300)} style={{ alignItems: 'center', gap: 12 }}>
          <View style={[s.bigIcon, { backgroundColor: tone.bg }]}><tone.Icon size={34} color={tone.fg} /></View>
          <ThemedText style={s.resultTitle}>{tone.title}</ThemedText>
          <ThemedText style={s.score}>{Math.round(phase.score)}%</ThemedText>
          <ThemedText style={[s.body, { textAlign: 'center' }]}>{t.result(phase.passed, phase.underReview, camera)}</ThemedText>
          {!phase.passed && (
            <ThemedText style={[s.small, { textAlign: 'center' }]}>{t.waitGrows}</ThemedText>
          )}
        </Animated.View>
      </View>
      <View style={padBottom(s.footer, bottomInset)}>
        <TouchableOpacity style={s.primary} onPress={onDone}>
          <ThemedText style={s.primaryText}>{t.done}</ThemedText>
        </TouchableOpacity>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 14 },
  kicker: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.poppinsSemiBold, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontSize: 20, lineHeight: 27, fontFamily: Fonts.poppinsBold, color: C.ink },
  close: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  lead: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.poppinsBold, color: C.ink },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.line },
  rule: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 11 },
  ruleLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  ruleIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brandSoft },
  body: { fontSize: 14, lineHeight: 21, fontFamily: Fonts.poppins, color: C.body },
  small: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppins, color: C.muted },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: C.card },
  primary: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brand },
  primaryOff: { opacity: 0.45 },
  primaryText: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: C.ink },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  step: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: C.body },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { flex: 1, height: 5, borderRadius: 3, backgroundColor: C.line },
  dotDone: { backgroundColor: C.ink },
  dotNow: { backgroundColor: C.brand },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 32, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  timerLow: { borderColor: '#FCA5A5', backgroundColor: C.badSoft },
  timerText: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppinsBold, color: C.ink, minWidth: 28, textAlign: 'right' },
  timerTrack: { width: 44, height: 4, borderRadius: 2, backgroundColor: C.line, overflow: 'hidden' },
  timerFill: { height: 4, borderRadius: 2, backgroundColor: C.ink },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: C.warnSoft },
  noticeText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: C.warn },
  question: { fontSize: 17, lineHeight: 25, fontFamily: Fonts.poppinsSemiBold, color: C.ink },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card },
  optionOn: { borderColor: C.brand, backgroundColor: C.brandSoft },
  letter: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  letterOn: { backgroundColor: C.brand },
  letterText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: C.body },
  optionText: { flex: 1, fontSize: 14.5, lineHeight: 21, fontFamily: Fonts.poppins, color: C.ink },
  bigIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  resultTitle: { fontSize: 20, lineHeight: 27, fontFamily: Fonts.poppinsBold, color: C.ink, textAlign: 'center' },
  score: { fontSize: 34, lineHeight: 42, fontFamily: Fonts.poppinsBold, color: C.ink },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, paddingLeft: 14, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  langTrack: { flexDirection: 'row', padding: 3, gap: 3, borderRadius: 11, backgroundColor: '#EEF0F3' },
  langTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  langTabOn: { backgroundColor: C.card, shadowColor: '#0F172A', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  langText: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.poppinsSemiBold, color: C.muted },
  langTextOn: { color: C.ink, fontFamily: Fonts.poppinsBold },
});
