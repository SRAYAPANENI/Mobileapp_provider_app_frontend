import { BusinessBoard, BusinessInvite, MyBusiness, SkoFyApi, TeamOpenJob } from '@/services/api';
import { onAppConfigChanged } from '@/services/app-config-socket';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

export interface MyBusinessState {
  data: MyBusiness | null;
  invites: BusinessInvite[];
  /** Open and under-way jobs — only for an owner or dispatcher of an approved business. */
  board: BusinessBoard | null;
  /** May apply for jobs as the business and give them to members. */
  canDispatch: boolean;
  /** The open job the team can take, if this is one. */
  teamJob: (jobId: string) => TeamOpenJob | undefined;
  refresh: () => void;
}

// Where someone stands with a business (docs/BUSINESS_PROVIDERS_DESIGN.md),
// refreshed whenever the screen using it comes into view — the home card,
// the feed's "for your team" badge and job details' "Apply as" all read it.
export function useMyBusiness(): MyBusinessState {
  const [data, setData] = useState<MyBusiness | null>(null);
  const [invites, setInvites] = useState<BusinessInvite[]>([]);
  const [board, setBoard] = useState<BusinessBoard | null>(null);

  const refresh = useCallback(() => {
    return SkoFyApi.business.mine().then((next) => {
      setData(next);
      if (!next.enabled) return;
      SkoFyApi.business.invites().then(setInvites).catch(() => setInvites([]));
      if (dispatches(next)) SkoFyApi.business.board().then(setBoard).catch(() => setBoard(null));
      else setBoard(null);
    }).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  // The admin's "Business providers" module toggle (BusinessService.mine's
  // module_on) only shows up here on the next screen focus otherwise — this
  // hook predates the app-config WS push and never had a poll of its own,
  // unlike useAppConfig. Same live reach now, not a second mechanism.
  useEffect(() => onAppConfigChanged(refresh), [refresh]);

  return {
    data, invites, board,
    canDispatch: !!data && dispatches(data),
    teamJob: (jobId) => board?.open.find((j) => j.job_id === jobId),
    refresh,
  };
}

function dispatches(b: MyBusiness): boolean {
  return b.enabled && b.business?.status === 'APPROVED' && (b.role === 'OWNER' || b.role === 'DISPATCHER');
}
