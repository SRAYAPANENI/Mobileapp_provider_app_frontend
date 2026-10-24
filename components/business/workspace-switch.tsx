import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { Building2, User } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, TouchableOpacity, View } from 'react-native';
import { C } from './ui';

export type Workspace = 'me' | 'team';

interface Props {
  businessName: string;
  value: Workspace;
  onChange: (next: Workspace) => void;
  /** Open jobs waiting for the team — shown on the Team side. */
  teamCount: number;
  /** The business can't be hired right now. */
  attention?: boolean;
}

// Myself | Team on the home screen (docs/BUSINESS_PROVIDERS_DESIGN.md) — one
// light switch instead of a card: the owner flips between their own jobs and
// the team's, and the rest of the screen follows.
export function WorkspaceSwitch({ businessName, value, onChange, teamCount, attention }: Props) {
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(value === 'team' ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(x, { toValue: value === 'team' ? 1 : 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [value, x]);
  const half = Math.max(0, (width - 8) / 2);

  return (
    <View style={s.track} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Animated.View style={[s.thumb, { width: half, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, half] }) }] }]} />
      )}
      <Segment active={value === 'me'} onPress={() => onChange('me')}
        icon={<User size={16} color={value === 'me' ? C.ink : C.muted} />} label="Myself" />
      <Segment active={value === 'team'} onPress={() => onChange('team')}
        icon={<Building2 size={16} color={value === 'team' ? C.ink : C.muted} />} label={businessName}
        badge={teamCount > 0 ? String(teamCount) : attention ? '!' : undefined} warn={!teamCount && attention} />
    </View>
  );
}

function Segment({ active, onPress, icon, label, badge, warn }: {
  active: boolean; onPress: () => void; icon: React.ReactNode; label: string; badge?: string; warn?: boolean;
}) {
  return (
    <TouchableOpacity style={s.segment} onPress={onPress} activeOpacity={0.8} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      {icon}
      <ThemedText style={[s.label, active && s.labelOn]} numberOfLines={1}>{label}</ThemedText>
      {badge && (
        <View style={[s.badge, warn && s.badgeWarn]}>
          <ThemedText style={[s.badgeText, warn && { color: '#FFFFFF' }]}>{badge}</ThemedText>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  track: { flexDirection: 'row', height: 48, padding: 4, borderRadius: 16, backgroundColor: '#EEF0F3', marginBottom: 12 },
  thumb: {
    position: 'absolute', top: 4, left: 4, bottom: 4, borderRadius: 12, backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10 },
  label: { flexShrink: 1, fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: C.muted },
  labelOn: { fontFamily: Fonts.poppinsBold, color: C.ink },
  badge: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brand },
  badgeWarn: { backgroundColor: C.warn },
  badgeText: { fontSize: 11, lineHeight: 14, fontFamily: Fonts.poppinsBold, color: C.ink },
});
