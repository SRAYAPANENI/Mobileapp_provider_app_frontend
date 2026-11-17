import { needsPrice } from '@/components/rates/shared';
import { liftBottom, useBottomInset } from '@/hooks/use-bottom-inset';
import { useHosting, useMySkills, useProviderProfile } from '@/services/queries/provider';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Tag } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';

/** Room the tabs' lists leave under their last item so it can scroll clear
 * of the button (it sits over every main tab). */
export const FAB_CLEARANCE = 84;

// Rates & hosting is what a provider earns by, so it's one tap away from
// every main tab: a floating button at the bottom right. A red dot when a
// skill they're verified in can't be booked yet for want of a price. Out of
// the way while the keyboard is up.
export function RatesFab() {
  const bottomInset = useBottomInset();
  const skills = useMySkills();
  const hosting = useHosting();
  const profile = useProviderProfile();
  const [keyboardUp, setKeyboardUp] = useState(false);

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
        accessibilityLabel={missing ? 'Rates & hosting — a skill needs a price' : 'Rates & hosting'}
        hitSlop={6}
      >
        <Tag size={24} color="#FFCE48" strokeWidth={2.4} />
        {missing && <View style={s.dot} />}
      </Pressable>
    </View>
  );
}

// Dark, with the brand's yellow in the icon: it stands out on screens full of
// yellow (job cards, chips, Apply) without competing with their main button —
// the same pairing as the Chat button. A price tag: "your prices", at a glance.
const s = StyleSheet.create({
  fab: {
    position: 'absolute', right: 18, bottom: 22, width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827',
    shadowColor: '#0F172A', shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  pressed: { transform: [{ scale: 0.94 }], opacity: 0.92 },
  dot: {
    position: 'absolute', top: 4, right: 4, width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#EF4444', borderWidth: 2.5, borderColor: '#111827',
  },
});
