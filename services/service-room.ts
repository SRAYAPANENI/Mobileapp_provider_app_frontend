import { router } from 'expo-router';

// Opening a job's Service Room from anywhere — job details, the Jobs tab, the
// map, a notification (in the list or tapped on the phone).
//
// It's a sheet on the dashboard (Home). These places used to router.push
// '/(tabs)' with an openServiceRoom param — and a push always adds a screen
// (expo-router 6), so each one built a whole second dashboard over the one
// already open: every tab, its GPS watch, its first loads. The sheet opened
// inside that new dashboard while it was still starting up, and each load
// landing redrew it all — the Service Room stuck, freed up, stuck again; and
// every round trip stacked another dashboard underneath.
//
// Now: back to the dashboard that's open (dismissTo pops to it; from a tab
// it's already there), and Home opens the sheet once it's in view.

type Listener = (jobId: string) => void;

let pending: string | null = null;
const listeners = new Set<Listener>();

export function openServiceRoom(jobId: string): void {
  pending = jobId;
  router.dismissTo('/(tabs)' as any);
  listeners.forEach((l) => l(jobId));
}

/** The job whose room was asked for, once — Home opens it. */
export function takePendingServiceRoom(): string | null {
  const id = pending;
  pending = null;
  return id;
}

/** Home listens: a request while it's mounted (it may be behind another
 * screen, or another tab may be showing). */
export function onServiceRoomRequest(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** A tab of the dashboard (Profile's verification, say) from a screen over
 * it: back to the dashboard that's open, then the tab — pushing the tab's
 * path from outside built a second dashboard, as above. From inside the
 * dashboard, the tab switch is all there is to do. */
export function openDashboardTab(href: { pathname: string; params?: Record<string, string> }): void {
  router.dismissTo('/(tabs)' as any);
  // Once the screens over the dashboard are gone, the tab's path is a tab
  // switch, not a new dashboard.
  setTimeout(() => router.push(href as any), 250);
}
