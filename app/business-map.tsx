import { C, Monogram, u } from '@/components/business/ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { SkoFyApi, TeamPosition } from '@/services/api';
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, Home, Navigation, Users } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, Region } from 'react-native-maps';

const POLL_MS = 10000;
const CARD_W = 248;
const START: Region = { latitude: 39.5, longitude: -98.35, latitudeDelta: 30, longitudeDelta: 30 };

// Pin footprint: the avatar ring with a tail whose tip is the member's spot,
// and a name card to its right. ANCHOR is that tip within the box.
const PIN_W = 150;
const PIN_H = 58;
const ANCHOR = { x: 23, y: 56 };
const SITE = 28;

const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
/** Where a coordinate falls on the map view, in pixels — the map is kept flat (no tilt or turn) so this holds. */
function project(lat: number, lng: number, r: Region, w: number, h: number) {
  const top = merc(r.latitude + r.latitudeDelta / 2);
  const bottom = merc(r.latitude - r.latitudeDelta / 2);
  return {
    x: ((lng - (r.longitude - r.longitudeDelta / 2)) / r.longitudeDelta) * w,
    y: ((top - merc(lat)) / (top - bottom)) * h,
  };
}

// Where the team is on the business's jobs (docs/BUSINESS_PROVIDERS_DESIGN.md
// §5): only members from setting off until their job is done — the server
// leaves out everyone else. Tap a member to find them; tap again for their job.
//
// Pins are plain views laid over the map, not Marker children: on Android
// react-native-maps turns a Marker's children into a bitmap and crops custom
// views unreliably (as on the customer app's provider map). They follow the
// map on every frame of a pan or zoom via onRegionChange.
export default function BusinessMapScreen() {
  const bottomInset = useBottomInset();
  const [positions, setPositions] = useState<TeamPosition[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [region, setRegion] = useState<Region>(START);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const map = useRef<MapView>(null);
  const fitted = useRef(false);
  const ready = useRef(false);
  const latest = useRef<TeamPosition[]>([]);

  const fitAll = (list: TeamPosition[]) => {
    const points = list.flatMap((p) => [
      { latitude: p.lat, longitude: p.lng },
      ...(p.job_lat != null && p.job_lng != null ? [{ latitude: p.job_lat, longitude: p.job_lng }] : []),
    ]);
    if (points.length === 1) {
      map.current?.animateToRegion({ ...points[0], latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400);
    } else if (points.length) {
      map.current?.fitToCoordinates(points, { edgePadding: { top: 160, right: 80, bottom: 260, left: 80 }, animated: true });
    }
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
    map.current?.animateToRegion({ latitude: p.lat, longitude: p.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400);
  };

  const placed = useMemo(() => {
    if (!size.width) return { members: [], sites: [] };
    const at = (lat: number, lng: number) => project(lat, lng, region, size.width, size.height);
    return {
      members: positions.map((p) => ({ p, ...at(p.lat, p.lng) })),
      sites: positions.filter((p) => p.job_lat != null && p.job_lng != null).map((p) => ({ p, ...at(p.job_lat!, p.job_lng!) })),
    };
  }, [positions, region, size]);

  return (
    <ThemedView style={s.container}>
      <StatusBar barStyle="dark-content" />
      <MapView ref={map} style={StyleSheet.absoluteFill} provider={PROVIDER_GOOGLE} initialRegion={START}
        showsCompass={false} toolbarEnabled={false} pitchEnabled={false} rotateEnabled={false} showsBuildings={false}
        onLayout={(e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        onRegionChange={setRegion} onRegionChangeComplete={setRegion}
        onMapReady={() => { ready.current = true; fitOnce(); }} />

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {placed.sites.map(({ p, x, y }) => (
          <View key={`${p.job_id}-site`} pointerEvents="none" style={[s.site, { left: x - SITE / 2, top: y - SITE / 2 }]}>
            <Home size={14} color="#FFFFFF" />
          </View>
        ))}
        {placed.members.map(({ p, x, y }) => {
          const on = focused === p.job_id;
          return (
            <TouchableOpacity key={p.job_id} activeOpacity={0.85} onPress={() => focus(p)}
              style={[s.pin, { left: x - ANCHOR.x, top: y - ANCHOR.y, zIndex: on ? 2 : 1 }]}>
              <View style={[s.ring, on && s.ringOn]}>
                <Monogram name={p.worker_name ?? '?'} size={38} />
              </View>
              <View style={[s.tail, on && { borderTopColor: C.ink }]} />
              <View style={s.label}>
                <ThemedText style={s.labelName} numberOfLines={1}>{(p.worker_name ?? 'Team member').split(' ')[0]}</ThemedText>
                <ThemedText style={s.labelJob} numberOfLines={1}>{p.title}</ThemedText>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.header} pointerEvents="box-none">
        <TouchableOpacity style={s.round} onPress={() => router.back()}>
          <ChevronLeft size={22} color={C.ink} />
        </TouchableOpacity>
        <View style={s.titlePill}>
          <Users size={15} color={C.ink} />
          <ThemedText style={s.title}>Team map</ThemedText>
          <View style={s.count}><ThemedText style={s.countText}>{positions.length}</ThemedText></View>
        </View>
        {positions.length > 0 && (
          <TouchableOpacity style={s.round} onPress={() => { setFocused(null); fitAll(positions); }}>
            <Navigation size={18} color={C.ink} />
          </TouchableOpacity>
        )}
      </View>

      <View style={[s.bottom, { paddingBottom: Math.max(bottomInset, 16) }]} pointerEvents="box-none">
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

const shadow = { shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 };
const s = StyleSheet.create({
  container: { flex: 1 },
  header: { position: 'absolute', top: 56, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  round: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, ...shadow },
  titlePill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.card, ...shadow },
  title: { flex: 1, fontSize: 15, lineHeight: 20, fontFamily: Fonts.poppinsBold, color: C.ink },
  count: { minWidth: 26, height: 22, paddingHorizontal: 7, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brand },
  countText: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.poppinsBold, color: C.ink },

  pin: { position: 'absolute', width: PIN_W, height: PIN_H },
  ring: {
    position: 'absolute', left: 0, top: 0, width: 46, height: 46, borderRadius: 23, padding: 2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: C.brand, overflow: 'hidden',
  },
  ringOn: { borderColor: C.ink },
  tail: {
    position: 'absolute', left: ANCHOR.x - 6, top: 45, width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 10,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: C.brand,
  },
  label: {
    position: 'absolute', left: 52, top: 6, maxWidth: PIN_W - 52, paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 10, backgroundColor: C.ink,
  },
  labelName: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.poppinsBold, color: '#FFFFFF' },
  labelJob: { fontSize: 10.5, lineHeight: 14, fontFamily: Fonts.poppins, color: '#CBD5E1' },
  site: {
    position: 'absolute', width: SITE, height: SITE, borderRadius: SITE / 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.ink, borderWidth: 2, borderColor: '#FFFFFF', ...shadow,
  },

  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  card: { width: CARD_W, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  cardOn: { borderColor: C.ink, borderWidth: 1.5 },
  empty: { marginHorizontal: 16, alignItems: 'center', gap: 4 },
  emptyTitle: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.poppinsBold, color: C.ink },
});
