import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { API_BASE_URL } from './api-config';
import { getFreshAccessToken } from './api';

// Two ways the server learns where a provider is, each its own task:
// - On a trip (LOCATION_TASK_NAME): every few metres, for the customer's map.
// - Online and free (ONLINE_TASK_NAME): about every 500 m, even with the app
//   closed — so jobs reach them as they come near, and leave as they go
//   (the server's catch-up and feed, DistributionAgent.catch_up).
// Never both: a trip takes over from online, and online resumes after.
export const LOCATION_TASK_NAME = 'skofy-background-location';
export const ONLINE_TASK_NAME = 'skofy-online-location';

/** One fix to the server (PATCH /providers/me/location). */
async function sendFix({ data, error }: any): Promise<void> {
  if (error) { console.warn('[BGLocation]', error); return; }
  const location = (data as any)?.locations?.[0];
  if (!location) return;
  try {
    // Renewed when it's about to lapse (tokens last 15 minutes): reading the
    // stored one as-is had every update refused a quarter of an hour into a
    // trip, and the customer's live tracking stopped with the phone locked.
    const token = await getFreshAccessToken();
    if (!token) return;
    await fetch(`${API_BASE_URL}/providers/me/location`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lat: location.coords.latitude, lng: location.coords.longitude }),
    });
  } catch {
    // Network blip or a keychain still shut — the next fix will retry
  }
}

// Registered at module level so they're available before any component mounts.
// This file MUST be imported in the root _layout.tsx before anything renders.
TaskManager.defineTask(LOCATION_TASK_NAME, sendFix);
TaskManager.defineTask(ONLINE_TASK_NAME, sendFix);

async function running(task: string): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(task).catch(() => false);
}

// One change at a time, in the order asked: a stop overtaking a start still
// being set up left tracking on, and going back online was skipped while the
// trip's own stop was still under way.
let queue: Promise<void> = Promise.resolve();
const inTurn = (change: () => Promise<void>): Promise<void> => (queue = queue.then(change, change));

export const startBackgroundLocation = (business: string | null = null) => inTurn(() => startTrip(business));
export const stopBackgroundLocation = () => inTurn(stopTrip);
export const startOnlineLocation = () => inTurn(startOnline);
export const stopOnlineLocation = () => inTurn(stopOnline);

/** On a trip: the customer follows them closely. Online mode steps aside. */
// Who the running trip says it's shared with — started again when that changes.
let sharingWith: string | null | undefined;

/** `business`: the business the trip is for — it sees the location too, and
 * the member is always told so (the server's LOCATION_NOTICE). */
async function startTrip(business: string | null) {
  try {
    await stopOnline();
    if (await running(LOCATION_TASK_NAME)) {
      if (sharingWith === business) return;
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
    sharingWith = business;
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      distanceInterval: 5,  // fire after 5 m of movement …
      timeInterval: 2000,   // … OR every 2 s while standing still
      // Foreground service keeps the task alive even when the app is swiped away
      foregroundService: {
        notificationTitle: 'Dodorez Pro — On the way',
        notificationBody: business
          ? `Your location is being shared with the customer and ${business}.`
          : 'Your location is being shared with the customer.',
        notificationColor: '#FFCE48',
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });
  } catch (e) {
    console.warn('[BGLocation] start failed:', e);
  }
}

async function stopTrip() {
  try {
    if (await running(LOCATION_TASK_NAME)) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch (e) {
    console.warn('[BGLocation] stop failed:', e);
  }
}

/** Online and free for work: where they are, every ~500 m, app open or not.
 * Never during a trip (its own, closer tracking runs then). */
async function startOnline() {
  try {
    if (await running(LOCATION_TASK_NAME) || await running(ONLINE_TASK_NAME)) return;
    const fg = await Location.getForegroundPermissionsAsync();
    // "While using the app" is enough: started while the app is open, it
    // carries on in the background (iPhone shows its blue location pill;
    // Android its "Online" notification). No "Always" asked for — on Android
    // that opens Settings unexplained the moment they go online.
    if (!fg.granted) return;                     // asked for on Home; nothing to do without it
    await Location.startLocationUpdatesAsync(ONLINE_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 500,          // a new fix after ~500 m of movement
      deferredUpdatesDistance: 500,   // batched by the phone to save battery
      deferredUpdatesInterval: 60_000,
      activityType: Location.ActivityType.AutomotiveNavigation,
      // Not paused by iOS while they stay put: a paused task only resumes
      // when the app is opened, and jobs would stop reaching them as they moved.
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: 'Dodorez Pro — Online',
        notificationBody: 'Finding jobs near you. Go offline to stop.',
        notificationColor: '#FFCE48',
      },
      showsBackgroundLocationIndicator: true,
    });
  } catch (e) {
    console.warn('[OnlineLocation] start failed:', e);
  }
}

async function stopOnline() {
  try {
    if (await running(ONLINE_TASK_NAME)) await Location.stopLocationUpdatesAsync(ONLINE_TASK_NAME);
  } catch (e) {
    console.warn('[OnlineLocation] stop failed:', e);
  }
}

/** Logging out / deleting the account: no location leaves the phone after. */
export async function stopAllBackgroundLocation() {
  await Promise.all([stopBackgroundLocation(), stopOnlineLocation()]);
}
