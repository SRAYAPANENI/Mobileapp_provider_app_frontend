import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { BadgeCheck, CalendarClock, ChevronRight, DoorOpen, GraduationCap, Star, Wrench, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { C, Section, u } from './ui';

// Why work with an employer (docs/EMPLOYER_PARTNERS_DESIGN.md) — told to
// providers who work alone today. An employer reaches and prepares people
// Dodorez can't: tools, steady jobs, training, cover. Joining keeps what
// matters to the person: their own hours outside the agreed ones, their
// rating, and leaving whenever they want. What they agree with the employer
// (tools, training, pay) is between the two of them, and the copy says so.

export const BENEFITS: { icon: (c: string) => React.ReactNode; title: string; detail: string }[] = [
  { icon: (c) => <Wrench size={18} color={c} />, title: 'Tools and equipment',
    detail: 'Use their tools, van or materials — whatever you agree with them.' },
  { icon: (c) => <CalendarClock size={18} color={c} />, title: 'Steady jobs in your hours',
    detail: 'In the hours you agree, jobs come to you through them. They deal with the customer side.' },
  { icon: (c) => <GraduationCap size={18} color={c} />, title: 'Training and support',
    detail: 'Learn from people who’ve done it for years. Their insurance covers the jobs you do for them.' },
  { icon: (c) => <BadgeCheck size={18} color={c} />, title: 'Your own time stays yours',
    detail: 'Outside those hours, take your own jobs at your own prices. They never see them.' },
  { icon: (c) => <Star size={18} color={c} />, title: 'Your rating goes with you',
    detail: 'Every job builds your own rating, and it stays yours if you leave.' },
  { icon: (c) => <DoorOpen size={18} color={c} />, title: 'Leave whenever you want',
    detail: 'Give 7 days’ notice. Nobody can hold you.' },
];

/** The full explainer, on the Business screen. */
export function EmployerBenefits() {
  return (
    <Section title="Work with an employer">
      <View style={s.hero}>
        <ThemedText style={s.heroTitle}>Grow with an employer — and still work for yourself</ThemedText>
        <ThemedText style={u.body}>
          A local company can bring you tools, steady work and training. You agree the days and hours you work for
          them; the rest of the time is yours.
        </ThemedText>
      </View>
      <View style={{ gap: 12 }}>
        {BENEFITS.map((b) => (
          <View key={b.title} style={s.benefit}>
            <View style={s.icon}>{b.icon(C.brandInk)}</View>
            <View style={{ flex: 1, gap: 2 }}>
              <ThemedText style={s.benefitTitle}>{b.title}</ThemedText>
              <ThemedText style={u.muted}>{b.detail}</ThemedText>
            </View>
          </View>
        ))}
      </View>
      <View style={s.how}>
        <ThemedText style={s.howTitle}>How to join</ThemedText>
        <ThemedText style={u.muted}>
          An employer invites you by your phone number. The invite shows here and on your home screen, with the hours
          they offer — accept them or suggest your own.
        </ThemedText>
        <ThemedText style={u.muted}>
          Agree your pay and anything they lend you before you join: that’s between you and them, not Dodorez.
        </ThemedText>
      </View>
    </Section>
  );
}

// Stores *when* it was dismissed, not just whether — a flat "never again"
// flag meant someone who dismissed this once, before a season where joining
// a team would've genuinely helped them, never saw the pitch again for as
// long as they used the app. A week later it's worth saying again.
const DISMISS_KEY = 'employer_benefits_dismissed_at';
const RESHOW_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ROTATE_MS = 4000;

/** A rotating, dismissible banner on the home screen for someone working
 * alone — cycles through the same benefits as the full explainer above (one
 * list, two presentations) instead of repeating a single fixed line. */
export function EmployerBenefitsLine() {
  const [shown, setShown] = useState(false);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);

  useEffect(() => {
    let live = true;
    SecureStore.getItemAsync(DISMISS_KEY)
      .then((v) => {
        if (!live) return;
        const dismissedAt = v ? Number(v) : 0;
        setShown(!dismissedAt || Date.now() - dismissedAt >= RESHOW_AFTER_MS);
      })
      .catch(() => { if (live) setShown(true); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!shown) return;
    const id = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % BENEFITS.length;
      setIndex(indexRef.current);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [shown]);

  if (!shown) return null;
  const dismiss = () => {
    setShown(false);
    SecureStore.setItemAsync(DISMISS_KEY, String(Date.now())).catch(() => {});
  };
  const b = BENEFITS[index];
  return (
    <TouchableOpacity style={s.line} activeOpacity={0.8} onPress={() => router.push('/business' as any)}>
      <Animated.View key={index} entering={FadeIn.duration(250)} exiting={FadeOut.duration(250)} style={s.icon}>
        {b.icon(C.brandInk)}
      </Animated.View>
      <Animated.View key={`text-${index}`} entering={FadeIn.duration(250)} exiting={FadeOut.duration(250)} style={{ flex: 1, gap: 1 }}>
        <ThemedText style={s.lineTitle} numberOfLines={1}>{b.title}</ThemedText>
        <ThemedText style={u.muted} numberOfLines={1}>{b.detail}</ThemedText>
      </Animated.View>
      <View style={s.dots}>
        {BENEFITS.map((_, i) => (
          <View key={i} style={[s.dot, i === index && s.dotActive]} />
        ))}
      </View>
      <ChevronRight size={18} color={C.faint} />
      <TouchableOpacity onPress={dismiss} hitSlop={10} accessibilityLabel="Hide">
        <X size={16} color={C.faint} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  hero: { gap: 6, padding: 14, borderRadius: 14, backgroundColor: C.brandSoft },
  heroTitle: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.poppinsBold, color: C.ink },
  benefit: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brandSoft },
  benefitTitle: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.poppinsSemiBold, color: C.ink },
  how: { gap: 6, padding: 12, borderRadius: 12, backgroundColor: C.bg },
  howTitle: { fontSize: 13.5, lineHeight: 18, fontFamily: Fonts.poppinsBold, color: C.ink },
  line: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
  },
  lineTitle: { flexShrink: 1, fontSize: 14.5, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: C.ink },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.line },
  dotActive: { backgroundColor: C.brandInk, width: 10 },
});
