import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import { API_BASE_URL } from './api-config';

export const LOCATION_TASK_NAME = 'skofy-background-location';

const TOKEN_KEY = 'skofy_access_token';

// Registered at module level so it's available before any component mounts.
// This file MUST be imported in the root _layout.tsx before anything renders.
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) { console.warn('[BGLocation]', error); return; }
  const location = (data as any)?.locations?.[0];
  if (!location) return;

  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) return;

  try {
    // Must be PATCH — matches the backend endpoint PATCH /providers/me/location
    await fetch(`${API_BASE_URL}/providers/me/location`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lat: location.coords.latitude, lng: location.coords.longitude }),
    });
  } catch {
    // Network blip — next GPS tick will retry
  }
});

export async function startBackgroundLocation() {
  try {
    const already = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (already) return;
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      distanceInterval: 5,  // fire after 5 m of movement …
      timeInterval: 2000,   // … OR every 2 s while standing still
      // Foreground service keeps the task alive even when the app is swiped away
      foregroundService: {
        notificationTitle: 'SkoFy — On the way',
        notificationBody: 'Your location is being shared with the customer.',
        notificationColor: '#FFCE48',
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });
  } catch (e) {
    console.warn('[BGLocation] start failed:', e);
  }
}

export async function stopBackgroundLocation() {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (started) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch (e) {
    console.warn('[BGLocation] stop failed:', e);
  }
}
