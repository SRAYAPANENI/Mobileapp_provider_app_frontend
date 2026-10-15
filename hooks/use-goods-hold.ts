import { useEffect, useState } from 'react';

import { SkoFyApi } from '@/services/api';

/** Buy it for me: whether the customer's shopping money is held yet. Polls
 * while `active` (before pickup), since the customer pays it after hiring. */
export function useGoodsHoldHeld(jobId: string | undefined, active: boolean): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    setHeld(false);
    if (!jobId || !active) return;
    let cancelled = false;
    const check = async () => {
      const result = await SkoFyApi.payments.getStatus(jobId, 'GOODS_ADVANCE').catch(() => null);
      if (!cancelled) setHeld(result?.status === 'HELD');
      if (!cancelled && result?.status !== 'HELD') timer = setTimeout(check, 5000);
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    check();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [jobId, active]);

  return held;
}
