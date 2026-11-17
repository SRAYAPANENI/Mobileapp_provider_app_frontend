import { GOOGLE_PLACES_API_KEY } from '@/services/google-places';
import { RouteFollower, type LatLng, type Progress } from '@/services/route';
import { useEffect, useRef, useState } from 'react';

/** The road between two points as `from` moves — what's left of it, with
 * its distance and time — or null while there's none (not asked yet, no
 * route allowed on the key, offline). Never a straight line: a map draws
 * the road or nothing. When to ask Google again, and dropping an answer for
 * an older destination, is the follower's (services/route.ts). */
export function useRoadRoute(from: LatLng | null | undefined, to: LatLng | null | undefined): Progress | null {
  const [left, setLeft] = useState<Progress | null>(null);
  const followerRef = useRef<RouteFollower | null>(null);
  if (!followerRef.current) followerRef.current = new RouteFollower(GOOGLE_PLACES_API_KEY);

  useEffect(() => () => followerRef.current?.stop(), []);

  useEffect(() => {
    if (!from || !to) {
      followerRef.current!.stop();
      setLeft(null);
      return;
    }
    followerRef.current!.follow(from, to, (p) => setLeft(p.road ? p : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.latitude, from?.longitude, to?.latitude, to?.longitude]);

  return left;
}
