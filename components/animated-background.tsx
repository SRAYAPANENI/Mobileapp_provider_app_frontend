import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  Bell,
  Briefcase,
  CheckCircle2,
  Clock,
  MapPin,
  Wrench,
  Hammer,
  Truck,
  Paintbrush,
  Zap
} from 'lucide-react-native';
import React, { useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue
} from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const JOB_CARD_COUNT = 4;
const PIN_COUNT = 5;
const NOTIFICATION_COUNT = 3;

export default function AnimatedBackground() {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];

  const globalProgress = useSharedValue(0);

  useEffect(() => {
    globalProgress.value = withRepeat(
      withTiming(1, { duration: 20000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: themeColors.background }]}>
      <View style={[styles.glow, { top: -100, left: -100, backgroundColor: themeColors.brand, opacity: 0.05 }]} />
      <View style={[styles.glow, { bottom: -100, right: -100, backgroundColor: themeColors.brand, opacity: 0.03 }]} />

      <Svg style={StyleSheet.absoluteFill}>
        <ConnectingPaths count={6} progress={globalProgress} color={themeColors.brand} />
      </Svg>

      {Array.from({ length: PIN_COUNT }).map((_, i) => (
        <MovingPin key={`pin-${i}`} index={i} progress={globalProgress} color={themeColors.brand} />
      ))}

      {Array.from({ length: JOB_CARD_COUNT }).map((_, i) => (
        <FloatingJobCard key={`card-${i}`} index={i} progress={globalProgress} />
      ))}

      {Array.from({ length: NOTIFICATION_COUNT }).map((_, i) => (
        <FloatingNotification key={`notif-${i}`} index={i} progress={globalProgress} color={themeColors.brand} />
      ))}

      <WorkerTrail progress={globalProgress} color={themeColors.brand} />
    </View>
  );
}

function FloatingJobCard({ index, progress }: { index: number; progress: SharedValue<number> }) {
  const startX = useMemo(() => Math.random() * (width - 100), []);
  const startY = useMemo(() => Math.random() * (height - 200), []);
  const offset = useMemo(() => Math.random() * 2 * Math.PI, []);

  const animatedStyle = useAnimatedStyle(() => {
    const time = progress.value * 2 * Math.PI + offset;
    const translateX = Math.sin(time * 0.5) * 20;
    const translateY = Math.cos(time * 0.3) * 30;
    const rotate = Math.sin(time * 0.2) * 5;

    return {
      transform: [
        { translateX: startX + translateX },
        { translateY: startY + translateY },
        { rotate: `${rotate}deg` },
      ],
      opacity: interpolate(Math.sin(time), [-1, 1], [0.3, 0.7]),
    };
  });

  const icons = [Wrench, Hammer, Paintbrush, Zap];
  const Icon = icons[index % icons.length];

  return (
    <Animated.View style={[styles.card, animatedStyle, { justifyContent: 'center', alignItems: 'center' }]}>
      <Icon size={24} color="#FFce48" />
    </Animated.View>
  );
}

function MovingPin({ index, progress, color }: { index: number; progress: SharedValue<number>; color: string }) {
  const startX = useMemo(() => Math.random() * width, []);
  const startY = useMemo(() => Math.random() * height, []);
  const offset = useMemo(() => Math.random() * 2 * Math.PI, []);

  const animatedStyle = useAnimatedStyle(() => {
    const time = progress.value * 2 * Math.PI + offset;
    const translateX = Math.cos(time * 0.4) * 40;
    const translateY = Math.sin(time * 0.6) * 40;

    return {
      transform: [
        { translateX: startX + translateX },
        { translateY: startY + translateY },
      ],
      opacity: interpolate(Math.sin(time), [-1, 1], [0.2, 0.5]),
    };
  });

  return (
    <Animated.View style={[styles.pin, animatedStyle]}>
      <MapPin size={20} color={color} fill={color} fillOpacity={0.1} />
    </Animated.View>
  );
}

function FloatingNotification({ index, progress, color }: { index: number; progress: SharedValue<number>; color: string }) {
  const startX = useMemo(() => Math.random() * (width - 50), []);
  const startY = useMemo(() => Math.random() * (height - 50), []);

  const animatedStyle = useAnimatedStyle(() => {
    const p = (progress.value * 10 + index * 3) % 10;
    const opacity = interpolate(p, [0, 1, 8, 10], [0, 1, 1, 0]);
    const translateY = interpolate(p, [0, 10], [0, -60]);

    return {
      transform: [
        { translateX: startX },
        { translateY: startY + translateY },
        { scale: interpolate(p, [0, 1], [0.5, 1], 'clamp') },
      ],
      opacity,
    };
  });

  return (
    <Animated.View style={[styles.notification, { borderColor: color }, animatedStyle]}>
      <Bell size={12} color={color} />
    </Animated.View>
  );
}

function ConnectingPaths({ count, progress, color }: { count: number; progress: SharedValue<number>; color: string }) {
  const paths = useMemo(() => {
    return Array.from({ length: count }).map(() => ({
      x1: Math.random() * width,
      y1: Math.random() * height,
      x2: Math.random() * width,
      y2: Math.random() * height,
      speed: 0.5 + Math.random(),
    }));
  }, []);

  return (
    <>
      {paths.map((p, i) => (
        <PathItem key={`path-${i}`} p={p} progress={progress} color={color} />
      ))}
    </>
  );
}

function PathItem({ p, progress, color }: { p: any; progress: SharedValue<number>; color: string }) {
  const animatedProps = useAnimatedProps(() => {
    const dashOffset = (1 - progress.value) * 1000 * p.speed;
    return {
      strokeDashoffset: dashOffset,
      opacity: 0.1,
    };
  });

  return (
    <AnimatedLine
      x1={p.x1}
      y1={p.y1}
      x2={p.x2}
      y2={p.y2}
      stroke={color}
      strokeWidth="1"
      strokeDasharray="5, 10"
      animatedProps={animatedProps}
    />
  );
}

function WorkerTrail({ progress, color }: { progress: SharedValue<number>; color: string }) {
  const x1 = width * 0.1;
  const y1 = height * 0.2;
  const x2 = width * 0.9;
  const y2 = height * 0.8;

  const animatedStyle = useAnimatedStyle(() => {
    const p = (progress.value * 4) % 1;
    return {
      transform: [
        { translateX: interpolate(p, [0, 1], [x1, x2]) },
        { translateY: interpolate(p, [0, 1], [y1, y2]) },
      ],
      opacity: interpolate(p, [0, 0.1, 0.9, 1], [0, 1, 1, 0]),
    };
  });

  return (
    <Animated.View style={[styles.worker, animatedStyle]}>
      <Truck size={16} color={color} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    filter: 'blur(60px)',
  } as any,
  card: {
    position: 'absolute',
    width: 80,
    height: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 4,
  },
  cardLineShort: { width: 30, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2 },
  cardLineLong: { width: '100%', height: 4, backgroundColor: '#F3F4F6', borderRadius: 2, marginBottom: 4 },
  cardLineMed: { width: '70%', height: 4, backgroundColor: '#F3F4F6', borderRadius: 2 },
  pin: {
    position: 'absolute',
  },
  notification: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  worker: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  }
});
