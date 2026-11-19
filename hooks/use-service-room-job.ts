import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { showDialog } from '@/components/alert-host';
import { SkoFyApi } from '@/services/api';
import { emitRoomEvent } from '@/services/service-room';

// The Service Room's job: read on opening, then watched while it's moving.
// Everything the room shows and decides comes from this one read of the job
// (JobResponse) — not the dashboard's list, which only caught up on its own
// next reload (and is no longer drawn under the room at all).

/** The job as the room's pieces want it (services/pickupDelivery's JobLike). */
export interface RoomJob {
  id: string;
  title: string;
  description: string;
  status: string;
  jobKind: string;
  serviceMode: string;
  businessName: string | null;
  latitude: number | null;
  longitude: number | null;
  dropoffLatitude: number | null;
  dropoffLongitude: number | null;
  customer: {
    name: string;
    image: string | null;
    avgPaymentRating: number | null;
    reviewCount: number;
  };
}

export function toRoomJob(d: any): RoomJob {
  return {
    id: String(d.id),
    title: d.title ?? 'Job',
    description: d.description ?? '',
    status: d.status,
    jobKind: d.job_type ?? 'STANDARD',
    serviceMode: d.service_mode ?? 'ON_SITE',
    businessName: d.business_name ?? null,
    latitude: d.lat ?? null,
    longitude: d.lng ?? null,
    dropoffLatitude: d.dropoff_lat ?? null,
    dropoffLongitude: d.dropoff_lng ?? null,
    customer: {
      name: d.customer_name || 'Customer',
      image: d.customer_profile_image ?? null,
      avgPaymentRating: d.customer_avg_payment_rating ?? null,
      reviewCount: d.customer_review_count ?? 0,
    },
  };
}

/** Still the provider's to work on (the active list's statuses). Watched the
 * whole time: the customer can act at any step — accept, counter, pay, cancel,
 * answer added work, give the drop-off code, mark it done — and asking is
 * cheap (a few bytes unless something changed). It used to stop once the
 * work was underway, so a customer finishing it went unseen. */
const ACTIVE = ['ACCEPTED', 'INSPECTING', 'INVOICE_PENDING', 'IN_PROGRESS', 'DISPUTED'];

const WATCH_EVERY_MS = 3000;
const FULL_EVERY_MS = 30_000;

/** Said as it happened (server: app/domain/cancellation.py CancelCause) — a
 * refusal, a no-show or the provider's own cancel are not "the customer cancelled". */
function tellCancelled(detail: any): void {
  const cause: string | undefined = detail.cancel_cause;
  if (cause === 'PICKUP_REFUSED') {
    showDialog('Item Refused', 'The job is cancelled and your trip fee is kept. Thanks for checking.', undefined, { type: 'success' });
  } else if (cause === 'CUSTOMER_NO_SHOW') {
    showDialog('Job Cancelled', "The customer wasn't there — the visiting fee is yours.", undefined, { type: 'success' });
  } else if (cause === 'NO_SHOW') {
    showDialog('Job Cancelled', "This job was cancelled because you hadn't set off in time.", undefined, { type: 'warning' });
  } else if (cause === 'PROVIDER') {
    showDialog('Job Cancelled', 'This job was cancelled.', undefined, { type: 'warning' });
  } else {
    showDialog(
      'Job Cancelled',
      detail.cancellation_reason ? `The customer cancelled this job. Reason: ${detail.cancellation_reason}` : 'The customer cancelled this job.',
      undefined,
      { type: 'warning' },
    );
  }
}

export function useServiceRoomJob(jobId: string | undefined) {
  const [detail, setDetailState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  /** Couldn't be read at all (gone, not this provider's, offline on opening). */
  const [failed, setFailed] = useState(false);
  /** Over while the room was open (cancelled elsewhere): the screen closes. */
  const [ended, setEnded] = useState(false);
  const lastSeenRef = useRef('');
  const statusRef = useRef<string | undefined>(undefined);

  /** A fresh read applied: redraws only when something actually changed. */
  const apply = useCallback((next: any) => {
    if (!next) return;
    const seen = JSON.stringify(next);
    if (seen === lastSeenRef.current) return;
    lastSeenRef.current = seen;
    const before = statusRef.current;
    statusRef.current = next.status;
    setDetailState(next);
    if (!jobId || before === undefined || before === next.status) return;
    // Moved on while open — said once, here, whoever moved it.
    if (next.status === 'CANCELLED') {
      tellCancelled(next);
      emitRoomEvent({ type: 'ended', jobId });
      setEnded(true);
    } else if (next.status === 'COMPLETED') {
      // Finished from the customer's side: the dashboard asks for the rating
      // (that sheet says it's done — a dialog as well stacked two popups).
      emitRoomEvent({ type: 'completed', jobId });
      setEnded(true);
    } else if (next.status === 'DISPUTED') {
      // Under review: not active work any more, but the room says so and stays.
      emitRoomEvent({ type: 'ended', jobId });
    } else {
      emitRoomEvent({ type: 'changed', jobId, status: next.status });
    }
  }, [jobId]);

  /** The job as the server has it now — after a step, a report, a code. */
  const refresh = useCallback(async () => {
    if (!jobId) return null;
    const next = await SkoFyApi.jobs.get(jobId).catch(() => null);
    apply(next);
    return next;
  }, [jobId, apply]);

  /** Set from a step's own answer (no read needed). */
  const setDetail = useCallback((next: any) => apply(next), [apply]);

  // First read — again on "Try again" when it failed (offline on opening).
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    if (!jobId) { setLoading(false); setFailed(true); return; }
    let cancelled = false;
    setLoading(true);
    SkoFyApi.jobs.get(jobId)
      .then((d) => { if (!cancelled) { apply(d); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [jobId, apply, attempt]);

  // Watched while it's active. Every 3 s the job's stamp — a few
  // bytes — and the whole job only when it changed, plus every 30 s anyway
  // (server: JobRepository.change_stamp). One request at a time; none while
  // the app is in the background.
  const watched = ACTIVE.includes(detail?.status);
  useEffect(() => {
    if (!jobId || !watched) return;
    let cancelled = false;
    let inFlight = false;
    let lastStamp = '';
    let lastFullAt = Date.now();
    const poll = async () => {
      if (inFlight || AppState.currentState !== 'active') return;
      inFlight = true;
      try {
        const stamp = await SkoFyApi.jobs.stamp(jobId).then((r) => r?.stamp ?? null).catch(() => null);
        if (cancelled) return;
        const due = Date.now() - lastFullAt >= FULL_EVERY_MS;
        if (stamp !== null && stamp === lastStamp && !due) return;
        const next = await SkoFyApi.jobs.get(jobId);
        if (stamp !== null) lastStamp = stamp;
        lastFullAt = Date.now();
        if (!cancelled) apply(next);
      } catch {
        // A blip: keep showing the last known job.
      } finally {
        inFlight = false;
      }
    };
    const interval = setInterval(poll, WATCH_EVERY_MS);
    // Back from the background (another app, the camera): look at once.
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void poll(); });
    return () => { cancelled = true; clearInterval(interval); sub.remove(); };
  }, [jobId, watched, apply]);

  const job = detail ? toRoomJob(detail) : null;
  const active = !!detail && ACTIVE.includes(detail.status);
  return { job, detail, loading, failed, ended, active, refresh, setDetail, retry };
}
