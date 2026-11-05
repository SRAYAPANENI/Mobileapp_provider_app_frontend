import { useAppAlert } from '@/components/app-alert';
import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { SkoFyApi } from '@/services/api';
import type { MySkill } from '@/services/queries/provider';
import { useIsFocused } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronRight, ClipboardCheck, Clock, ListPlus } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

// Getting a new provider to their first jobs: customers only see providers
// who passed a skill test, so until one has, the dashboard says what's next —
// a card that stays, and the same as a popup once per app launch.
//
// It follows where they are (skofy-backend app/services/skill_test_service.py
// eligibility): no skills yet → add them; skills but no test passed → take
// one, straight into the test; every test on its cooldown after a fail → when
// the next one opens. Gone as soon as any skill is passed.

// Unlocked by identity verification, not a test (setPickupDropoffEnabled):
// it doesn't count as having passed one.
const ID_UNLOCKED = 'Pickup & Delivery Errands';

type Prompt =
  | { kind: 'add'; errandsOnly: boolean; waiting: number }
  | { kind: 'test'; skill: MySkill; others: number; retake: boolean; errandsOnly: boolean; waiting: number }
  | { kind: 'wait'; skill: MySkill; minutes: number; waiting: number };

interface Eligibility { eligible: boolean; reason: string; retry_after_minutes?: number | null }

// Once per app launch, not on every return to the dashboard.
let poppedThisLaunch = false;

