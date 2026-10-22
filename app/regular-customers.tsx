import { useAppAlert } from '@/components/app-alert';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { padBottom, useBottomInset } from '@/hooks/use-bottom-inset';
import { Series, SkoFyApi } from '@/services/api';
import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft, Repeat } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';

const CADENCE: Record<Series['cadence'], string> = { WEEKLY: 'Every week', BIWEEKLY: 'Every 2 weeks', MONTHLY: 'Every month' };

// Customers who want you back on a schedule (docs/MONEY_RULES_DESIGN.md §13).
// Accept once; each visit then arrives two days ahead as a booking to confirm,
// and its visiting fee is paid from the customer's card when you do.
export default function RegularCustomersScreen() {
  const bottomInset = useBottomInset();
  const appAlert = useAppAlert();
  const [items, setItems] = useState<Series[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => { SkoFyApi.series.mine().then(setItems).catch(() => setItems([])); }, []);
  useFocusEffect(load);

  const act = async (id: string, run: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await run();
      load();
    } catch (err: any) {
      appAlert.show('error', 'Not done', err?.message ?? 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ThemedView style={s.container}>
      <StatusBar barStyle="dark-content" />
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <ChevronLeft size={24} color="#111827" />
        </TouchableOpacity>
        <ThemedText style={s.headerTitle}>Regular customers</ThemedText>
      </View>
      {!items ? <ActivityIndicator style={{ marginTop: 40 }} color="#111827" /> : (
        <ScrollView contentContainerStyle={padBottom([s.body, { paddingBottom: 24 }], bottomInset)}>
          {items.length === 0 && (
            <ThemedText style={s.muted}>No regular customers yet. When a customer books you on a schedule, it shows up here.</ThemedText>
          )}
          {items.map((it) => (
            <View key={it.id} style={s.card}>
              <View style={s.row}>
                <Repeat size={18} color="#111827" />
                <ThemedText style={s.cardTitle}>{it.title}</ThemedText>
              </View>
              <ThemedText style={s.item}>{it.customer_name ?? 'A customer'} · {CADENCE[it.cadence]}</ThemedText>
              <ThemedText style={s.muted}>
                {it.status === 'PROPOSED' ? 'Wants you on a schedule' : it.status === 'PAUSED' ? 'Paused by the customer'
                  : `Next visit ${new Date(it.next_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
              </ThemedText>
              {busy === it.id ? <ActivityIndicator color="#111827" /> : it.status === 'PROPOSED' ? (
                <View style={s.row}>
                  <TouchableOpacity style={s.secondary} onPress={() => act(it.id, () => SkoFyApi.series.respond(it.id, false))}>
                    <ThemedText style={s.secondaryText}>Decline</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.primary} onPress={() => act(it.id, () => SkoFyApi.series.respond(it.id, true))}>
                    <ThemedText style={s.primaryText}>Accept</ThemedText>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => act(it.id, () => SkoFyApi.series.end(it.id))}>
                  <ThemedText style={s.link}>Stop coming regularly</ThemedText>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      )}
      {appAlert.element}
    </ThemedView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  headerTitle: { fontSize: 18, lineHeight: 24, fontFamily: Fonts.poppinsBold, color: '#111827' },
  body: { paddingHorizontal: 16, gap: 12 },
  card: { padding: 16, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: '#111827' },
  item: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.poppins, color: '#111827' },
  muted: { fontSize: 12.5, lineHeight: 18, fontFamily: Fonts.poppins, color: '#6B7280' },
  link: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: '#B91C1C', marginTop: 4 },
  secondary: { flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: 'center', backgroundColor: '#F3F4F6' },
  secondaryText: { fontSize: 13.5, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: '#374151' },
  primary: { flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: 'center', backgroundColor: '#FFCE48' },
  primaryText: { fontSize: 13.5, lineHeight: 19, fontFamily: Fonts.poppinsBold, color: '#111827' },
});
