import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hosting, HostingPrefs, ProviderRate, SkoFyApi } from '@/services/api';
import { qk } from './keys';

// The provider's own data: profile, skills, rate card and hosting.

// As the server sends it (ProviderSkillResponse).
export interface MySkill { skill_id: string; name: string; profession: string; is_verified: boolean; skill_o_meter: number; pricing?: string | null }

const profileQuery = { queryKey: qk.provider.profile, queryFn: () => SkoFyApi.provider.getProfile() as Promise<any> };

export function useProviderProfile() {
  return useQuery(profileQuery);
}

/** Read fresh now, and share it: a screen not yet on the data layer (Profile)
 * keeps the cache — and every screen showing it — up to date. */
export const fetchProviderProfile = (client: QueryClient) => client.fetchQuery({ ...profileQuery, staleTime: 0 });

const skillsQuery = {
  queryKey: qk.provider.skills,
  queryFn: async () => {
    const list = await SkoFyApi.skills.getMySkills();
    return (Array.isArray(list) ? (list as MySkill[]) : []).sort((a, b) => a.name.localeCompare(b.name));
  },
};

export function useMySkills() {
  return useQuery(skillsQuery);
}

export const fetchMySkills = (client: QueryClient) => client.fetchQuery({ ...skillsQuery, staleTime: 0 });

/** The skills this provider wants job notifications for (empty: all). */
export function useJobAlerts() {
  return useQuery({
    queryKey: qk.provider.jobAlerts,
    queryFn: async () => (await SkoFyApi.skills.getJobAlerts())?.skill_ids ?? [],
  });
}

export function useHosting() {
  return useQuery({ queryKey: qk.provider.hosting, queryFn: () => SkoFyApi.hosting.mine() });
}

/** The visiting fee and hourly rate for ordinary visits — both together. */
export function useSaveUsualRates() {
  return useMutation({
    // The profile refreshes by itself after the write (services/queries/invalidate.ts).
    mutationFn: ({ fee, hourly }: { fee: number; hourly: number }) => SkoFyApi.provider.setRates(fee, hourly),
  });
}

export type PriceChange = { unit: ProviderRate['unit']; amount: number | null };

/** A skill's prices: each changed one at once (each is its own row), then
 * the rate card is read back once. Rejects with the first failure, after
 * the rest have gone through. */
export function useSaveSkillPrices() {
  return useMutation({
    mutationFn: async ({ skillId, changes }: { skillId: string; changes: PriceChange[] }) => {
      const results = await Promise.allSettled(changes.map(({ unit, amount }) => amount == null
        ? SkoFyApi.hosting.removeRate(skillId, unit)
        : SkoFyApi.hosting.setRate(skillId, unit, amount)));
      const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed) throw failed.reason;
    },
    // Done or not, the card on file is read back by itself after the writes
    // (services/queries/invalidate.ts): some may have gone through.
  });
}

export function useSaveHosting() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      hosts_at_home: boolean; host_capacity: number; base_address: string | null;
      base_lat: number | null; base_lng: number | null; hosting_prefs: HostingPrefs;
    }) => SkoFyApi.hosting.update(body),
    onSuccess: (hosting: Hosting) => client.setQueryData(qk.provider.hosting, hosting),
  });
}
