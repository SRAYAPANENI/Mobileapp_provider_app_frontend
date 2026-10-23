import { C, Monogram, u } from '@/components/business/ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { SkoFyApi, TeamPosition } from '@/services/api';
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, Home, Navigation, Users } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

const POLL_MS = 10000;
const CARD_W = 248;

// Where the team is on the business's jobs (docs/BUSINESS_PROVIDERS_DESIGN.md
// §5): only members from setting off until their job is done — the server
// leaves out everyone else. Tap a member to find them; tap again for their job.
export default function BusinessMapScreen() {
  const bottomInset = useBottomInset();
  const [positions, setPositions] = useState<TeamPosition[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const map = useRef<MapView>(null);
  const fitted = useRef(false);
  const ready = useRef(false);
  const latest = useRef<TeamPosition[]>([]);

  const fitAll = (list: TeamPosition[]) => {
    const points = list.flatMap((p) => [
      { latitude: p.lat, longitude: p.lng },
      ...(p.job_lat != null && p.job_lng != null ? [{ latitude: p.job_lat, longitude: p.job_lng }] : []),
    ]);
    if (points.length) map.current?.fitToCoordinates(points, { edgePadding: { top: 140, right: 60, bottom: 260, left: 60 }, animated: true });
  };

  // Once, when both the map and the first positions are in.
  const fitOnce = () => {
    if (fitted.current || !ready.current || latest.current.length === 0) return;
    fitted.current = true;
    fitAll(latest.current);
  };

  const load = useCallback(async () => {
    const next = await SkoFyApi.business.positions().catch(() => null);
    setLoaded(true);
    if (!next) return;
    setPositions(next);
    latest.current = next;
    fitOnce();
    // fitOnce reads only refs, so this never goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const openJob = (p: TeamPosition) => router.push({ pathname: '/business-job', params: { jobId: p.job_id } } as any);
  const focus = (p: TeamPosition) => {
    if (focused === p.job_id) return openJob(p);
    setFocused(p.job_id);
    map.current?.animateToRegion({ latitude: p.lat, longitude: p.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 400);
  };

  return (
    <ThemedView style={s.container}>
      <StatusBar barStyle="dark-content" />
      <MapView ref={map} style={StyleSheet.absoluteFill} provider={PROVIDER_GOOGLE} showsCompass={false} toolbarEnabled={false}
        onMapReady={() => { ready.current = true; fitOnce(); }}
        initialRegion={{ latitude: 39.5, longitude: -98.35, latitudeDelta: 30, longitudeDelta: 30 }}>
        {positions.filter((p) => p.job_lat != null && p.job_lng != null).map((p) => (
          <Marker key={`${p.job_id}-site`} coordinate={{ latitude: p.job_lat!, longitude: p.job_lng! }} anchor={{ x: 0.5, y: 0.5 }}
            title={p.title} description="The job">
            <View style={s.site}><Home size={14} color="#FFFFFF" /></View>
          </Marker>
        ))}
        {positions.map((p) => (
          <Marker key={p.job_id} coordinate={{ latitude: p.lat, longitude: p.lng }} anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => focus(p)} zIndex={focused === p.job_id ? 2 : 1}>
            <View style={[s.pin, focused === p.job_id && s.pinOn]}>
              <Monogram name={p.worker_name ?? '?'} size={34} />
            </View>
          </Marker>
        ))}
      </MapView>

      <View style={s.header}>
        <TouchableOpacity style={s.round} onPress={() => router.back()}>
          <ChevronLeft size={22} color={C.ink} />
        </TouchableOpacity>
        <View style={s.titlePill}>
          <Users size={15} color={C.ink} />
          <ThemedText style={s.title}>Team map</ThemedText>
          <View style={s.count}><ThemedText style={s.countText}>{positions.length}</ThemedText></View>
        </View>
        {positions.length > 1 && (
          <TouchableOpacity style={s.round} onPress={() => { setFocused(null); fitAll(positions); }}>
            <Navigation size={18} color={C.ink} />
          </TouchableOpacity>
        )}
      </View>

      <View style={[s.bottom, { paddingBottom: Math.max(bottomInset, 16) }]}>
        {loaded && positions.length === 0 ? (
          <View style={[u.card, s.empty]}>
            <ThemedText style={s.emptyTitle}>Nobody is on a job right now</ThemedText>
            <ThemedText style={[u.muted, { textAlign: 'center' }]}>
              Members show here only while they’re on a job — from setting off until it’s done.
            </ThemedText>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
            snapToInterval={CARD_W + 10} decelerationRate="fast">
            {positions.map((p) => (
              <TouchableOpacity key={p.job_id} activeOpacity={0.85} onPress={() => focus(p)}
                style={[u.card, s.card, focused === p.job_id && s.cardOn]}>
                <Monogram name={p.worker_name ?? '?'} size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <ThemedText style={u.label} numberOfLines={1}>{p.worker_name ?? 'Team member'}</ThemedText>
                  <ThemedText style={u.muted} numberOfLines={1}>{p.title}</ThemedText>
                  <ThemedText style={[u.muted, { color: focused === p.job_id ? C.info : C.faint }]}>
                    {focused === p.job_id ? 'Tap to open the job' : 'Tap to find them'}
                  </ThemedText>
                </View>
                <ChevronRight size={18} color={C.faint} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </ThemedView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { position: 'absolute', top: 56, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  round: {
    width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card,
    shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  titlePill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.card,
    shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  title: { flex: 1, fontSize: 15, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: C.ink },
  count: { minWidth: 26, height: 22, paddingHorizontal: 7, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brand },
  countText: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.poppinsBold, color: C.ink },
  pin: { padding: 3, borderRadius: 14, backgroundColor: C.card, borderWidth: 2, borderColor: C.card },
  pinOn: { borderColor: C.ink },
  site: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.ink, borderWidth: 2, borderColor: '#FFFFFF' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  card: { width: CARD_W, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  cardOn: { borderColor: C.ink, borderWidth: 1.5 },
  empty: { marginHorizontal: 16, alignItems: 'center', gap: 4 },
  emptyTitle: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: C.ink },
});
