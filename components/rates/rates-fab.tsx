import { needsPrice } from '@/components/rates/shared';
import { Fonts } from '@/constants/theme';
import { liftBottom, useBottomInset } from '@/hooks/use-bottom-inset';
import { useHosting, useMySkills, useProviderProfile } from '@/services/queries/provider';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Tag } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/** Room the tabs' lists leave under their last item so it can scroll clear
 * of the button (it sits over every main tab). */
export const FAB_CLEARANCE = 84;

// Once per app session each: the button opens to say what it is, and to say
// a price is missing. Module-level, so switching tabs doesn't replay them.
let introPlayed = false;
let missingPlayed = false;

const LABEL_WIDTH = 160;
const OPEN = { duration: 360, easing: Easing.out(Easing.cubic) };
const CLOSE = { duration: 300, easing: Easing.in(Easing.cubic) };

// Rates & hosting is what a provider earns by, so it's one tap away from
// every main tab: a white button at the bottom right, a price tag in the
// brand's yellow. It explains itself — on the first dashboard of a session it
// opens into "My rates" for a moment, then folds back to its tag — and when a
// skill they're verified in can't be booked for want of a price, it opens as
// "Set your prices" and its red dot pulses. Short, and then still: nothing
// here loops, since an endless animation redraws whatever sits over it (the
// Service Room). Out of the way while the keyboard is up.
export function RatesFab() {
  const bottomInset = useBottomInset();
  const skills = useMySkills();
  const hosting = useHosting();
  const profile = useProviderProfile();
  const [keyboardUp, setKeyboardUp] = useState(false);
  const [label, setLabel] = useState('My rates');
  const open = useSharedValue(0);      // 0: the round tag, 1: open with its label
  const pulse = useSharedValue(1);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardUp(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const missing = useMemo(() => {
    if (!skills.data || !hosting.data) return false;
    const usualHourly = profile.data?.hourly_rate != null;
    return skills.data.some((sk) => needsPrice(sk, hosting.data!.rates.filter((r) => r.skill_id === sk.skill_id), usualHourly));
  }, [skills.data, hosting.data, profile.data?.hourly_rate]);

  // Open, hold, fold back — after a beat, so the screen has settled first.
  const say = (text: string, hold: number) => {
    setLabel(text);
    open.value = withSequence(withDelay(700, withTiming(1, OPEN)), withDelay(hold, withTiming(0, CLOSE)));
  };

  useEffect(() => {
    if (introPlayed) return;
    introPlayed = true;
    say('My rates', 2600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!missing || missingPlayed) return;
    missingPlayed = true;
    say('Set your prices', 3200);
    // Three pulses of the dot, then it rests.
    pulse.value = withDelay(700, withRepeat(withSequence(withTiming(1.45, { duration: 260 }), withTiming(1, { duration: 260 })), 3, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing]);

  const labelStyle = useAnimatedStyle(() => ({
    maxWidth: open.value * LABEL_WIDTH,
    marginLeft: open.value * 8,
    opacity: open.value,
  }));
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  if (keyboardUp) return null;
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          router.push('/rates-and-hosting' as any);
        }}
        style={({ pressed }) => [liftBottom(s.fab, bottomInset), pressed && s.pressed]}
        accessibilityRole="button"
        accessibilityLabel={missing ? 'My rates — a skill needs a price' : 'My rates'}
        hitSlop={6}
      >
        <Tag size={22} color="#111827" fill="#FFCE48" strokeWidth={2.2} />
        <Animated.View style={[s.labelWrap, labelStyle]}>
          <Text style={s.label} numberOfLines={1} allowFontScaling={false}>{label}</Text>
        </Animated.View>
        {missing && <Animated.View style={[s.dot, dotStyle]} />}
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  // Round when folded (56 wide: 17 + the 22 tag + 17), a pill when open —
  // anchored on the right, so it opens leftward over the list.
  fab: {
    position: 'absolute', right: 18, bottom: 22, height: 56, minWidth: 56, borderRadius: 28,
    paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#0F172A', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  pressed: { transform: [{ scale: 0.95 }], backgroundColor: '#F9FAFB' },
  labelWrap: { overflow: 'hidden' },
  label: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppinsBold, color: '#111827' },
  dot: {
    position: 'absolute', top: 2, right: 2, width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#EF4444', borderWidth: 2.5, borderColor: '#FFFFFF',
  },
});
