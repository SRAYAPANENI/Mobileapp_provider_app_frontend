import { QueryClient, useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hosting, HostingPrefs, ProviderRate, SkoFyApi } from '@/services/api';
import { qk } from './keys';
import { writeDashboardCache } from '@/services/homeCache';

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

/** Online or offline — what the provider chose, kept by the server (no one
 * else turns it off; closing the account does). One write for Home and
 * Profile, applied to the profile everyone reads at once:
 *   - a profile reload already on its way is stopped first — finishing after
 *     the tap, it put the old value back ("it went off by itself");
 *   - the cached copy shown on the next opening is updated too — it kept the
 *     old value, shown until the server answered;
 *   - not saved: put back, and the screen says so (it used to flip back with
 *     no word). */
const AVAILABILITY_KEY = ['provider', 'availability'] as const;

export function useSetAvailability() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: AVAILABILITY_KEY,
    mutationFn: (next: boolean) => SkoFyApi.provider.setAvailability(next),
    onMutate: async (next: boolean) => {
      await client.cancelQueries({ queryKey: qk.provider.profile });
      const before = client.getQueryData<any>(qk.provider.profile);
      if (before) client.setQueryData(qk.provider.profile, { ...before, is_available: next });
      void writeDashboardCache({ isAvailable: next });
      return { before };
    },
    onError: (_err, next, ctx) => {
      // Only the online value goes back — not the rest of the profile as it
      // was at the tap, which would undo anything that changed since.
      const was: boolean = typeof ctx?.before?.is_available === 'boolean' ? ctx.before.is_available : !next;
      client.setQueryData<any>(qk.provider.profile, (now: any) => (now ? { ...now, is_available: was } : now));
      void writeDashboardCache({ isAvailable: was });
    },
    // Saved: the value again, over any reload that landed meanwhile; then the
    // profile is read back (services/queries/invalidate.ts) — now after it.
    onSuccess: (res: any, next) => {
      // The server answers with the profile as it now is: taken as it is.
      if (res && typeof res.is_available === 'boolean') {
        client.setQueryData(qk.provider.profile, res);
        return;
      }
      client.setQueryData<any>(qk.provider.profile, (now: any) => (now ? { ...now, is_available: next } : now));
    },
  });
}

/** Online or not, as both screens show it: while a change is saving, the
 * value being saved — whatever a profile reload says meanwhile (one could
 * start after the tap, e.g. going online sends a location at once, and land
 * the old value: the switch flipped back). Otherwise the profile's.
 * undefined until known. */
export function useAvailability(): { value: boolean | undefined; saving: boolean } {
  const profile = useProviderProfile();
  const pending = useMutationState({
    filters: { mutationKey: AVAILABILITY_KEY, status: 'pending' },
    select: (m) => m.state.variables as boolean,
  });
  const saving = pending.length > 0;
  const value = saving ? pending[pending.length - 1] : (profile.data as any)?.is_available;
  return { value: typeof value === 'boolean' ? value : undefined, saving };
}

/** The visiting fee and hourly rate for ordinary visits — both together. */
export function useSaveUsualRates() {
  return useMutation({
    // The profile refreshes by itself after the write (services/queries/invalidate.ts).
    mutationFn: ({ fee, hourly }: { fee: number; hourly: number | null }) => SkoFyApi.provider.setRates(fee, hourly),
  });
}

export type PriceChange = { unit: ProviderRate['unit']; amount: number | null };

/** A skill's prices: each changed one at once (each is its own row), then
 * the rate card is read back once. Rejects with the first failure, after
 * the rest have gone through. */
export function useSaveSkillPrices() {
  return useMutation({
    mutationFn: async ({ skillId, changes }: { skillId: string; changes: PriceChange[] }) => {
      const send = ({ unit, amount }: PriceChange) => (amount == null
        ? SkoFyApi.hosting.removeRate(skillId, unit)
        : SkoFyApi.hosting.setRate(skillId, unit, amount));
      // The usual price per mile first: a car-trunk or van price per mile is
      // checked against it, and sent alongside it, the server could check
      // against the old one ("can't be below your usual $2" just after
      // lowering it to $1.50).
      const first = changes.filter((c) => c.unit === 'TRIP_MILE');
      const firstResults = await Promise.allSettled(first.map(send));
      const results = [...firstResults, ...await Promise.allSettled(changes.filter((c) => c.unit !== 'TRIP_MILE').map(send))];
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
