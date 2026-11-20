import { queryClient } from '@/services/query-client';
import { qk } from './keys';

// A write changes some cached reads: after any successful write through the
// API, those are refreshed — for every screen, on the data layer or not, so
// one screen's change shows on the others (docs/APP_DATA_ARCHITECTURE.md).
const AFFECTS: { prefix: string; keys: readonly (readonly string[])[] }[] = [
  { prefix: '/providers/me', keys: [qk.provider.all] },
  { prefix: '/skills', keys: [qk.provider.all] },
  { prefix: '/hosting', keys: [qk.provider.hosting] },
  { prefix: '/jobs', keys: [qk.jobs.all] },
  { prefix: '/businesses', keys: [qk.jobs.all] },
];

// Writes that change nothing a screen reads back: the GPS position, sent
// every few seconds while online or on a job — each one reloaded the whole
// profile, and a reload landing in the middle of going online put the old
// "offline" back on the switch.
const NO_READ_BACK = ['/providers/me/location'];

export function afterWrite(endpoint: string, method: string | undefined) {
  if (!method || method.toUpperCase() === 'GET') return;
  const path = endpoint.split('?')[0];
  if (NO_READ_BACK.includes(path)) return;
  for (const { prefix, keys } of AFFECTS) {
    if (path.startsWith(prefix)) keys.forEach((queryKey) => { queryClient.invalidateQueries({ queryKey }); });
  }
}
