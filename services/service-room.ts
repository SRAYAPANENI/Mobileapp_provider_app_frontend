import { router } from 'expo-router';

// Opening a job's Service Room from anywhere — the dashboard, job details,
// the Jobs tab, the map, a notification (in the list or tapped on the phone).
//
// It's a screen of its own (app/service-room.tsx). It used to be a sheet drawn
// inside the dashboard, so everything the dashboard did — a GPS fix, a list
// reload, a socket message — redrew the whole sheet, and every keystroke in
// it redrew the dashboard: the room scrolled, stuck, freed up, stuck again.
// Patching each cause one by one never held; a screen of its own can't be
// redrawn by the dashboard at all.

/** Rooms on the stack now, by job (each screen says while mounted). A count,
 * not one id: a second room can sit over the first, and closing it mustn't
 * forget the one underneath. */
const openRooms = new Map<string, number>();

/** The room screen, mounting: returns its unmount. */
export function markServiceRoomOpen(jobId: string): () => void {
  openRooms.set(jobId, (openRooms.get(jobId) ?? 0) + 1);
  return () => {
    const n = (openRooms.get(jobId) ?? 1) - 1;
    if (n <= 0) openRooms.delete(jobId);
    else openRooms.set(jobId, n);
  };
}

/** A room for this job is open (on the stack, maybe under the current screen). */
export function isServiceRoomOpen(jobId: string): boolean {
  return openRooms.has(jobId);
}

/** `replaceCurrent`: a screen that's done once the room opens (the map after
 * "Arrived") — the room takes its place, so Back goes to where the provider
 * came from (job details), not to the map again. */
export function openServiceRoom(jobId: string, options?: { replaceCurrent?: boolean }): void {
  const href = { pathname: '/service-room', params: { jobId } } as any;
  if (openRooms.has(jobId)) {
    // Already open under this screen (the map, a chat): back to it rather
    // than a second copy of the same room on top.
    router.dismissTo(href);
    return;
  }
  if (options?.replaceCurrent) router.replace(href);
  else router.push(href);
}

// ── What happened in the room, for the dashboard ───────────────────────────
// The dashboard keeps the provider's job lock, the GPS streaming for the job
// underway and the rating sheet; it hears here when a job moved on.

export type RoomEvent =
  /** Done: the dashboard asks for the customer's rating. */
  | { type: 'completed'; jobId: string }
  /** Over without finishing — cancelled, refused, the customer not there, disputed. */
  | { type: 'ended'; jobId: string }
  /** On the way: their trip is followed from now. */
  | { type: 'set_off'; jobId: string }
  /** Still going, at a new step (started, inspecting, invoiced, collected). */
  | { type: 'changed'; jobId: string; status: string };

type RoomListener = (event: RoomEvent) => void;
const roomListeners = new Set<RoomListener>();

export function emitRoomEvent(event: RoomEvent): void {
  roomListeners.forEach((l) => l(event));
}

export function onRoomEvent(listener: RoomListener): () => void {
  roomListeners.add(listener);
  return () => { roomListeners.delete(listener); };
}

/** A tab of the dashboard (Profile's verification, say) from a screen over
 * it: back to the dashboard that's open, then the tab — pushing the tab's
 * path from outside built a second dashboard. From inside the dashboard, the
 * tab switch is all there is to do. */
export function openDashboardTab(href: { pathname: string; params?: Record<string, string> }): void {
  router.dismissTo('/(tabs)' as any);
  // Once the screens over the dashboard are gone, the tab's path is a tab
  // switch, not a new dashboard.
  setTimeout(() => router.push(href as any), 250);
}
