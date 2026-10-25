import { MapPin, Package, Phone, Receipt, XCircle, type LucideIcon } from 'lucide-react-native';

/** A job event the server writes into the chat (message_type SYSTEM), as JSON. */
export interface ChatEvent {
  event?: string;
  duration_seconds?: number;
  connected?: boolean;
  reason?: string;
  outcome?: string;
  amount?: number;
}

/** Whose eyes: the one it happened by (`mine`), the other side, or someone
 * watching — a business owner following their team's job. */
export interface EventViewer {
  mine: boolean;
  /** The other person, for the two people on the job. */
  otherName: string;
  /** Watching rather than taking part: say who did it by name. */
  observer?: boolean;
  /** Who sent it — for an observer. */
  actorName?: string;
}

export interface ChatEventView {
  label: string;
  Icon: LucideIcon;
}

export function parseChatEvent(message: string): ChatEvent {
  try {
    return JSON.parse(message) ?? {};
  } catch {
    return {};
  }
}

export function formatCallLogDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const usd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Every event the server writes into a job's chat, in words, from where the
// reader stands. One place, so the chat and a business owner's view of the
// same job always say the same thing.
export function describeChatEvent(log: ChatEvent, who: EventViewer): ChatEventView {
  const other = who.otherName || 'them';
  const actor = who.actorName || 'Your team member';
  // "You did it" / "<other> did it" / "<actor> did it".
  const did = (verb: string) => (who.observer ? `${actor} ${verb}` : who.mine ? `You ${verb}` : `${other} ${verb}`);
  const why = log.reason ? `: ${log.reason}` : '';

  switch (log.event) {
    case 'call': {
      // One per call; the sender is the caller.
      if (log.outcome === 'completed') return { Icon: Phone, label: `Voice call · ${formatCallLogDuration(log.duration_seconds ?? 0)}` };
      if (who.observer) return { Icon: Phone, label: 'Missed call' };
      if (log.outcome === 'declined') return { Icon: Phone, label: who.mine ? `${other} declined your call` : `You declined a call from ${other}` };
      if (log.outcome === 'busy') return { Icon: Phone, label: who.mine ? `${other} was on another call` : `Missed call from ${other}` };
      if (log.outcome === 'cancelled') return { Icon: Phone, label: who.mine ? 'Call cancelled' : `Missed call from ${other}` };
      return { Icon: Phone, label: who.mine ? `${other} didn't answer` : `Missed call from ${other}` };
    }
    case 'call_started':
      return { Icon: Phone, label: who.observer ? `${actor} called` : who.mine ? `You called ${other}` : `${other} called you` };
    case 'call_ended':
      return { Icon: Phone, label: log.connected ? `Voice call · ${formatCallLogDuration(log.duration_seconds ?? 0)}` : who.observer ? 'Missed call' : `Missed call from ${other}` };
    case 'job_started':
      return { Icon: MapPin, label: did('arrived and started the job') };
    case 'inspection_started':
      return { Icon: MapPin, label: did('started the inspection') };
    case 'inspection_report':
      return { Icon: MapPin, label: did('sent the inspection report') };
    case 'inspection_not_done':
      return { Icon: XCircle, label: who.observer ? "The customer says the inspection isn't finished yet" : `${other} says the inspection isn't finished yet` };
    case 'invoice_raised':
      return { Icon: Receipt, label: log.amount != null ? did(`sent a quote: ${usd(log.amount)}`) : did('sent a quote') };
    case 'pickup_confirmed':
      return { Icon: Package, label: did('picked up the item') };
    case 'pickup_refused':
      return { Icon: XCircle, label: `${who.observer ? `${actor} didn't` : who.mine ? "You didn't" : `${other} didn't`} take the item${log.reason ? ` (${log.reason.toLowerCase()})` : ''} — the job is cancelled` };
    case 'delivered':
      return { Icon: Package, label: did('delivered the item') };
    case 'job_cancelled':
      return { Icon: XCircle, label: did(`cancelled the job${why}`) };
    case 'job_reopened':
      return { Icon: XCircle, label: `${did('cancelled')} — other applicants are still available${why}` };
    case 'customer_absent':
      return { Icon: XCircle, label: who.observer ? "The customer wasn't there — the job is cancelled"
        : "You waited and the customer wasn't there — the job is cancelled and the visiting fee is yours" };
    case 'provider_absent':
      return { Icon: XCircle, label: who.observer ? "The customer reported nobody came — the job is cancelled"
        : "The customer reported you weren't there — the job is cancelled" };
    default:
      // A call record from before calls had an event name.
      if (log.duration_seconds != null || log.connected != null || log.outcome != null) {
        return describeChatEvent({ ...log, event: log.outcome ? 'call' : 'call_ended' }, who);
      }
      return { Icon: MapPin, label: 'Job update' };
  }
}
