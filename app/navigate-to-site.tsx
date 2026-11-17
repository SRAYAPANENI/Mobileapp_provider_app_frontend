import { useAppAlert } from '@/components/app-alert';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SkoFyApi } from '@/services/api';
import { GOOGLE_PLACES_API_KEY } from '@/services/google-places';
import { RouteFollower, haversineKm } from '@/services/route';
import { callTapAllowed } from '@/services/callManager';
import { router, useLocalSearchParams } from 'expo-router';
import { openServiceRoom } from '@/services/service-room';
import * as Location from 'expo-location';
import { ChevronLeft, Navigation, MapPin, LocateFixed, MessageSquare, Phone } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  Linking,
  Platform,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { liftBottom, useBottomInset } from '@/hooks/use-bottom-inset';

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

const ANIM_TICK_MS = 50;
const GPS_ANIM_WINDOW_MS = 4000; // interpolate each GPS reading over this window

type LatLng = { latitude: number; longitude: number };

export default function NavigateToSiteScreen() {
  const bottomInset = useBottomInset();
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const styles = React.useMemo(() => makeStyles(themeColors), [colorScheme]);

  const { lat, lng, title, jobId, customerName, stop } = useLocalSearchParams<{
    lat: string; lng: string; title: string; jobId?: string; customerName?: string;
    /** A delivery's leg: the pickup, or the drop-off once it's collected. */
    stop?: 'pickup' | 'dropoff';
  }>();

  // Call / Chat without leaving the map (e.g. "which gate?", "5 min away").
  // Pushed on top, so Back returns here; both use the in-app chat and call,
  // so neither side's phone number is shared — same as the Service Room.
  const openChat = (autoCall: boolean) => {
    if (!jobId || (autoCall && !callTapAllowed())) return;
    router.push({
      pathname: '/chat' as any,
      params: {
        jobId,
        name: customerName || 'Customer',
        jobTitle: title ?? '',
        ...(autoCall ? { autoCall: 'true' } : {}),
      },
    });
  };
  // Memoized on the underlying primitives — this used to be a fresh object
  // literal every render, which made the [gpsLoc, destination] effect below
  // see a "changed" dependency every render (same values, new reference),
  // refire every time, setState, re-render, refire again: infinite loop
  // ("Maximum update depth exceeded"), which starved the map screen from
  // ever settling and rendering correctly.
  const destination: LatLng | null = React.useMemo(
    () => (lat && lng ? { latitude: parseFloat(lat), longitude: parseFloat(lng) } : null),
    [lat, lng],
  );

  const appAlert = useAppAlert();
  const mapRef = useRef<any>(null);
  // Smooth marker animation (same pattern as customer tracking)
  const animFromRef = useRef<LatLng | null>(null);
  const animToRef = useRef<LatLng | null>(null);
  const animStartTimeRef = useRef(0);
  const currentPosRef = useRef<LatLng | null>(null);
  const headingRef = useRef(0); // degrees clockwise from north — same pattern as customer tracking
  // Route state
  // Follows the trip — when to ask for the road again (services/route.ts).
  const followerRef = useRef<RouteFollower | null>(null);
  if (!followerRef.current) followerRef.current = new RouteFollower(GOOGLE_PLACES_API_KEY);
  useEffect(() => () => followerRef.current?.stop(), []);
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
  // Also records "I'm here" (checked against the job's location), which
  // tells the customer and starts the wait before "Customer not here" — if
  // it can't (too far yet, no GPS), the Service Room offers it again.
  // The drop-off has its own "I'm here" (the pickup's refused it once the
  // order was collected — and the refusal was swallowed, so the drop-off's
  // arrival was never recorded from here). Told when it isn't recorded, so
  // they say it again from the Service Room once at the door.
  const [arriving, setArriving] = useState(false);
  const handleArrivedAtLocation = async () => {
    if (!jobId || arriving) return;
    const here = gpsLoc ?? currentPosRef.current;
    if (!here) {
      openServiceRoom(jobId);
      return;
    }
    setArriving(true);
    try {
      await (stop === 'dropoff'
        ? SkoFyApi.jobs.arrivedAtDropoff(jobId, here.latitude, here.longitude)
        : SkoFyApi.jobs.markArrived(jobId, here.latitude, here.longitude));
      openServiceRoom(jobId);
    } catch (err: any) {
      appAlert.show(
        'warning',
        err?.error_code === 'NOT_AT_LOCATION' ? 'Not at the spot yet' : "Couldn't mark you arrived",
        `${err?.message ?? 'Please try again.'} Tap “I'm here” in the Service Room once you're there.`,
        [{ text: 'OK', onPress: () => openServiceRoom(jobId) }],
      );
    } finally {
      setArriving(false);
    }
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

  // Mark navigation started the moment this screen opens. This stops the
  // auto-cancel timer — the provider is on their way even if travel takes
  // longer than the urgency window — so a weak signal mustn't lose it:
  // tried again a few times, then the provider is told and can retry.
  const leftRef = useRef(false);
  useEffect(() => () => { leftRef.current = true; }, []);
  const tellOnTheWay = React.useCallback(async () => {
    if (!jobId) return;
    for (const wait of [0, 3000, 8000]) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      if (leftRef.current) return;     // they left the screen: nothing to retry for
      try {
        await SkoFyApi.jobs.startNavigation(jobId);
        return;
      } catch (err: any) {
        // The job has moved on (cancelled, taken): the status check below says so.
        if (err?.error_code && !['NETWORK_ERROR', 'TIMEOUT', 'INTERNAL_ERROR', 'SERVICE_UNAVAILABLE'].includes(err.error_code)) return;
      }
    }
    if (leftRef.current) return;
    appAlert.show('error', "Couldn't mark you on the way",
      "We couldn't reach Dodorez, so the job may still cancel itself if you're late. Check your connection and try again.",
      [{ text: 'Try again', variant: 'primary', onPress: () => { tellOnTheWay(); } }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);
  useEffect(() => { tellOnTheWay(); }, [tellOnTheWay]);

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
    // A little inside the server's 150 m (WAIT_START_MAX_KM): GPS drifts
    // between the phone's reading and the server's check.
    setIsNearSite(distKm < 0.12);

    // What's left, from this fix — along the road route, or the straight
    // line × 1.3 without one (services/route.ts). Every GPS fix, so distance
    // and time go down as they drive. Only a road is drawn: without one the
    // map shows where they are and where they're going, never a straight line.
    followerRef.current!.follow(gpsLoc, destination, (left) => {
      setRouteCoords(left.road ? left.coords : []);
      setDistanceText(`${left.distanceMi.toFixed(1)} mi`);
      setEtaText(`${left.durationMins} min${left.durationMins === 1 ? '' : 's'}`);
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
          style={liftBottom([styles.locateBtn, isFollowing && styles.locateBtnActive], bottomInset)}
          onPress={handleLocate}
        >
          <LocateFixed size={20} color={isFollowing ? '#fff' : '#000'} />
        </TouchableOpacity>
      )}

      {/* Info panel — ETA + distance + fallback button */}
      {appAlert.element}

      {!mapError && destination && (
        <View style={liftBottom(styles.panel, bottomInset)}>
          <View style={styles.etaRow}>
            <View>
              <ThemedText style={styles.arrivingLabel}>Arriving in</ThemedText>
              <ThemedText style={styles.etaText}>{myLoc ? etaText : '—'}</ThemedText>
            </View>
            <View style={styles.distanceBadge}>
              <ThemedText style={styles.distanceText}>{myLoc ? distanceText : '—'}</ThemedText>
            </View>
          </View>

          {!!jobId && (
            <View style={styles.contactRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <ThemedText style={styles.contactLabel}>Customer</ThemedText>
                <ThemedText style={styles.contactName} numberOfLines={1}>{customerName || 'Customer'}</ThemedText>
              </View>
              <TouchableOpacity
                style={[styles.contactBtn, { backgroundColor: '#DCFCE7' }]}
                onPress={() => openChat(true)}
                accessibilityRole="button"
                accessibilityLabel={`Call ${customerName || 'customer'}`}
              >
                <Phone size={18} color="#16A34A" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.contactBtn, { backgroundColor: '#DBEAFE' }]}
                onPress={() => openChat(false)}
                accessibilityRole="button"
                accessibilityLabel={`Chat with ${customerName || 'customer'}`}
              >
                <MessageSquare size={18} color="#2563EB" />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.divider} />

          {isNearSite ? (
            <TouchableOpacity
              style={styles.arrivedBtn}
              onPress={handleArrivedAtLocation}
              disabled={arriving}
              activeOpacity={0.85}
            >
              <ThemedText style={styles.arrivedBtnText}>{arriving ? 'Checking…' : 'Arrived at Location'}</ThemedText>
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
      fontSize: 13, lineHeight: 17,
      fontFamily: Fonts.poppins,
      color: t.textSecondary,
    },
    etaText: {
      fontSize: 24, lineHeight: 30,
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
      fontSize: 15, lineHeight: 19,
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
    // Call / Chat row — same 40x40 buttons and colours as the Service Room's.
    contactRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 16,
    },
    contactLabel: {
      fontSize: 12, lineHeight: 16,
      fontFamily: Fonts.poppins,
      color: t.textSecondary,
    },
    contactName: {
      fontSize: 15, lineHeight: 19,
      fontFamily: Fonts.poppinsSemiBold,
      color: t.textPrimary,
    },
    contactBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    panelTitle: {
      fontSize: 15, lineHeight: 19,
      fontFamily: Fonts.poppinsBold,
      color: t.textPrimary,
    },
    panelSub: {
      fontSize: 12, lineHeight: 16,
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
      fontSize: 13, lineHeight: 17,
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
      fontSize: 16, lineHeight: 20,
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
      fontSize: 15, lineHeight: 19,
      fontFamily: Fonts.poppins,
      color: '#9CA3AF',
      textAlign: 'center',
    },
  });
}
