import * as Location from 'expo-location';

// The provider's latest GPS fix, readable anywhere. The dashboard already
// watches GPS (every few metres while it's open); it writes each fix here,
// and the Service Room reads it for "I'm here", the inspection code and the
// pickup — each checked against where the provider is, so the fix must be
// recent: an older one (the dashboard's watch stopped, the app was away) is
// replaced by a fresh reading.

export type LatLng = { latitude: number; longitude: number };

/** Older than this, a fix isn't trusted for an on-site check. */
const MAX_AGE_MS = 60_000;

let latest: { position: LatLng; at: number } | null = null;

export function setLivePosition(position: LatLng): void {
  latest = { position, at: Date.now() };
}

/** A recent fix, or a fresh one — asking for location permission if it
 * hasn't been given yet. Null when location is off or refused. */
export async function currentPosition(): Promise<LatLng | null> {
  if (latest && Date.now() - latest.at <= MAX_AGE_MS) return latest.position;
  try {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') ({ status } = await Location.requestForegroundPermissionsAsync());
    if (status !== 'granted') return null;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setLivePosition({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    return latest!.position;
  } catch {
    return null;
  }
}
