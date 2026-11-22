import { STRINGS, TestLanguage } from '@/components/skill-test/strings';
import { inSystemPrompt } from '@/components/skill-test/system-prompt';
import { SkillTestAnswer, SkillTestQuestion, SkoFyApi } from '@/services/api';
import * as ScreenCapture from 'expo-screen-capture';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

// A skill test, as the phone takes it (docs/SKILL_VERIFICATION_DESIGN.md).
// The server keeps every rule — each question's clock, what an answer
// counts as, whether a pass is held for review; this shows its clock, says
// what the phone saw (the app left mid-question, a screenshot), and never
// learns which answers were right until the score at the end.

export type SkillTestPhase =
  | { kind: 'intro' }
  // Camera tests (§3): agreeing to the recording, then a photo of their face.
  | { kind: 'consent' }
  | { kind: 'face' }
  | { kind: 'starting' }
  // Its questions are being written for the first time: checked every few
  // seconds, then it starts by itself (the face photo kept).
  | { kind: 'preparing' }
  | { kind: 'question'; question: SkillTestQuestion; /** Date.now() at which its time is up */ deadline: number }
  | { kind: 'done'; score: number; passed: boolean; underReview: boolean; message: string }
  | { kind: 'failed'; message: string };

/** Something to tell them about the question just counted. */
export type SkillTestNotice = 'left_app' | 'timed_out' | 'send_failed' | null;

const deadlineFor = (q: SkillTestQuestion) =>
  Date.now() + (q.seconds_left ?? q.seconds_per_question ?? 30) * 1000;

