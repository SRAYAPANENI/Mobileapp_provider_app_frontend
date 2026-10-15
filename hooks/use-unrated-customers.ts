import { useCallback, useState } from 'react';

import { SkoFyApi } from '@/services/api';

/** Finished jobs whose customer this provider hasn't rated yet: job id →
 * customer name. Popups ask once; lists use this so the rating can always
 * be given later. */
export function useUnratedCustomers() {
  const [unrated, setUnrated] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    const pending = await SkoFyApi.jobs.pendingRatings().catch(() => []);
    setUnrated(Object.fromEntries((Array.isArray(pending) ? pending : []).map(p => [p.job_id, p.counterpart_name])));
  }, []);

  const markRated = useCallback((jobId: string) => {
    setUnrated(prev => { const next = { ...prev }; delete next[jobId]; return next; });
  }, []);

  return { unrated, reload, markRated };
}