function waitText(minutes: number): string {
  if (minutes < 60) return `${Math.max(minutes, 1)} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h >= 24 ? `${Math.ceil(minutes / 1440)} day${minutes > 1440 ? 's' : ''}` : m ? `${h}h ${m}m` : `${h}h`;
}

export function SkillTestPrompt({ skills }: { skills: MySkill[] | undefined }) {
  const focused = useIsFocused();
  const appAlert = useAppAlert();
  const testable = (skills ?? []).filter((s) => s.name !== ID_UNLOCKED);
  const errandsOnly = (skills ?? []).some((s) => s.name === ID_UNLOCKED && s.is_verified);
  const needsTest = !!skills && !testable.some((s) => s.is_verified);

  // Each skill's test status, only while there's a test to take.
  const eligibility = useQuery({
    queryKey: ['provider', 'test-eligibility'],
    queryFn: () => SkoFyApi.skills.getAllTestEligibility() as Promise<Record<string, Eligibility>>,
    enabled: needsTest && testable.length > 0,
    staleTime: 60_000,
  });

  // Open jobs near them needing each untested skill — from the server, since
  // jobs only reach verified skills: a new provider's own feed is empty, so
  // it can't be counted there. A real count, never made up.
  const waitingQuery = useQuery({
    queryKey: ['provider', 'skill-tests-waiting'],
    queryFn: () => SkoFyApi.skills.waitingJobs(),
    enabled: needsTest && testable.length > 0,
    staleTime: 60_000,
  });
  const waitingFor = (skillId: string) => waitingQuery.data?.skills.find((w) => w.skill_id === skillId)?.waiting ?? 0;

  let prompt: Prompt | null = null;
  if (needsTest) {
    if (testable.length === 0) {
      prompt = { kind: 'add', errandsOnly, waiting: 0 };
    } else if ((eligibility.data || eligibility.isError) && !waitingQuery.isLoading) {
      const of = (s: MySkill) => eligibility.data?.[s.skill_id];
      // Unknown status (the call failed): offer the test; the test screen checks.
      const ready = testable.filter((s) => of(s)?.eligible !== false);
      // The one with the most jobs waiting first; a first test before a retake.
      const first = [...ready].sort((a, b) => waitingFor(b.skill_id) - waitingFor(a.skill_id)
        || Number(of(b)?.reason === 'first_test') - Number(of(a)?.reason === 'first_test'))[0];
      if (first) {
        prompt = { kind: 'test', skill: first, others: ready.length - 1, retake: of(first)?.reason === 'retry_after_cooldown',
          errandsOnly, waiting: waitingFor(first.skill_id) };
      } else {
        const soonest = [...testable].sort((a, b) =>
          (of(a)?.retry_after_minutes ?? Infinity) - (of(b)?.retry_after_minutes ?? Infinity))[0];
        prompt = { kind: 'wait', skill: soonest, minutes: of(soonest)?.retry_after_minutes ?? 60, waiting: waitingFor(soonest.skill_id) };
      }
    }
  }

  const act = () => {
    if (prompt?.kind === 'add') {
      // Skills are added under Verification, next to their tests.
      router.push({ pathname: '/(tabs)/profile', params: { section: 'verification' } } as any);
    } else if (prompt?.kind === 'test') {
      router.push({ pathname: '/(tabs)/profile', params: { testSkillId: prompt.skill.skill_id, testSkillName: prompt.skill.name } } as any);
    }
  };

  const jobsWord = (n: number) => `${n} job${n === 1 ? '' : 's'}`;
  // Leads with the jobs waiting when there are some — a real count from
  // their feed; without any, what's to gain, never a promise.
  const title = !prompt ? ''
    : prompt.kind === 'add'
      ? prompt.waiting > 0 ? `🔥 ${jobsWord(prompt.waiting)} near you right now` : 'Add your skills to start getting jobs'
    : prompt.kind === 'test'
      ? prompt.waiting > 0 ? `🔥 ${prompt.waiting} ${prompt.skill.name} ${prompt.waiting === 1 ? 'job' : 'jobs'} waiting for you`
        : `Unlock ${prompt.skill.name} jobs`
    : `Your next test opens in ${waitText(prompt.minutes)}`;
  const detail = !prompt ? ''
    : prompt.kind === 'add'
      ? `Add what you do and pass a quick test for each — that's all it takes to start applying${prompt.errandsOnly ? ' for jobs in your trade' : ''}.`
    : prompt.kind === 'test'
      ? `${prompt.retake ? 'Retake' : 'Pass'} the 5-minute ${prompt.skill.name} test and ${prompt.waiting > 0 ? (prompt.waiting === 1 ? 'it’s yours to apply for' : 'they’re yours to apply for') : 'you’re ready for the next one that comes in'} — customers only see providers who passed.${prompt.others > 0 ? ` ${prompt.others} more skill${prompt.others > 1 ? 's' : ''} to unlock after.` : ''}`
    : `Then retake ${prompt.skill.name}${prompt.waiting > 0 ? ` — ${jobsWord(prompt.waiting)} near you need it` : ''}. Jobs start coming once you pass.`;
  const actionLabel = prompt?.kind === 'add' ? 'Add my skills' : prompt?.kind === 'test' ? (prompt.retake ? 'Retake the test' : 'Start the test') : null;

  // The popup: once per launch, while the dashboard is on screen, and only
  // when there's something to do now.
  useEffect(() => {
    if (!focused || !prompt || prompt.kind === 'wait' || poppedThisLaunch) return;
    poppedThisLaunch = true;
    const exciting = prompt.kind === 'test' && prompt.waiting > 0;
    appAlert.show('info', exciting ? 'Jobs are waiting for you! 🎉' : title,
      exciting ? `${title.replace('🔥 ', '')}. ${detail}` : detail, [
      { text: 'Later', variant: 'secondary' },
      { text: actionLabel!, onPress: act },
    ]);
    // Shown once; a change in what's next updates the card, not another popup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, prompt?.kind]);

  if (!prompt) return appAlert.element;
  const Icon = prompt.kind === 'add' ? ListPlus : prompt.kind === 'test' ? ClipboardCheck : Clock;
  return (
    <>
      <TouchableOpacity style={s.card} activeOpacity={actionLabel ? 0.85 : 1} disabled={!actionLabel} onPress={act}
        accessibilityRole={actionLabel ? 'button' : undefined}>
        <View style={[s.icon, prompt.kind === 'wait' && s.iconWait]}>
          <Icon size={20} color={prompt.kind === 'wait' ? '#B45309' : '#7A5600'} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText style={s.title}>{title}</ThemedText>
          <ThemedText style={s.detail}>{detail}</ThemedText>
          {actionLabel && <ThemedText style={s.action}>{actionLabel}</ThemedText>}
        </View>
        {actionLabel && <ChevronRight size={18} color="#94A3B8" />}
      </TouchableOpacity>
      {appAlert.element}
    </>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, padding: 14,
    borderRadius: 16, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
  },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFCE48' },
  iconWait: { backgroundColor: '#FEF3C7' },
  title: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: '#0F172A' },
  detail: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppins, color: '#475569' },
  action: { marginTop: 4, fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: '#7A5600' },
});
