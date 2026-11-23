import { TeamActiveJob, TeamPosition } from './api';

// The team map's arrangement for any number of people (app/business-map.tsx):
// one pin per person however many jobs they're on, people too close to tell
// apart gathered into one numbered bubble, and those at the very same spot
// (two on one job) fanned out round it. Pure: positions in, what to draw out.

export interface MemberPin {
  worker: string;
  /** Their job shown on the pin — the one picked in the list, else the first. */
  position: TeamPosition;
  /** How many jobs of theirs are on the map. */
  jobs: number;
}

export interface Placed { pin: MemberPin; x: number; y: number }
export interface Bubble { key: string; x: number; y: number; pins: MemberPin[] }

/** Closer than this on the screen (px), pins cover each other. */
const TOUCHING = 46;
/** Closer than this on the ground (about 30 m), no zoom parts them. */
const SAME_SPOT_DEG = 0.0003;
/** Zoomed in this far, they're fanned out rather than gathered. */
const CLOSE_UP = 0.004;

export function onePerMember(positions: TeamPosition[], focusedJob: string | null): MemberPin[] {
  const byWorker = new Map<string, TeamPosition[]>();
  for (const p of positions) byWorker.set(p.worker_id, [...(byWorker.get(p.worker_id) ?? []), p]);
  return [...byWorker.entries()].map(([worker, list]) => ({
    worker, jobs: list.length, position: list.find((p) => p.job_id === focusedJob) ?? list[0],
  }));
}

export function arrange(
  pins: MemberPin[], at: (lat: number, lng: number) => { x: number; y: number },
  width: number, height: number, latitudeDelta: number,
): { placed: Placed[]; bubbles: Bubble[] } {
  const groups: { x: number; y: number; items: Placed[] }[] = [];
  for (const pin of pins) {
    const { x, y } = at(pin.position.lat, pin.position.lng);
    // Off the screen: nothing to draw.
    if (x < -160 || y < -80 || x > width + 160 || y > height + 80) continue;
    const near = groups.find((g) => Math.hypot(g.x - x, g.y - y) < TOUCHING);
    if (near) near.items.push({ pin, x, y });
    else groups.push({ x, y, items: [{ pin, x, y }] });
  }
  const placed: Placed[] = [];
  const bubbles: Bubble[] = [];
  for (const g of groups) {
    if (g.items.length === 1) { placed.push(g.items[0]); continue; }
    const lats = g.items.map((i) => i.pin.position.lat);
    const lngs = g.items.map((i) => i.pin.position.lng);
    const spread = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs));
    if (spread < SAME_SPOT_DEG ? latitudeDelta < 0.05 : latitudeDelta < CLOSE_UP) {
      const r = Math.max(34, (g.items.length * 54) / (2 * Math.PI));
      g.items.forEach((item, n) => {
        const angle = (2 * Math.PI * n) / g.items.length - Math.PI / 2;
        placed.push({ pin: item.pin, x: g.x + r * Math.cos(angle), y: g.y + r * Math.sin(angle) });
      });
    } else {
      bubbles.push({ key: g.items.map((i) => i.pin.worker).join('-'), x: g.x, y: g.y, pins: g.items.map((i) => i.pin) });
    }
  }
  return { placed, bubbles };
}

/** People working whose place isn't on the map: online, at their own place,
 * or no position yet — listed with the rest so nobody working is missed. */
export function workingElsewhere(active: TeamActiveJob[], positions: TeamPosition[]): TeamActiveJob[] {
  const shown = new Set(positions.map((p) => p.job_id));
  return active.filter((j) => j.worker_id && !shown.has(j.job_id)
    && ['INSPECTING', 'INVOICE_PENDING', 'IN_PROGRESS'].includes(j.status));
}

export function whereElse(j: TeamActiveJob): string {
  return j.venue === 'ONLINE' ? 'Online' : j.venue === 'PROVIDER_PLACE' ? 'At their own place' : 'No location yet';
}
