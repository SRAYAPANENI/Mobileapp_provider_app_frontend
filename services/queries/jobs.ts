import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { SkoFyApi } from '@/services/api';
import { qk } from './keys';

// The provider's jobs: active, finished, and those still to rate.
// Errors aren't turned into empty lists — "no jobs" must mean no jobs.

const asList = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** `pollMs`: refresh every so often while the screen is in view (Home).
 * `enabled`: false skips the fetch entirely — for a caller that mounts
 * before it's known whether there's a session to fetch for (maintenance-gate.tsx).
 * `refetchOnFocus`: false skips the refresh on coming back to the app — for
 * a screen covered by something that must not be redrawn under (Home's Service Room). */
export function useActiveJobs<T = any>(pollMs: number | false = false, enabled = true, refetchOnFocus = true) {
  return useQuery({
    queryKey: qk.jobs.active, queryFn: async () => asList<T>(await SkoFyApi.jobs.getActive()), refetchInterval: pollMs, enabled,
    refetchOnWindowFocus: refetchOnFocus,
  });
}

/** Jobs read per page of the Home feed. */
export const INBOUND_PAGE_SIZE = 20;

/**
 * Jobs offered to this provider — the Home feed — narrowed to one skill or
 * not, read a page at a time: the server used to send only the newest 20,
 * and a skill filter on the phone could only ever search those.
 *
 * A refresh (the poll, coming back) reads every page shown again, in order,
 * each starting after the fresh one before it — so new jobs arriving can't
 * push older ones into a gap between pages.
 *
 * `jobs`: every page read, in order (undefined until the first arrives).
 */
export function useInboundFeed<T extends { job_id?: string; id?: string; created_at: string }>(
  pollMs: number | false, refetchOnFocus: boolean, skillId: string | null,
) {
  const query = useInfiniteQuery({
    queryKey: qk.jobs.inboundFeed(skillId),
    queryFn: async ({ pageParam }) => asList<T>(await SkoFyApi.jobs.getInbound({
      skillId, limit: INBOUND_PAGE_SIZE, after: pageParam,
    })),
    initialPageParam: undefined as { created_at: string; id: string } | undefined,
    getNextPageParam: (last) => {
      if (last.length < INBOUND_PAGE_SIZE) return undefined;
      const job = last[last.length - 1];
      return { created_at: job.created_at, id: String(job.job_id ?? job.id) };
    },
    refetchInterval: pollMs,
    refetchOnWindowFocus: refetchOnFocus,
  });
  const jobs = useMemo(() => {
    if (!query.data) return undefined;
    const seen = new Set<string>();
    return query.data.pages.flat().filter(j => {
      const id = String(j.job_id ?? j.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [query.data]);
  return { jobs, query };
}

/** The feed counted, in all and per skill (its filter chips). */
export function useInboundSkillCounts(pollMs: number | false, refetchOnFocus: boolean) {
  return useQuery({
    queryKey: qk.jobs.inboundCounts,
    queryFn: () => SkoFyApi.jobs.getInboundSkillCounts(),
    refetchInterval: pollMs,
    refetchOnWindowFocus: refetchOnFocus,
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
