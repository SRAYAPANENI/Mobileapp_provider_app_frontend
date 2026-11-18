import Constants from 'expo-constants';

/**
 * Google Places API Integration Service (New v1 API)
 * Uses the API key from app.json
 */

// Read from `extra`: Expo strips `android.config` from the config embedded in
// a release build (it treats it as private), so the googleMaps key is only
// there in dev — a release APK sent an empty key: no road routes on the maps
// (services/route.ts never asked Google) and no address search. The customer
// app had the same fix. `android.config.googleMaps` stays for the native Maps SDK.
export const GOOGLE_PLACES_API_KEY: string =
  (Constants.expoConfig?.extra?.googlePlacesApiKey as string | undefined)
  ?? Constants.expoConfig?.android?.config?.googleMaps?.apiKey
  ?? '';
if (!GOOGLE_PLACES_API_KEY) {
  console.warn('GOOGLE_PLACES_API_KEY is not configured — set expo.extra.googlePlacesApiKey in app.json.');
}

export interface GooglePlaceSuggestion {
  description: string;
  place_id: string;
  distance?: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
    main_text_matched_substrings?: Array<{ offset: number; length: number }>;
  };
}

export interface PlaceDetails {
  latitude: number;
  longitude: number;
  formatted_address: string;
  city?: string;
  state?: string;
  pincode?: string;
}

// Generate a random session token for billing optimization (New API uses sessionToken as part of the request)
let sessionToken = Math.random().toString(36).substring(2, 15);

export const GooglePlacesService = {
  /**
   * Fetch address suggestions based on user input (New v1 API)
   */
  searchAddress: async (input: string, signal?: AbortSignal, coords?: { latitude: number, longitude: number }): Promise<GooglePlaceSuggestion[]> => {
    if (!input || input.length < 2) return [];

    try {
      const url = `https://places.googleapis.com/v1/places:autocomplete`;

      // Default to central India center if no coords provided for bias
      const latitude = coords?.latitude || 20.5937;
      const longitude = coords?.longitude || 78.9629;

      const body = {
        input,
        locationBias: {
          circle: {
            center: { latitude, longitude },
            radius: 50000 // 50km radius bias
          }
        },
        sessionToken
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        },
        body: JSON.stringify(body),
        signal
      });

      const json = await response.json();

      if (json.suggestions) {
        return json.suggestions.map((item: any) => {
          const prediction = item.placePrediction;
          return {
            description: prediction.text.text,
            place_id: prediction.placeId,
            structured_formatting: {
              main_text: prediction.structuredFormat.mainText.text,
              secondary_text: prediction.structuredFormat.secondaryText?.text || '',
              main_text_matched_substrings: prediction.structuredFormat.mainText.matchedSubstrings?.map((ms: any) => ({
                offset: ms.startOffset || 0,
                length: ms.length || 0
              }))
            }
          };
        });
      } else {
        if (json.error) {
          console.error('Google Places API Error (New):', json.error.status, json.error.message);
          throw new Error(json.error.message || json.error.status);
        }
        return [];
      }
    } catch (error: any) {
      if (error.name === 'AbortError') return [];
      console.error('Autocomplete Network/Fetch Error (New):', error);
      throw error;
    }
  },

  /**
   * Fetch specific coordinates and address components for a place (New v1 API)
   */
  getPlaceDetails: async (place_id: string): Promise<PlaceDetails> => {
    // Asked again once when the request itself fails (a dropped or slow
    // mobile connection, a brief Google 5xx) — a customer on weak signal
    // got "Could not fetch location details" for a place that was fine.
    // A real refusal from Google (key, quota, a bad place id) isn't retried.
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await fetchPlaceDetails(place_id);
      } catch (error: any) {
        lastError = error;
        if (!error?.retryable) break;
      }
    }
    console.error('Place Details Error (New):', lastError);
    throw lastError;
  },

};

/** One Place Details request (New v1 API). Errors carry Google's reason —
 * "Places API error — <REASON>: …", as the search's do — and say whether
 * asking again could help (`retryable`). */
async function fetchPlaceDetails(place_id: string): Promise<PlaceDetails> {
  // Fields must be specified for the New API.
  const fields = 'location,formattedAddress,addressComponents';
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(place_id)}?fields=${fields}&key=${GOOGLE_PLACES_API_KEY}&sessionToken=${sessionToken}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error: any) {
    // No answer at all: the connection.
    throw Object.assign(new Error(`Places API error — NETWORK: ${error?.message ?? 'no response'}`), { retryable: true });
  }
  if (!response.ok) {
    const errJson = await response.json().catch(() => null);
    const reason = errJson?.error?.details?.find((d: any) => d?.reason)?.reason;
    const code = reason || errJson?.error?.status;
    const detail = code ? `${code}: ${errJson.error.message || ''}`.trim() : `${response.status} ${response.statusText}`;
    throw Object.assign(new Error(`Places API error — ${detail}`), { retryable: response.status >= 500 });
  }
  const json = await response.json();
  // A complete session (autocomplete then details): the next search starts a new one.
  sessionToken = Math.random().toString(36).substring(2, 15);

  if (!json.formattedAddress || !json.location) {
    throw Object.assign(new Error('Places API error — NO_LOCATION: this place has no address or point'), { retryable: false });
  }
  const details: PlaceDetails = {
    latitude: json.location.latitude,
    longitude: json.location.longitude,
    formatted_address: json.formattedAddress,
  };
  // v1 names the parts differently; a place may have none (an area, a landmark).
  (json.addressComponents ?? []).forEach((comp: any) => {
    if (comp.types?.includes('locality')) details.city = comp.longText;
    if (comp.types?.includes('administrative_area_level_1')) details.state = comp.longText;
    if (comp.types?.includes('postal_code')) details.pincode = comp.longText;
  });
  return details;
}
