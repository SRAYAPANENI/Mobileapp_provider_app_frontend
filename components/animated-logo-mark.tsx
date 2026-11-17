import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppConfig } from '@/services/queries/app-config';
import { Image } from 'expo-image';
import { NavigationContext } from '@react-navigation/native';
import React, { type ReactNode, useContext, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeInDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** Whether the screen this sits on is the one shown. Outside any navigator
 * (the app's gates: app lock, maintenance, update required) it always is. */
function useScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => { offFocus(); offBlur(); };
  }, [navigation]);
  return focused;
}

function PingRing({
  size,
  color,
  delay,
  running,
}: {
  size: number;
  color: string;
  delay: number;
  running: boolean;
}) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    if (!running) {
      // Stopped and hidden, not frozen mid-pulse.
      cancelAnimation(scale);
      cancelAnimation(opacity);
      scale.value = 1;
      opacity.value = 0;
      return;
    }
    scale.value = 1;
    opacity.value = 0.5;
    scale.value = withDelay(
      delay,
      withRepeat(withTiming(1.9, { duration: 2200 }), -1, false)
    );
    opacity.value = withDelay(
      delay,
      withRepeat(withTiming(0, { duration: 2200 }), -1, false)
    );
  }, [running]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.ring,
        {
          // No top/left set — this ring is meant to exactly fill its
          // ringWrap parent (same size), and position:'absolute' with no
          // insets defaults to (0,0), which is exactly that.
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
        },
        ringStyle,
      ]}
    />
  );
}

// Mirrors skofy-customer-app/components/animated-logo-mark.tsx.
// The Dodorez mark with brand-coloured rings pulsing out of it — the same
// mark wherever the logo shows (dashboard, login, page headers, support
// chat), so it reads as one living brand rather than a static image in some
// places. `children` replaces the plain mark (e.g. the support chat's round
// avatar badge) and gets the rings around it instead.
//
// The rings run only while they can be seen: not when their screen is behind
// another (a tab left mounted, a screen pushed over it), and not while the
// caller says something covers them (`paused` — Home's Service Room). Each
// ring frame commits the whole view tree on Android (Reanimated 4, new
// architecture), so hidden rings made whatever was on top stutter — the
// Service Room's scrolling stuck.
export default function AnimatedLogoMark({
  size,
  children,
  paused = false,
}: {
  size: number;
  children?: ReactNode;
  paused?: boolean;
}) {
  const running = useScreenFocused() && !paused;
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  // One admin-portal-set logo (app_configs.logo_url) for the whole app —
  // every screen that shows the mark via this component picks it up
  // automatically. Falls back to the bundled asset instantly when unset.
  // useAppConfig() is deduped by TanStack Query, so this costs nothing extra
  // beyond whichever other caller already fetched it.
  const { data: appConfig } = useAppConfig();
  const logoUrl = appConfig?.logo_url;

  const ringSize = size * 1.3;
  const ringOffset = -(ringSize - size) / 2;

  return (
    <View style={[styles.markWrap, { width: size, height: size }]}>
      <View style={[styles.ringWrap, { width: ringSize, height: ringSize, top: ringOffset, left: ringOffset }]} pointerEvents="none">
        <PingRing size={ringSize} color={themeColors.brand} delay={0} running={running} />
        <PingRing size={ringSize} color={themeColors.brand} delay={1100} running={running} />
      </View>
      <Animated.View entering={FadeInDown.duration(600)}>
        {children ?? (
          <Image
            source={logoUrl ? { uri: logoUrl } : require('@/assets/images/logo-mark.png')}
            style={{ width: size, height: size }}
            contentFit="contain"
          />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  markWrap: { alignItems: 'center', justifyContent: 'center' },
  ringWrap: { position: 'absolute' },
  ring: {
    position: 'absolute',
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
});
