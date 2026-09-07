import AnimatedBrandMark from '@/components/animated-brand-mark';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { router } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { TokenStore } from '@/services/api';
import { handleInitialCallAction, handleInitialNotification } from '@/services/callManager';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';

const { width, height } = Dimensions.get('window');
const CENTER_X = width / 2;
const CENTER_Y = height / 2;

const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const NODE_COUNT = 16;
const RADIUS = width * 0.4; // Initial spread radius

export default function SplashScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const styles = React.useMemo(() => makeStyles(themeColors), [colorScheme]);
  const masterProgress = useSharedValue(0);
  const handledRef = React.useRef(false);

  useEffect(() => {
    // The app was cold-started by tapping the incoming-call notification, not
    // just reopened normally — that navigation already happened, so the splash's
    // own redirect below must not run too, or it'll stomp the call screen a few
    // seconds later with whatever it decides (login or home). Two separate
    // bridges to check: Notifee's own (iOS fallback path) and the native
    // CallStyle one (Android's real colored-button notification).
    Promise.all([handleInitialNotification(), handleInitialCallAction()]).then(([a, b]) => {
      handledRef.current = a || b;
    });

    // Total sequence in 3.5 seconds
    masterProgress.value = withTiming(1, {
      duration: 3500,
      easing: Easing.bezier(0.4, 0, 0.2, 1)
    }, (finished) => {
      if (finished) {
        runOnJS(navigateAfterSplash)();
      }
    });
  }, []);

  const navigateAfterSplash = () => {
    if (handledRef.current) return;
    // A previous bug here always sent the user to /login on every cold start,
    // even with a perfectly valid stored session — meaning killing the app and
    // reopening it (or tapping a notification, before the fix above) always
    // demanded a fresh login. Now it actually checks for one first.
    TokenStore.getAccessToken().then(token => {
      router.replace((token ? '/(tabs)' : '/login') as any);
    });
  };

  const logoStyle = useAnimatedStyle(() => {
    // Logo reveal starts at 60% of the progress
    const opacity = interpolate(masterProgress.value, [0.6, 0.85], [0, 1], 'clamp');
    const scale = interpolate(masterProgress.value, [0.6, 0.85], [0.95, 1], 'clamp');
    const translateY = interpolate(masterProgress.value, [0.6, 0.85], [10, 0], 'clamp');

    return {
      opacity,
      transform: [{ scale }, { translateY }],
    };
  });

  const taglineStyle = useAnimatedStyle(() => {
    // Tagline appears at the very end
    const opacity = interpolate(masterProgress.value, [0.8, 1], [0, 1], 'clamp');
    const translateY = interpolate(masterProgress.value, [0.8, 1], [5, 0], 'clamp');

    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  return (
    <ThemedView style={styles.container}>
      {/* Background Layer: Structural/Technical Mesh Animation */}
      <View style={StyleSheet.absoluteFill}>
        <StructureAnimation progress={masterProgress} />
      </View>

      {/* Content Layer: Logo and Tagline */}
      <View style={styles.content}>
        <Animated.View style={logoStyle}>
          <AnimatedBrandMark size={48} nameSize={30} />
        </Animated.View>
        <Animated.View style={[styles.taglineContainer, taglineStyle]}>
          <Text style={styles.tagline}>Skill. Service. Success.</Text>
        </Animated.View>
      </View>
    </ThemedView>
  );
}

function StructureAnimation({ progress }: { progress: SharedValue<number> }) {
  // Generate structured nodes in a circular "gear-like" pattern
  const nodes = useMemo(() => {
    return Array.from({ length: NODE_COUNT }).map((_, i) => {
      const angle = (i * 2 * Math.PI) / NODE_COUNT;
      const r = RADIUS + (i % 2 === 0 ? 0 : 40); // Alternate radius for a cog/structure effect
      return {
        x: CENTER_X + r * Math.cos(angle),
        y: CENTER_Y + r * Math.sin(angle),
        radius: 3 + (i % 3 === 0 ? 2 : 0),
      };
    });
  }, []);

  // Structural links forming an interconnected mesh/frame
  const links = useMemo(() => {
    const pairs = [];
    for (let i = 0; i < nodes.length; i++) {
      // Connect to neighbors to form a ring
      const next1 = (i + 1) % nodes.length;
      pairs.push({ from: i, to: next1 });

      // Cross connections for structural integrity (hexagonal/geometric feel)
      if (i % 2 === 0) {
        const across = (i + Math.floor(NODE_COUNT / 2)) % nodes.length;
        pairs.push({ from: i, to: across });
      }
    }
    return pairs;
  }, [nodes]);

  return (
    <Svg width={width} height={height}>
      {links.map((link, i) => (
        <StructureLine
          key={`line-${i}`}
          p1={nodes[link.from]}
          p2={nodes[link.to]}
          progress={progress}
        />
      ))}
      {nodes.map((node, i) => (
        <StructureNode
          key={`node-${i}`}
          node={node}
          progress={progress}
        />
      ))}
    </Svg>
  );
}

function StructureNode({ node, progress }: { node: any; progress: SharedValue<number> }) {
  const animatedProps = useAnimatedProps(() => {
    // 1. Appear
    const appear = interpolate(progress.value, [0, 0.25], [0, 1], 'clamp');
    // 2. Rotate slightly while converging into center
    const convergence = interpolate(progress.value, [0.55, 0.9], [0, 1], 'clamp');

    // Add a slight rotation effect as it converges
    const rotation = interpolate(progress.value, [0.15, 0.9], [0, Math.PI / 4], 'clamp');
    const rDist = Math.sqrt(Math.pow(node.x - CENTER_X, 2) + Math.pow(node.y - CENTER_Y, 2));
    const initTheta = Math.atan2(node.y - CENTER_Y, node.x - CENTER_X);
    const theta = initTheta + rotation;

    // Position with rotation before convergence
    const rotX = CENTER_X + rDist * Math.cos(theta);
    const rotY = CENTER_Y + rDist * Math.sin(theta);

    const curX = interpolate(convergence, [0, 1], [rotX, CENTER_X]);
    const curY = interpolate(convergence, [0, 1], [rotY, CENTER_Y]);

    return {
      cx: curX,
      cy: curY,
      r: node.radius * appear,
      opacity: interpolate(convergence, [0, 0.7], [0.8, 0], 'clamp') * appear,
    };
  });

  // Was Colors.light.brand (pale yellow, #FFCE48) — measured contrast against
  // the white splash background is 1.48:1, functionally invisible (same
  // problem measured earlier for yellow text on white elsewhere in this
  // app). Dark navy matches the wordmark's own "Dod" color and gives a real
  // 17.74:1 contrast, so the animation is actually visible.
  return <AnimatedCircle animatedProps={animatedProps} fill="#111827" />;
}

function StructureLine({ p1, p2, progress }: { p1: any; p2: any; progress: SharedValue<number> }) {
  const animatedProps = useAnimatedProps(() => {
    // 1. Draw connecting lines
    const draw = interpolate(progress.value, [0.15, 0.45], [0, 1], 'clamp');
    // 2. Converge
    const convergence = interpolate(progress.value, [0.55, 0.9], [0, 1], 'clamp');

    // Add same rotation logic
    const rotation = interpolate(progress.value, [0.15, 0.9], [0, Math.PI / 4], 'clamp');

    const rDist1 = Math.sqrt(Math.pow(p1.x - CENTER_X, 2) + Math.pow(p1.y - CENTER_Y, 2));
    const theta1 = Math.atan2(p1.y - CENTER_Y, p1.x - CENTER_X) + rotation;
    const rotX1 = CENTER_X + rDist1 * Math.cos(theta1);
    const rotY1 = CENTER_Y + rDist1 * Math.sin(theta1);

    const rDist2 = Math.sqrt(Math.pow(p2.x - CENTER_X, 2) + Math.pow(p2.y - CENTER_Y, 2));
    const theta2 = Math.atan2(p2.y - CENTER_Y, p2.x - CENTER_X) + rotation;
    const rotX2 = CENTER_X + rDist2 * Math.cos(theta2);
    const rotY2 = CENTER_Y + rDist2 * Math.sin(theta2);

    const x1 = interpolate(convergence, [0, 1], [rotX1, CENTER_X]);
    const y1 = interpolate(convergence, [0, 1], [rotY1, CENTER_Y]);
    const x2 = interpolate(convergence, [0, 1], [rotX2, CENTER_X]);
    const y2 = interpolate(convergence, [0, 1], [rotY2, CENTER_Y]);

    return {
      x1,
      y1,
      x2: interpolate(draw, [0, 1], [x1, x2]),
      y2: interpolate(draw, [0, 1], [y1, y2]),
      opacity: interpolate(convergence, [0, 0.5], [0.25, 0], 'clamp') * draw,
    };
  });

  return <AnimatedLine animatedProps={animatedProps} stroke="#111827" strokeWidth="1.5" />;
}

function makeStyles(t: typeof Colors.light) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.card,
      justifyContent: 'center',
      alignItems: 'center',
    },
    content: {
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
    },
    taglineContainer: {
      marginTop: 8,
    },
    tagline: {
      fontSize: 16,
      color: '#8e8e93',
      letterSpacing: 2,
      fontWeight: '500',
      textAlign: 'center',
    },
  });
}
