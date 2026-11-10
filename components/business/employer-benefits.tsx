import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { BadgeCheck, CalendarClock, ChevronRight, DoorOpen, GraduationCap, Radar, Star, Wrench, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { BounceIn, FadeInDown, FadeOut, FadeOutUp } from 'react-native-reanimated';
import { Button, C, Section, u } from './ui';

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

// Short, complete one-liners for the compact home-screen strip below —
// the full sentences above are for the Business screen's roomier
// explainer. Forcing those into a single clamped line was exactly what
// was cutting them off mid-sentence here; these are written short enough
// to never need truncating, one punchy idea per rotation.
const LINE_HOOKS: { icon: (c: string) => React.ReactNode; text: string }[] = [
  { icon: (c) => <Radar size={18} color={c} />, text: 'Find a business hiring near you' },
  { icon: (c) => <Wrench size={18} color={c} />, text: 'Free tools & gear from day one' },
  { icon: (c) => <CalendarClock size={18} color={c} />, text: 'Steady jobs, in your own hours' },
  { icon: (c) => <GraduationCap size={18} color={c} />, text: 'Learn & earn — fully insured' },
  { icon: (c) => <BadgeCheck size={18} color={c} />, text: 'Keep your own clients outside' },
  { icon: (c) => <Star size={18} color={c} />, text: 'Your rating stays yours, always' },
  { icon: (c) => <DoorOpen size={18} color={c} />, text: "Leave anytime, 7 days' notice" },
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
          An employer can invite you by your phone number — or you can find one yourself. Either way you see the
          hours offered first, and can accept them or suggest your own.
        </ThemedText>
        <ThemedText style={u.muted}>
          Agree your pay and anything they lend you before you join: that’s between you and them, not Dodorez.
        </ThemedText>
        <Button kind="secondary" label="Find businesses near you" onPress={() => router.push('/business-nearby' as any)} />
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
 * alone — cycles through short, complete one-liners (LINE_HOOKS) instead of
 * truncating the full explainer's longer sentences into one clamped line. */
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
      indexRef.current = (indexRef.current + 1) % LINE_HOOKS.length;
      setIndex(indexRef.current);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [shown]);

  if (!shown) return null;
  const dismiss = () => {
    setShown(false);
    SecureStore.setItemAsync(DISMISS_KEY, String(Date.now())).catch(() => {});
  };
  const hook = LINE_HOOKS[index];
  return (
    <TouchableOpacity style={s.line} activeOpacity={0.85} onPress={() => router.push('/business-nearby' as any)}>
      <Animated.View key={index} entering={BounceIn.duration(450)} exiting={FadeOut.duration(150)} style={s.lineIcon}>
        {hook.icon(C.brandInk)}
      </Animated.View>
      <Animated.View
        key={`text-${index}`}
        entering={FadeInDown.duration(280)}
        exiting={FadeOutUp.duration(200)}
        style={{ flex: 1 }}
      >
        {/* Wraps rather than clips — on a narrow phone, with the dots and
            the Join pill both also competing for this row's width, even
            these short lines can run past one line's worth of space.
            Wrapping is what actually guarantees nothing gets cut off,
            regardless of screen width or the reader's font-size setting;
            picking a tighter character budget can't guarantee that. */}
        <ThemedText style={s.lineText} numberOfLines={2}>{hook.text}</ThemedText>
      </Animated.View>
      <View style={s.dots}>
        {LINE_HOOKS.map((_, i) => (
          <View key={i} style={[s.dot, i === index && s.dotActive]} />
        ))}
      </View>
      <View style={s.cta}>
        <ThemedText style={s.ctaText}>Join</ThemedText>
        <ChevronRight size={13} color={C.brandInk} />
      </View>
      <TouchableOpacity onPress={dismiss} hitSlop={10} accessibilityLabel="Hide">
        <X size={16} color={C.brandInk} style={{ opacity: 0.5 }} />
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
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, paddingVertical: 11, paddingHorizontal: 12,
    borderRadius: 18, backgroundColor: C.brandSoft, borderWidth: 1.5, borderColor: '#FFE08A',
  },
  lineIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brand },
  lineText: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppinsBold, color: C.ink },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#EBD28A' },
  dotActive: { backgroundColor: C.brandInk, width: 10 },
  cta: {
    flexDirection: 'row', alignItems: 'center', gap: 1, backgroundColor: C.brand,
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4,
  },
  ctaText: { fontSize: 11.5, lineHeight: 14, fontFamily: Fonts.poppinsBold, color: C.brandInk },
});