export function useSkillTest({ skillId, resume, camera = false, onEnded }: {
  skillId: string;
  /** A test of theirs is still open for this skill: skip the rules, pick it up. */
  resume: boolean;
  /** Its test is a camera test: consent and a face photo before it starts. */
  camera?: boolean;
  /** The test is over (finished or abandoned): the profile reloads the skill's status. */
  onEnded: () => void;
}) {
  const [phase, setPhase] = useState<SkillTestPhase>(resume ? { kind: 'starting' } : { kind: 'intro' });
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<SkillTestNotice>(null);
  // Known from the profile — or learnt from the server when the profile
  // hadn't loaded yet (opened from a notification).
  const [cameraTest, setCameraTest] = useState(camera);
  // Chosen on the rules screen; a resumed test says which it was in.
  const [language, setLanguage] = useState<TestLanguage>('en');
  const languageRef = useRef(language);
  languageRef.current = language;
  useEffect(() => { if (camera) setCameraTest(true); }, [camera]);

  // Read inside listeners and timers, which outlive any one render.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const submittingRef = useRef(false);
  // The profile hands a new function each render; listeners read the latest.
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const current = (): SkillTestQuestion | null =>
    phaseRef.current.kind === 'question' ? phaseRef.current.question : null;

  const show = useCallback((q: SkillTestQuestion) => {
    if (q.language === 'en' || q.language === 'es') setLanguage(q.language);
    setSelected(null);
    setPhase({ kind: 'question', question: q, deadline: deadlineFor(q) });
  }, []);

  // Its questions written while the rules are read: asked as the screen opens,
  // and again when the language changes. Best effort — Start checks again.
  useEffect(() => {
    if (resume) return;
    SkoFyApi.skills.prepareTest(skillId, language).catch(() => {});
  }, [skillId, language, resume]);

  // Waiting for them: asked every few seconds, then the test starts.
  const waitingStart = useRef<{ consent?: boolean; facePhotoUri?: string } | null>(null);
  const startRef = useRef<(opts?: { consent?: boolean; facePhotoUri?: string }) => Promise<void>>(async () => {});
  useEffect(() => {
    if (phase.kind !== 'preparing') return;
    let stopped = false;
    const id = setInterval(async () => {
      const r = await SkoFyApi.skills.prepareTest(skillId, languageRef.current).catch(() => null);
      if (stopped || !r?.ready || !mounted.current) return;
      stopped = true;
      clearInterval(id);
      void startRef.current(waitingStart.current ?? {});
    }, 4000);
    return () => { stopped = true; clearInterval(id); };
  }, [phase.kind, skillId]);

  /** consent: they agreed to a camera test (never sent without the consent
   * screen). facePhotoUri: their face, sent once the test has opened. */
  const start = useCallback(async (opts: { consent?: boolean; facePhotoUri?: string } = {}) => {
    setPhase({ kind: 'starting' });
    try {
      const q = await SkoFyApi.skills.getTestQuestion(skillId, undefined, !!opts.consent, languageRef.current);
      if (!mounted.current) return;
      show(q);
      if (opts.facePhotoUri && q.proctored) {
        const send = () => SkoFyApi.skills.uploadTestPhoto(skillId, q.session_id, 'FACE_START', opts.facePhotoUri!);
        send().catch(() => send().catch(() => {}));
      }
    } catch (e: any) {
      if (!mounted.current) return;
      // A camera test (not known yet, or resumed after it ended): its consent
      // screen first, never started silently.
      if (e?.error_code === 'TEST_PREPARING') {
        waitingStart.current = opts;
        setPhase({ kind: 'preparing' });
      } else if (e?.error_code === 'CAMERA_CONSENT_REQUIRED' && !opts.consent) {
        // The rules first (a resumed test skipped them), then its consent screen.
        setCameraTest(true);
        setPhase({ kind: 'intro' });
      } else {
        setPhase({ kind: 'failed', message: e?.message || "The test couldn't start. Please try again." });
      }
    }
  }, [skillId, show]);
  startRef.current = start;

  /** From the rules: a camera test goes to its consent screen, any other starts. */
  const proceed = useCallback(() => {
    const now = phaseRef.current.kind;
    if (cameraTest && now === 'intro') setPhase({ kind: 'consent' });
    else if (cameraTest && now === 'consent') setPhase({ kind: 'face' });
    else void start();
  }, [cameraTest, start]);

  // Picked up straight away when resuming.
  useEffect(() => { if (resume) void start(); }, [resume, start]);

  const apply = useCallback((result: SkillTestAnswer) => {
    // About the question just counted only — never carried to the one after.
    setNotice(result.counted === 'TIMED_OUT' ? 'timed_out' : result.counted === 'LEFT_APP' ? 'left_app' : null);
    if (result.session_complete) {
      setPhase({
        kind: 'done', score: result.score ?? 0, passed: !!result.passed, underReview: !!result.under_review,
        message: result.message ?? '',
      });
      onEndedRef.current();
    } else if (result.next_question) {
      show(result.next_question);
    }
  }, [show]);

  /** The server has no open test any more (open too long, or ended elsewhere) — sending again can't help. */
  const ended = (e: any) => e?.error_code === 'NOT_FOUND' || /already ended/i.test(e?.message ?? '');

  /** The answer chosen — or, when its time is up or the app was left, whatever
   * was chosen by then. A spoken question: the recording, or null for none. */
  const submit = useCallback(async (recording?: { uri: string; mimeType: string } | null) => {
    const q = current();
    if (!q || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = q.kind === 'SPOKEN'
        ? await SkoFyApi.skills.submitSpokenAnswer(skillId, q.session_id, q.question_number, recording ?? null)
        : await SkoFyApi.skills.submitTestAnswer(skillId, q.session_id, selectedRef.current ?? '', q.question_number);
      if (!mounted.current) return;
      apply(result);
    } catch (e: any) {
      if (!mounted.current) return;
      if (ended(e)) {
        setNotice(null);
        setPhase({ kind: 'failed', message: STRINGS[languageRef.current].ended });
        onEndedRef.current();
      } else {
        // Its clock keeps running on the server; sending again is safe (the
        // same question is never counted twice).
        setNotice('send_failed');
      }
    } finally {
      submittingRef.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }, [apply, skillId]);

  const choose = useCallback((option: string) => {
    setSelected(option);
    setNotice((n) => (n === 'send_failed' ? n : null));
  }, []);

  /** Closed before the end — it counts as a try. */
  const abandon = useCallback(async () => {
    const q = current();
    if (q) await SkoFyApi.skills.abandonTest(skillId, q.session_id).catch(() => {});
    onEndedRef.current();
  }, [skillId]);

  // Leaving the app mid-question loses it. Said when it goes to the
  // background and again when it comes back (the first may never get out),
  // then the question is sent as it stood — the server counts it lost.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const leftDuring = useRef<number | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const q = current();
      if (!q) return;
      if (state === 'background') {
        // The test's own permission prompt or audio hand-over, not leaving.
        if (inSystemPrompt()) return;
        leftDuring.current = q.question_number;
        SkoFyApi.skills.reportTestEvent(skillId, q.session_id, 'LEFT_APP', q.question_number).catch(() => {});
      } else if (state === 'active' && leftDuring.current === q.question_number) {
        leftDuring.current = null;
        SkoFyApi.skills.reportTestEvent(skillId, q.session_id, 'LEFT_APP', q.question_number)
          .catch(() => {})
          .finally(() => { void submitRef.current(); });
      }
    });
    return () => sub.remove();
  }, [skillId]);

  // No screenshots or screen recording while the test is open (Android
  // blocks them; iOS hides the screen from a recording and tells us of a
  // screenshot, which is said to the server).
  useEffect(() => {
    const key = `skill-test-${skillId}`;
    ScreenCapture.preventScreenCaptureAsync(key).catch(() => {});
    let sub: { remove: () => void } | null = null;
    // iOS only: Android already blocks the screenshot, and detecting one on
    // older Android needs photo-library access the app doesn't ask for.
    if (Platform.OS === 'ios') {
      try {
        sub = ScreenCapture.addScreenshotListener(() => {
          const q = current();
          if (q) SkoFyApi.skills.reportTestEvent(skillId, q.session_id, 'SCREENSHOT', q.question_number).catch(() => {});
        });
      } catch { /* not supported on this device */ }
    }
    return () => {
      sub?.remove();
      ScreenCapture.allowScreenCaptureAsync(key).catch(() => {});
    };
  }, [skillId]);

  /** A photo taken during a camera test — sent quietly; a lost one only counts toward "the camera went quiet". */
  const sendPhoto = useCallback((uri: string) => {
    const q = current();
    if (!q?.proctored) return;
    SkoFyApi.skills.uploadTestPhoto(skillId, q.session_id, 'PHOTO', uri, q.question_number).catch(() => {});
  }, [skillId]);

  return {
    phase, selected, choose, submit, submitting, notice, start, proceed, abandon, sendPhoto, camera: cameraTest,
    language, setLanguage,
  };
}
