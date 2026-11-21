import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { router } from 'expo-router';
import { Map as MapIcon, Settings2, Users } from 'lucide-react-native';
import React from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { C } from './ui';

export type BusinessTab = 'jobs' | 'map' | 'business';

const TABS: { key: BusinessTab; label: string; path: string; Icon: typeof Users }[] = [
  { key: 'jobs', label: 'Team jobs', path: '/business-jobs', Icon: Users },
  { key: 'map', label: 'Map', path: '/business-map', Icon: MapIcon },
  { key: 'business', label: 'Business', path: '/business', Icon: Settings2 },
];

interface Props {
  /** The page this strip is on — highlighted. None: the home screen, where
   * the three are plain buttons into them. */
  current?: BusinessTab;
  /** Something waiting on a page, e.g. requests to join on Business. */
  badges?: Partial<Record<BusinessTab, number>>;
  /** Floating over a map: on a card of its own. */
  floating?: boolean;
  style?: StyleProp<ViewStyle>;
}

// Team jobs · Map · Business — the three business pages, one strip across
// them all, so the page you're on is always marked. Moving between them
// swaps the page instead of stacking another, so Back still goes to where
// the owner came from (the home screen).
export function BusinessTabs({ current, badges, floating, style }: Props) {
  const open = (tab: (typeof TABS)[number]) => {
    if (tab.key === current) return;
    if (current) router.replace(tab.path as any);
    else router.push(tab.path as any);
  };

  return (
    <View style={[current ? s.track : s.buttons, floating && s.floating, style]} accessibilityRole="tablist">
      {TABS.map((tab) => {
        const on = tab.key === current;
        const count = badges?.[tab.key] ?? 0;
        return (
          <TouchableOpacity key={tab.key} activeOpacity={0.8} onPress={() => open(tab)}
            style={[current ? s.tab : s.button, on && s.tabOn]}
            accessibilityRole="tab" accessibilityState={{ selected: on }}
            accessibilityLabel={count > 0 ? `${tab.label}, ${count} waiting` : tab.label}>
            <tab.Icon size={15} color={on || !current ? C.ink : C.muted} />
            <ThemedText style={[s.text, on && s.textOn, !current && s.textButton]} numberOfLines={1}>{tab.label}</ThemedText>
            {count > 0 && (
              <View style={s.badge}>
                <ThemedText style={s.badgeText}>{count > 9 ? '9+' : count}</ThemedText>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const shadow = { shadowColor: '#0F172A', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 };
const s = StyleSheet.create({
  // On a business page: a segmented strip, the page you're on raised white
  // (the same look as Myself | Business on the home screen).
  track: { flexDirection: 'row', height: 44, padding: 4, gap: 4, borderRadius: 14, backgroundColor: '#EEF0F3' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 6 },
  tabOn: { backgroundColor: C.card, ...shadow },
  // On the home screen: three buttons, nothing marked — you're on none of them.
  buttons: { flexDirection: 'row', gap: 8 },
  button: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, paddingHorizontal: 6,
    borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
  },
  // Over a map: the strip keeps its grey (the page you're on stays white
  // against it), lifted with a shadow so it reads over the streets.
  floating: { ...shadow, shadowOpacity: 0.14, shadowRadius: 10, elevation: 4 },
  text: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: C.muted },
  textOn: { fontFamily: Fonts.poppinsBold, color: C.ink },
  textButton: { color: C.ink },
  badge: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brand },
  badgeText: { fontSize: 10.5, lineHeight: 13, fontFamily: Fonts.poppinsBold, color: C.ink },
});
