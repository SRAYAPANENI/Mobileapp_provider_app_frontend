import { useMutation, useQuery } from '@tanstack/react-query';
import { SkoFyApi } from '@/services/api';
import { qk } from './keys';

// The provider's jobs: active, finished, and those still to rate.
// Errors aren't turned into empty lists — "no jobs" must mean no jobs.

const asList = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** `pollMs`: refresh every so often while the screen is in view (Home). */
export function useActiveJobs<T = any>(pollMs: number | false = false) {
  return useQuery({
    queryKey: qk.jobs.active, queryFn: async () => asList<T>(await SkoFyApi.jobs.getActive()), refetchInterval: pollMs,
  });
}

/** Jobs offered to this provider — the Home feed. */
export function useInboundJobs<T = any>(pollMs: number | false = false) {
  return useQuery({
    queryKey: qk.jobs.inbound, queryFn: async () => asList<T>(await SkoFyApi.jobs.getInbound()), refetchInterval: pollMs,
  });
}

export function useJobHistory<T = any>() {
  return useQuery({ queryKey: qk.jobs.history, queryFn: async () => asList<T>(await SkoFyApi.jobs.getHistory()) });
}

/** Finished jobs whose customer still needs a rating: job id → customer name. */
export function usePendingRatings() {
  return useQuery({
    queryKey: qk.jobs.pendingRatings,
    queryFn: async () => Object.fromEntries(
      asList<{ job_id: string; counterpart_name: string }>(await SkoFyApi.jobs.pendingRatings())
        .map((p) => [p.job_id, p.counterpart_name])) as Record<string, string>,
  });
}

/** The job lists refresh by themselves after it (services/queries/invalidate.ts). */
export function useMarkComplete() {
  return useMutation({ mutationFn: (jobId: string) => SkoFyApi.jobs.markComplete(jobId) });
}
