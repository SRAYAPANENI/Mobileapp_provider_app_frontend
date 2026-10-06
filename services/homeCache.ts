/**
 * Dashboard cache — lets a reopen show the last known job list instantly
 * instead of the "Loading jobs..." spinner while a fresh fetch runs. A
 * plain JSON file via expo-file-system's File/Directory/Paths API (added
 * specifically for this — the app had no local-storage library beyond
 * expo-secure-store, which is encrypted keychain/keystore storage meant for
 * small secrets like tokens and has a practical size limit well under what
 * a handful of full job objects would need).
 *
 * Deliberately narrow: only the fields (tabs)/index.tsx actually needs to
 * paint a convincing first frame. Not a general-purpose cache — if another
 * screen needs this pattern, it gets its own small cache file the same way,
 * not a shared abstraction built ahead of a second real use case.
 *
 * NOTE: expo-file-system is a native module — this requires a fresh dev
 * client / EAS build before it works on a device that already has an older
 * build installed; a plain JS bundle reload is not enough.
 */
import { File, Paths } from 'expo-file-system';
import { SkoFyApi, TokenStore } from './api';

// Lazily constructed, not at module scope — this module is imported from
// the SPLASH screen (for prefetch), which runs before anything else. If
// expo-file-system's native module isn't linked into whatever build is
// currently installed (true the moment this dependency is added to the
// app until the next dev-client/EAS rebuild — a plain JS reload doesn't
// pick up a new native module), constructing a File at import time throws
// synchronously and crashes the entire bundle evaluation before React
// renders anything — including the splash screen itself. A caching
// nicety must never be able to take down app launch; deferring this
// until first actual use (already inside a try/catch below) means a
// missing native module just makes the cache silently a no-op instead.
let cacheFile: File | null | undefined;

function getCacheFile(): File | null {
  if (cacheFile === undefined) {
    try {
      cacheFile = new File(Paths.document, 'dashboard_cache.json');
    } catch {
      cacheFile = null;
    }
  }
  return cacheFile;
}

// Cached data is only ever a bridge to the real fetch, which always runs
// right behind it — this just bounds how stale that bridge can be if the
// real fetch is unusually slow or fails outright.
const MAX_CACHE_AGE_MS = 30 * 60 * 1000; // 30 minutes

export interface DashboardCacheData {
  userName?: string;
  profileImageUrl?: string | null;
  isAvailable?: boolean;
  jobs?: unknown[];
}

// Stamped on every write, checked on every read — this file lives on the
// DEVICE, not scoped to any one account. Logging out and a different
// provider logging in on the same device (or, concretely, a dev database
// getting wiped and the same phone number re-registering as a brand-new
// account) left a stale file on disk with no idea the underlying account
// had changed. Without this check, the new account's very first app open
// rendered the PREVIOUS account's name/photo/availability/jobs instantly
// from cache, correct-looking long enough to be genuinely confusing,
// before any live fetch had a chance to correct it.
interface StoredDashboardCache extends DashboardCacheData {
  cachedAt: number;
  userId: string;
}

async function getCurrentUserId(): Promise<string | null> {
  const user = await TokenStore.getUser();
  return user?.user_id ?? null;
}

export async function readDashboardCache(): Promise<DashboardCacheData | null> {
  try {
    const file = getCacheFile();
    if (!file || !file.exists) return null;
    const raw = await file.text();
    const data: StoredDashboardCache = JSON.parse(raw);
    if (!data.cachedAt || Date.now() - data.cachedAt > MAX_CACHE_AGE_MS) return null;
    const currentUserId = await getCurrentUserId();
    if (!currentUserId || data.userId !== currentUserId) return null;
    return data;
  } catch {
    // A corrupt/unreadable cache file is never worse than no cache — the
    // live fetch this is only ever a bridge to still runs regardless.
    return null;
  }
}

// Logout and session-expiry (see services/api.ts's setSessionExpiredHandler)
// both call this directly too, as defense in depth on top of the userId
// check above — belt and suspenders, since the check above only protects
// reads that happen to run after TokenStore already reflects the new
// account, and a stale pre-expiry access token can briefly still look
// valid to the app before a live request actually gets rejected.
export async function clearDashboardCache(): Promise<void> {
  try {
    const file = getCacheFile();
    if (file?.exists) file.delete();
  } catch {
    // Best-effort — worst case a stale file lingers until the userId
    // check above catches it on the next read.
  }
}

// Merges with whatever's already cached rather than overwriting wholesale —
// the profile fetch and the jobs fetch land independently; without
// merging, whichever finished last would wipe out fields the other wrote.
//
// That merge is only actually safe serialized. (tabs)/index.tsx's own
// profile-fetch handler fires three of these back to back in the same
// tick (userName, isAvailable, profileImageUrl) — unserialized, each
// would read the same pre-write snapshot and overwrite the others'
// result, guaranteed to drop at least one field on every load that has
// all three. Chaining every call onto a single module-level queue forces
// each write's read-merge-write to see the previous one's result instead
// of racing it.
let writeQueue: Promise<void> = Promise.resolve();

export function writeDashboardCache(partial: DashboardCacheData): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    try {
      const file = getCacheFile();
      if (!file) return;
      const currentUserId = await getCurrentUserId();
      if (!currentUserId) return; // never persist data with no known owner
      // readDashboardCache() already discards anything stamped with a
      // DIFFERENT userId, so a fresh account's first write correctly starts
      // from nothing instead of merging its fields on top of whoever used
      // this device last.
      const existing = await readDashboardCache();
      const merged: StoredDashboardCache = { ...existing, ...partial, userId: currentUserId, cachedAt: Date.now() };
      file.write(JSON.stringify(merged));
    } catch {
      // Best-effort — a failed cache write shouldn't surface anywhere or
      // interrupt the caller; next successful write simply catches up.
    }
  });
  return writeQueue;
}

// Called from the splash screen the moment a stored session is confirmed —
// fire-and-forget, never awaited by navigation. Prefetches the provider's
// own profile (name/avatar/availability) — the jobs list itself stays
// (tabs)/index.tsx's own concern since loadJobs() already does real work
// (feasibility scoring against the provider's other bookings) that doesn't
// belong duplicated in the splash screen.
export async function prefetchDashboardEssentials(): Promise<void> {
  try {
    const profile: any = await SkoFyApi.provider.getProfile().catch(() => null);
    if (!profile) return;
    const partial: DashboardCacheData = {};
    if (profile.name) partial.userName = profile.name;
    if (profile.profile_image_url) partial.profileImageUrl = profile.profile_image_url;
    if (typeof profile.is_available === 'boolean') partial.isAvailable = profile.is_available;
    if (Object.keys(partial).length > 0) await writeDashboardCache(partial);
  } catch {
    // Purely a head start for the next cache read — (tabs)/index.tsx's own
    // fetches are the real source of truth and run regardless of this.
  }
}
