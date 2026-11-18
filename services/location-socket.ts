import { API_BASE_URL } from './api-config';
import { getFreshAccessToken } from './api';

// Convert https://host/v1 → wss://host/v1
const WS_BASE = API_BASE_URL
  .replace(/^https:\/\//, 'wss://')
  .replace(/^http:\/\//, 'ws://');

let _socket: WebSocket | null = null;
let _jobId: string | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _reconnectDelay = 1000; // ms, doubles on each failure up to 30s

export function isLocationSocketOpen(): boolean {
  return _socket?.readyState === WebSocket.OPEN;
}

export function sendLocationViaSocket(lat: number, lng: number, speed?: number | null, heading?: number | null): boolean {
  if (_socket?.readyState !== WebSocket.OPEN) return false;
  const msg: Record<string, unknown> = { type: 'location', lat, lng };
  if (speed != null && speed >= 0) msg.speed = speed;
  if (heading != null && heading >= 0) msg.heading = heading;
  _socket.send(JSON.stringify(msg));
  return true;
}

/** What's left of the trip as this phone has it — the customer's phone shows
 * exactly these, so both say the same miles and minutes (backend ws.py
 * relays them). Only for the job the socket is open for. */
export interface TripFigures {
  eta_min: number;
  distance_mi: number;
  dest_lat: number;
  dest_lng: number;
  /** The road, when it's new (or now and then for a customer who just opened
   * the map): Google's encoding, and Google's time for all of it. */
  route?: string;
  route_mins?: number;
}

export function sendTripViaSocket(jobId: string, trip: TripFigures): boolean {
  if (_jobId !== jobId || _socket?.readyState !== WebSocket.OPEN) return false;
  _socket.send(JSON.stringify({ type: 'trip', ...trip }));
  return true;
}

export async function connectLocationSocket(jobId: string): Promise<void> {
  if (_jobId === jobId && _socket?.readyState === WebSocket.OPEN) return;
  _jobId = jobId;
  _reconnectDelay = 1000;
  // A retry still pending (for this job or the last) would open a second one.
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  await _connect();
}

export function disconnectLocationSocket(): void {
  _jobId = null;
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (_socket) { _socket.close(); _socket = null; }
  _reconnectDelay = 1000;
}

// Tried again with the same back-off as a dropped connection: 1s → 30s max.
function _scheduleReconnect(): void {
  if (!_jobId) return;
  if (_reconnectTimer) clearTimeout(_reconnectTimer);
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    _reconnectDelay = Math.min(_reconnectDelay * 2, 30000);
    void _connect();
  }, _reconnectDelay);
}

async function _connect(): Promise<void> {
  if (!_jobId) return;
  let token: string | null;
  try {
    token = await getFreshAccessToken();
  } catch {
    // The token couldn't be read (phone locked since a restart): tried again
    // shortly. Giving up here ended live tracking for the rest of the trip.
    _scheduleReconnect();
    return;
  }
  // None: signed out — nothing to send the location as.
  if (!token || !_jobId) return;

  // A prior socket can still be open or mid-handshake if this fires again
  // before that one settled (e.g. the active-job effect re-running) —
  // close it and strip its handlers first, otherwise it's silently
  // leaked (never closed, no longer referenced by _socket below) and its
  // own onclose could schedule a stray reconnect on top of this one.
  if (_socket) {
    const stale = _socket;
    stale.onopen = null;
    stale.onclose = null;
    stale.onerror = null;
    stale.close();
  }

  const url = `${WS_BASE}/ws/jobs/${_jobId}`;
  const ws = new WebSocket(url);
  _socket = ws;

  ws.onopen = () => {
    // Must be the first message — the server holds the connection
    // unauthenticated until this arrives (see ws.py).
    ws.send(JSON.stringify({ type: 'auth', token }));
    _reconnectDelay = 1000;
  };

  ws.onclose = () => {
    if (_socket === ws) _socket = null;
    _scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose fires right after onerror — reconnect logic lives there
  };
}
