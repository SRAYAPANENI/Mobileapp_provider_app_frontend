import * as Location from 'expo-location';

// The provider's latest GPS fix, readable anywhere. The dashboard already
// watches GPS (every few metres while it's open); it writes each fix here,
// and the Service Room reads it for "I'm here", the inspection code and the
// pickup — the live position, not one held back for display.

export type LatLng = { latitude: number; longitude: number };

let latest: LatLng | null = null;

export function setLivePosition(position: LatLng): void {
  latest = position;
}

/** The latest fix, or a fresh one when there's none yet; null when location
 * is off or not allowed. */
export async function currentPosition(): Promise<LatLng | null> {
  if (latest) return latest;
  try {
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    latest = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    return latest;
  } catch {
    return null;
  }
}
