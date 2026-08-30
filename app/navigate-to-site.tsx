import { useAppAlert } from '@/components/app-alert';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SkoFyApi } from '@/services/api';
import { GOOGLE_PLACES_API_KEY } from '@/services/google-places';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { ChevronLeft, Navigation, MapPin, LocateFixed } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  Linking,
  Platform,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

let MapView: any;
let Marker: any;
let Polyline: any;
let PROVIDER_GOOGLE: any;

if (Platform.OS !== 'web') {
  try {
    const maps = require('react-native-maps');
    MapView = maps.default;
    Marker = maps.Marker;
    Polyline = maps.Polyline;
    PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
  } catch {}
}

const ROUTE_REFETCH_KM = 0.3;
const ANIM_TICK_MS = 50;
const GPS_ANIM_WINDOW_MS = 4000; // interpolate each GPS reading over this window

type LatLng = { latitude: number; longitude: number };

function decodePolyline(encoded: string): LatLng[] {
  const coords: LatLng[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b: number, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;
    shift = result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;
    coords.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return coords;
}

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLon = (b.longitude - a.longitude) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * Math.PI / 180) * Math.cos(b.latitude * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function fetchRoute(origin: LatLng, dest: LatLng): Promise<{ coords: LatLng[]; durationMins: number | null; distanceMi: number | null }> {
  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${dest.latitude},${dest.longitude}&mode=driving&key=${GOOGLE_PLACES_API_KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    const encoded = json?.routes?.[0]?.overview_polyline?.points;
    const leg = json?.routes?.[0]?.legs?.[0];
    const durationMins = leg ? Math.ceil(leg.duration.value / 60) : null;
    const distanceMi = leg ? leg.distance.value / 1609.34 : null;
    if (encoded) return { coords: decodePolyline(encoded), durationMins, distanceMi };
  } catch {}
  const distKm = haversineKm(origin, dest);
  return {
    coords: [origin, dest],
    durationMins: Math.ceil(distKm / (40 / 60)),
    distanceMi: distKm * 0.621371,
  };
}

export default function NavigateToSiteScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const styles = React.useMemo(() => makeStyles(themeColors), [colorScheme]);

  const { lat, lng, title, jobId } = useLocalSearchParams<{ lat: string; lng: string; title: string; jobId?: string }>();
  const destination: LatLng | null =
    lat && lng ? { latitude: parseFloat(lat), longitude: parseFloat(lng) } : null;

  const appAlert = useAppAlert();
  const mapRef = useRef<any>(null);
  // Smooth marker animation (same pattern as customer tracking)
  const animFromRef = useRef<LatLng | null>(null);
  const animToRef = useRef<LatLng | null>(null);
  const animStartTimeRef = useRef(0);
  const currentPosRef = useRef<LatLng | null>(null);
  const headingRef = useRef(0); // degrees clockwise from north — same pattern as customer tracking
  // Route state
  const fullRouteCoordsRef = useRef<LatLng[]>([]);
  const lastRouteFetchLocRef = useRef<LatLng | null>(null);
  // Follow mode — camera locks onto provider icon when active
  const isFollowingRef = useRef(false);
  const lastFollowTickRef = useRef(0);

  const [myLoc, setMyLoc] = useState<LatLng | null>(null);       // animated position (50ms)
  const [gpsLoc, setGpsLoc] = useState<LatLng | null>(null);     // real GPS reading
  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);
  const [etaText, setEtaText] = useState('—');
  const [distanceText, setDistanceText] = useState('—');
  const [isNearSite, setIsNearSite] = useState(false);
  const [mapError, setMapError] = useState(!MapView);
  const [isFollowing, setIsFollowing] = useState(false);

  // "Arrived at Location" used to call markStarted() directly, flipping the
  // job straight to IN_PROGRESS — that's the OLD flow, from before on-site
  // inspection existed. Bidding is retired: the real price is only ever set
  // by a post-inspection invoice, and inspection itself is gated by an OTP
  // the customer reads aloud (proof of presence) plus this same geofence
  // check, done via request_inspection_otp/verify_inspection_otp instead.
  // Calling markStarted here would skip the inspection fee, the OTP, and the
  // invoice entirely — exactly the bug that made all of that look "missing".
  // This just takes them back to the Service Room, still ACCEPTED, where
  // they start the real flow.
  const handleArrivedAtLocation = () => {
    if (!jobId) return;
    router.replace({ pathname: '/(tabs)', params: { openServiceRoom: 'true', jobId } } as any);
  };

  // Watch provider's own GPS
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const initLoc = { latitude: initial.coords.latitude, longitude: initial.coords.longitude };
      animFromRef.current = initLoc;
      animToRef.current = initLoc;
      currentPosRef.current = initLoc;
      setMyLoc(initLoc);
      setGpsLoc(initLoc);

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5 },
        (loc) => {
          const next = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          animFromRef.current = currentPosRef.current ?? next;
          animToRef.current = next;
          animStartTimeRef.current = Date.now();
          if (loc.coords.heading != null && loc.coords.heading >= 0) headingRef.current = loc.coords.heading;
          setGpsLoc(next);
        }
      );
    })();
    return () => { sub?.remove(); };
  }, []);

  // Fire-and-forget: mark navigation started the moment this screen opens.
  // This stops the auto-cancel timer — the provider is on their way even
  // if travel takes longer than the urgency window.
  useEffect(() => {
    if (!jobId) return;
    SkoFyApi.jobs.startNavigation(jobId).catch(() => {});
  }, [jobId]);

  // Poll job status — if customer cancels while provider is navigating,
  // show a branded alert and redirect to dashboard.
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const check = async () => {
      try {
        const job = await SkoFyApi.jobs.get(jobId);
        if (cancelled) return;
        if (job.status === 'CANCELLED') {
          appAlert.show(
            'warning',
            'Job Cancelled',
            job.cancellation_reason
              ? `The customer cancelled this job.\n\nReason: ${job.cancellation_reason}`
              : 'The customer cancelled this job.',
            [{ text: 'Go to Dashboard', onPress: () => router.replace('/(tabs)' as any) }],
          );
          clearInterval(interval);
        }
      } catch {
        // ignore — keep polling
      }
    };
    check();
    const interval = setInterval(check, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [jobId]);

  // Smooth marker animation tick (50ms)
  useEffect(() => {
    const tick = () => {
      if (!animToRef.current) return;
      if (!animFromRef.current) {
        currentPosRef.current = animToRef.current;
        setMyLoc(animToRef.current);
        return;
      }
      const progress = Math.min(1, (Date.now() - animStartTimeRef.current) / GPS_ANIM_WINDOW_MS);
      const point = {
        latitude: animFromRef.current.latitude + (animToRef.current.latitude - animFromRef.current.latitude) * progress,
        longitude: animFromRef.current.longitude + (animToRef.current.longitude - animFromRef.current.longitude) * progress,
      };
      currentPosRef.current = point;
      setMyLoc(point);
    };
    const interval = setInterval(tick, ANIM_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  // Camera follow in follow mode — throttled to ~10fps so map isn't fighting the user
  useEffect(() => {
    if (!isFollowingRef.current || !myLoc || !mapRef.current) return;
    const now = Date.now();
    if (now - lastFollowTickRef.current < 100) return;
    lastFollowTickRef.current = now;
    mapRef.current.animateToRegion(
      { ...myLoc, latitudeDelta: 0.003, longitudeDelta: 0.003 },
      80,
    );
  }, [myLoc]);

  // Route trimming + refetch on each real GPS update
  useEffect(() => {
    if (!gpsLoc || !destination) return;

    const distKm = haversineKm(gpsLoc, destination);
    setIsNearSite(distKm < 0.15);

    // Trim existing route to start from nearest point to provider
    const full = fullRouteCoordsRef.current;
    if (full.length >= 2) {
      let minIdx = 0, minDist = Infinity;
      for (let i = 0; i < full.length; i++) {
        const d = haversineKm(gpsLoc, full[i]);
        if (d < minDist) { minDist = d; minIdx = i; }
      }
      setRouteCoords([gpsLoc, ...full.slice(minIdx + 1)]);
    }

    // Re-fetch from Directions API when moved 0.3km
    const last = lastRouteFetchLocRef.current;
    if (last && haversineKm(last, gpsLoc) < ROUTE_REFETCH_KM) return;
    lastRouteFetchLocRef.current = gpsLoc;
    fetchRoute(gpsLoc, destination).then(({ coords, durationMins, distanceMi }) => {
      fullRouteCoordsRef.current = coords;
      setRouteCoords(coords);
      if (durationMins != null) setEtaText(`${durationMins} min${durationMins === 1 ? '' : 's'}`);
      if (distanceMi != null) setDistanceText(`${distanceMi.toFixed(1)} mi`);
    });
  }, [gpsLoc, destination]);

  const handleLocate = () => {
    isFollowingRef.current = true;
    setIsFollowing(true);
    if (myLoc && mapRef.current) {
      mapRef.current.animateToRegion(
        { ...myLoc, latitudeDelta: 0.003, longitudeDelta: 0.003 },
        600,
      );
    }
  };

  const handleMapDrag = () => {
    if (isFollowingRef.current) {
      isFollowingRef.current = false;
      setIsFollowing(false);
    }
  };

  const openExternalMaps = () => {
    if (!destination) return;
    const query = `${destination.latitude},${destination.longitude}`;
    const url = Platform.select({ ios: `maps:0,0?q=${query}`, android: `geo:0,0?q=${query}` });
    if (url) Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {mapError || !destination ? (
        <View style={styles.fallback}>
          <MapPin size={48} color="#9CA3AF" />
          <ThemedText style={styles.fallbackText}>
            {!destination ? 'No job location available.' : 'Map unavailable on this device.'}
          </ThemedText>
          {destination && (
            <TouchableOpacity style={styles.externalBtn} onPress={openExternalMaps}>
              <Navigation size={16} color="#fff" />
              <ThemedText style={styles.externalBtnText}>Open in Maps App</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            latitude: destination.latitude,
            longitude: destination.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          showsUserLocation={false}
          showsMyLocationButton={false}
          onPanDrag={handleMapDrag}
          onMapReady={() => {
            if (myLoc) {
              mapRef.current?.fitToCoordinates([myLoc, destination], {
                edgePadding: { top: 80, right: 60, bottom: 240, left: 60 },
                animated: false,
              });
            }
          }}
          onError={() => setMapError(true)}
        >
          {/* Road route — shrinks as provider travels */}
          {routeCoords.length >= 2 && (
            <Polyline coordinates={routeCoords} strokeWidth={5} strokeColor="#4285F4" />
          )}

          {/* Provider's animated position — same branded vehicle icon and
              native `image`-marker approach as the customer app's tracking
              screen (see its comment: a real native Marker via `image`
              renders through the platform's icon path and stays locked to
              the map during zoom/rotate, unlike a view-to-bitmap snapshot). */}
          {myLoc && (
            <Marker
              coordinate={myLoc}
              image={require('@/assets/images/provider-marker.png')}
              anchor={{ x: 0.5, y: 0.5 }}
              rotation={headingRef.current}
              flat
            />
          )}

          {/* Job site */}
          <Marker
            coordinate={destination}
            title={title ?? 'Job Site'}
            image={require('@/assets/images/destination-pin.png')}
            anchor={{ x: 0.5, y: 1.0 }}
          />
        </MapView>
      )}

      {/* Back button */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <ChevronLeft size={24} color="#000" />
      </TouchableOpacity>

      {/* Locate / follow button */}
      {!mapError && destination && (
        <TouchableOpacity
          style={[styles.locateBtn, isFollowing && styles.locateBtnActive]}
          onPress={handleLocate}
        >
          <LocateFixed size={20} color={isFollowing ? '#fff' : '#000'} />
        </TouchableOpacity>
      )}

      {/* Info panel — ETA + distance + fallback button */}
      {appAlert.element}

      {!mapError && destination && (
        <View style={styles.panel}>
          <View style={styles.etaRow}>
            <View>
              <ThemedText style={styles.arrivingLabel}>Arriving in</ThemedText>
              <ThemedText style={styles.etaText}>{myLoc ? etaText : '—'}</ThemedText>
            </View>
            <View style={styles.distanceBadge}>
              <ThemedText style={styles.distanceText}>{myLoc ? distanceText : '—'}</ThemedText>
            </View>
          </View>

          <View style={styles.divider} />

          {isNearSite ? (
            <TouchableOpacity
              style={styles.arrivedBtn}
              onPress={handleArrivedAtLocation}
              activeOpacity={0.85}
            >
              <ThemedText style={styles.arrivedBtnText}>Arrived at Location</ThemedText>
            </TouchableOpacity>
          ) : (
            <View style={styles.panelRow}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.panelTitle}>{title ?? 'Job Site'}</ThemedText>
                <ThemedText style={styles.panelSub}>
                  {myLoc ? 'Navigating on road' : 'Getting your location…'}
                </ThemedText>
              </View>
              <TouchableOpacity style={styles.externalBtn} onPress={openExternalMaps}>
                <Navigation size={14} color="#fff" />
                <ThemedText style={styles.externalBtnText}>Maps App</ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function makeStyles(t: typeof Colors.light) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F3F4F6' },
    backBtn: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 56 : 44,
      left: 16,
      zIndex: 10,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#fff',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 4,
    },
    locateBtn: {
      position: 'absolute',
      bottom: Platform.OS === 'ios' ? 256 : 240,
      right: 16,
      zIndex: 10,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: '#fff',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 6,
      borderWidth: 1,
      borderColor: '#E5E7EB',
    },
    locateBtnActive: {
      backgroundColor: '#4285F4',
      borderColor: '#4285F4',
    },
    panel: {
      position: 'absolute',
      bottom: Platform.OS === 'ios' ? 40 : 24,
      left: 16,
      right: 16,
      backgroundColor: t.card,
      borderRadius: 24,
      padding: 20,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 8,
    },
    etaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    arrivingLabel: {
      fontSize: 13,
      fontFamily: Fonts.poppins,
      color: t.textSecondary,
    },
    etaText: {
      fontSize: 24,
      fontFamily: Fonts.poppinsBold,
      color: t.textPrimary,
      marginTop: 2,
    },
    distanceBadge: {
      backgroundColor: t.inputFilled,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 14,
    },
    distanceText: {
      fontSize: 15,
      fontFamily: Fonts.poppinsBold,
      color: t.textPrimary,
    },
    divider: {
      height: 1,
      backgroundColor: t.inputFilled,
      marginBottom: 16,
    },
    panelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    panelTitle: {
      fontSize: 15,
      fontFamily: Fonts.poppinsBold,
      color: t.textPrimary,
    },
    panelSub: {
      fontSize: 12,
      fontFamily: Fonts.poppins,
      color: t.textSecondary,
      marginTop: 2,
    },
    externalBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#4285F4',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 16,
    },
    externalBtnText: {
      color: '#fff',
      fontSize: 13,
      fontFamily: Fonts.poppinsSemiBold,
    },
    arrivedBtn: {
      backgroundColor: '#10B981',
      height: 52,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#10B981',
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    arrivedBtnText: {
      color: '#fff',
      fontSize: 16,
      fontFamily: Fonts.poppinsBold,
    },
    fallback: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 16,
      padding: 40,
    },
    fallbackText: {
      fontSize: 15,
      fontFamily: Fonts.poppins,
      color: '#9CA3AF',
      textAlign: 'center',
    },
  });
}
