import { SkoFyApi } from './api';

export interface PendingRating {
  job_id: string;
  title: string;
  /** The customer the provider is rating. */
  counterpart_name: string;
  status: string;
}

// Ratings answered during this app session — skipped with "Maybe later" or
// submitted. Kept in memory on purpose: a skipped rating comes back the next
// time the app is opened (until it's submitted), but answering it on one
// screen must stop every other screen asking again straight away.
const handledThisSession = new Set<string>();

export function markRatingSkipped(jobId: string) {
  handledThisSession.add(jobId);
}

export function markRatingSubmitted(jobId: string) {
  handledThisSession.add(jobId);
}

/** The server already has this rating: done, not a failure. */
export function alreadyRated(err: unknown): boolean {
  const e = err as { error_code?: string; message?: string } | null;
  return e?.error_code === 'CONFLICT' || /already submitted/i.test(e?.message ?? '');
}

export function isRatingSkipped(jobId: string): boolean {
  return handledThisSession.has(jobId);
}

/** The newest finished job (completed or disputed) the provider still owes
 *  the customer a rating for and hasn't skipped this session — or null.
 *  Never throws: a reminder failing to load must not break the screen. */
export async function nextPendingRating(): Promise<PendingRating | null> {
  try {
    const pending = await SkoFyApi.jobs.pendingRatings();
    return pending.find(p => !isRatingSkipped(p.job_id)) ?? null;
  } catch {
    return null;
  }
}
