import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { SkoFyApi, TeamPosition } from '@/services/api';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

const POLL_MS = 10000;

// Where the team is on the business's jobs (docs/BUSINESS_PROVIDERS_DESIGN.md
// §5): only members from setting off until their job is done — the server
// leaves out everyone else. Tap a member to open their job.
export default function BusinessMapScreen() {
  const [positions, setPositions] = useState<TeamPosition[]>([]);
  const [loaded, setLoaded] = useState(false);
  const map = useRef<MapView>(null);
  const fitted = useRef(false);

  const load = useCallback(async () => {
    const next = await SkoFyApi.business.positions().catch(() => null);
    setLoaded(true);
    if (!next) return;
    setPositions(next);
    if (!fitted.current && next.length > 0) {
      fitted.current = true;
      map.current?.fitToCoordinates(next.map((p) => ({ latitude: p.lat, longitude: p.lng })),
        { edgePadding: { top: 120, right: 60, bottom: 160, left: 60 }, animated: false });
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  return (
    <ThemedView style={s.container}>
      <StatusBar barStyle="dark-content" />
      <MapView ref={map} style={StyleSheet.absoluteFill} provider={PROVIDER_GOOGLE}
        initialRegion={{ latitude: 39.5, longitude: -98.35, latitudeDelta: 30, longitudeDelta: 30 }}>
        {positions.map((p) => (
          <Marker key={p.job_id} coordinate={{ latitude: p.lat, longitude: p.lng }} title={p.worker_name ?? 'Team member'}
            description={p.title} onCalloutPress={() => router.push({ pathname: '/business-job', params: { jobId: p.job_id } } as any)} />
        ))}
        {positions.filter((p) => p.job_lat != null && p.job_lng != null).map((p) => (
          <Marker key={`${p.job_id}-site`} coordinate={{ latitude: p.job_lat!, longitude: p.job_lng! }} pinColor="#FFCE48"
            title={p.title} description="The job" />
        ))}
      </MapView>
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <ChevronLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={s.pill}>
          <ThemedText style={s.pillText}>
            {!loaded ? 'Loading…' : positions.length === 0 ? 'Nobody is on a job right now' : `${positions.length} on a job`}
          </ThemedText>
        </View>
      </View>
      <View style={s.footer}>
        <ThemedText style={s.footerText}>Members show only while they're on a job — from setting off until it's done.</ThemedText>
      </View>
    </ThemedView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { position: 'absolute', top: 56, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#FFFFFF' },
  pillText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.poppinsSemiBold, color: '#111827' },
  footer: { position: 'absolute', bottom: 32, left: 16, right: 16, padding: 12, borderRadius: 14, backgroundColor: '#FFFFFFEE' },
  footerText: { fontSize: 12, lineHeight: 17, fontFamily: Fonts.poppins, color: '#374151', textAlign: 'center' },
});
