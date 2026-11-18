import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { useProviderProfile } from '@/services/queries/provider';
import { router } from 'expo-router';
import { ChevronDown, ChevronUp, PauseCircle } from 'lucide-react-native';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';

/** As the server sends it (ProviderProfileResponse.pause_lapses). */
interface PauseLapse { kind: string; created_at: string; job_title?: string | null }

const LAPSE_WORDS: Record<string, string> = {
  NO_SHOW: 'Didn’t start the job in time',
  BACKED_OUT: 'Cancelled after being hired',
  LATE: 'Arrived too late',
  DISPUTE_FAULT: 'A dispute was decided against you',
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const dayAndTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Paused from new jobs (docs/MONEY_RULES_DESIGN.md §3): until when, and why.
 * While paused no new job reaches the provider, so without this the job list
 * just looked empty with nothing saying so. Tap to see what led to it.
 * Not dismissable — it lasts exactly as long as the pause.
 */
export default function PausedBanner() {
  const { data: profile } = useProviderProfile();
  const [open, setOpen] = useState(false);
  const until: string | null = profile?.paused_until ?? null;
  if (!until || new Date(until).getTime() <= Date.now()) return null;

  const lapses: PauseLapse[] = Array.isArray(profile?.pause_lapses) ? profile.pause_lapses : [];
  const forLapses = profile?.pause_reason === 'LAPSES';
  const why = forLapses
    ? `${lapses.length} missed or cancelled jobs within 30 days.`
    : 'You were found asking a customer to pay outside the app.';

  return (
    <Animated.View entering={FadeInDown} exiting={FadeOutUp} style={styles.wrap}>
      <TouchableOpacity
        style={styles.head}
        activeOpacity={0.85}
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Paused from new jobs until ${dayAndTime(until)}. ${why}`}
      >
        <PauseCircle size={20} color="#B91C1C" />
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.title}>Paused from new jobs until {dayAndTime(until)}</ThemedText>
          <ThemedText style={styles.why}>{why} Jobs you already have carry on as usual.</ThemedText>
        </View>
        {open ? <ChevronUp size={18} color="#B91C1C" /> : <ChevronDown size={18} color="#B91C1C" />}
      </TouchableOpacity>

      {open && (
        <View style={styles.details}>
          {forLapses && lapses.map((l, i) => (
            <View key={`${l.created_at}-${i}`} style={styles.lapseRow}>
              <View style={styles.dot} />
              <ThemedText style={styles.lapseText}>
                <ThemedText style={styles.lapseDate}>{day(l.created_at)} · </ThemedText>
                {LAPSE_WORDS[l.kind] ?? 'A missed job'}{l.job_title ? ` — ${l.job_title}` : ''}
              </ThemedText>
            </View>
          ))}
          <ThemedText style={styles.note}>
            {forLapses
              ? 'New jobs reach you again once the pause ends. Starting on time and only applying for jobs you can do keeps it from happening again.'
              : 'New jobs reach you again once the pause ends. You were sent the strike and how to appeal it.'}
          </ThemedText>
          <TouchableOpacity onPress={() => router.push('/help-support' as any)} hitSlop={8}>
            <ThemedText style={styles.link}>Think this is wrong? Contact support</ThemedText>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#FEF2F2', borderRadius: 14, borderWidth: 1, borderColor: '#FECACA',
    paddingVertical: 12, paddingHorizontal: 14, marginHorizontal: 16, marginBottom: 12,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontFamily: Fonts.poppinsBold, fontSize: 13.5, lineHeight: 19, color: '#7F1D1D' },
  why: { fontFamily: Fonts.poppins, fontSize: 12.5, lineHeight: 18, color: '#991B1B', marginTop: 2 },
  details: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#FECACA', gap: 6 },
  lapseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#DC2626', marginTop: 7 },
  lapseText: { flex: 1, fontFamily: Fonts.poppins, fontSize: 12.5, lineHeight: 18, color: '#7F1D1D' },
  lapseDate: { fontFamily: Fonts.poppinsSemiBold, fontSize: 12.5, lineHeight: 18, color: '#7F1D1D' },
  note: { fontFamily: Fonts.poppins, fontSize: 12, lineHeight: 17, color: '#991B1B', marginTop: 4 },
  link: { fontFamily: Fonts.poppinsBold, fontSize: 12.5, lineHeight: 18, color: '#B91C1C', marginTop: 2 },
});
