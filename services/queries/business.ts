import { useQuery } from '@tanstack/react-query';
import { SkoFyApi } from '@/services/api';
import { qk } from './keys';

/** The US states, from the server — fixed, so read once and kept for the session. */
export function useUsStates() {
  return useQuery({
    queryKey: qk.reference.usStates,
    queryFn: () => SkoFyApi.business.usStates(),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
