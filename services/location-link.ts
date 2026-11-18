/**
 * A location pasted as a link — shared on WhatsApp or Google Maps — turned
 * into a place, for an address box (the address step of Register).
 * Mirrors skofy-customer-app/services/location-link.ts (the apps share no code).
 *
 * The server reads the link (POST /jobs/pickup-location-link): its pin and,
 * when the link names it, the place. A named place is found on Google next
 * to that pin for its full address.
 */
import * as Clipboard from 'expo-clipboard';
import * as Location from 'expo-location';
import { SkoFyApi } from './api';
import { GooglePlacesService } from './google-places';

/** A place a link gave. */
export interface LinkedPlace {
  lat: number;
  lng: number;
  /** What to show in the address box. */
  address: string;
  city?: string;
}

/** A link gives a place, or — with no pin — a name to search for as typed. */
export type LinkResult = { kind: 'place'; place: LinkedPlace } | { kind: 'search'; query: string };

/** Why a link couldn't be used, said to the provider. */
export class LinkError extends Error {}

/** Text holding a link — read by the server instead of searched for. */
export function looksLikeLink(text: string): boolean {
  return /https?:\/\//i.test(text);
}

// How near the pin the named place must be to be the one the link means.
const SAME_PLACE_MILES = 0.2; // about 300 m

export async function placeFromLink(text: string): Promise<LinkResult> {
  let found: { lat: number | null; lng: number | null; query: string | null; name?: string | null };
  try {
    found = await SkoFyApi.jobs.resolveLocationLink(text);
  } catch (e: any) {
    throw new LinkError(e?.message || "Couldn't read that link. Type the address instead.");
  }
  if (found.lat == null || found.lng == null) {
    if (found.query) return { kind: 'search', query: found.query };
    throw new LinkError("Couldn't read that link. Type the address instead.");
  }
  const pin = { lat: found.lat, lng: found.lng };
  const named = found.name ? await placeNamedAt(found.name, pin) : null;
  return { kind: 'place', place: named ?? await pinnedPlace(pin, found.name ?? null) };
}

/** The clipboard's text, for a "Paste a location link" button. */
export async function clipboardText(): Promise<string> {
  const text = (await Clipboard.getStringAsync().catch(() => '')).trim();
  if (!text) throw new LinkError('Nothing to paste — copy the location link first.');
  if (!looksLikeLink(text)) throw new LinkError("What's copied isn't a link. Copy the location link from WhatsApp or Google Maps.");
  return text;
}

function miles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

async function placeNamedAt(name: string, pin: { lat: number; lng: number }): Promise<LinkedPlace | null> {
  try {
    const suggestions = await GooglePlacesService.searchAddress(name, undefined, { latitude: pin.lat, longitude: pin.lng });
    for (const s of suggestions.slice(0, 3)) {
      const d = await GooglePlacesService.getPlaceDetails(s.place_id);
      if (miles(pin, { lat: d.latitude, lng: d.longitude }) <= SAME_PLACE_MILES) {
        return { lat: d.latitude, lng: d.longitude, address: d.formatted_address, city: d.city };
      }
    }
  } catch {
    // Search down: the pin still stands.
  }
  return null;
}

async function pinnedPlace(pin: { lat: number; lng: number }, name: string | null): Promise<LinkedPlace> {
  let address = name ?? `Shared location (${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)})`;
  let city: string | undefined;
  try {
    const [p] = await Location.reverseGeocodeAsync({ latitude: pin.lat, longitude: pin.lng });
    if (p) {
      const street = [p.streetNumber, p.street].filter(Boolean).join(' ');
      const line = [name ?? p.name, street && street !== p.name ? street : null, p.city, p.region, p.postalCode]
        .filter(Boolean).join(', ');
      if (line) address = line;
      city = p.city ?? undefined;
    }
  } catch { /* the coordinates are enough */ }
  return { lat: pin.lat, lng: pin.lng, address, city };
}
