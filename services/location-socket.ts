import { API_BASE_URL } from './api-config';
import { TokenStore } from './api';

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

export async function connectLocationSocket(jobId: string): Promise<void> {
  if (_jobId === jobId && _socket?.readyState === WebSocket.OPEN) return;
  _jobId = jobId;
  _reconnectDelay = 1000;
  await _connect();
}

export function disconnectLocationSocket(): void {
  _jobId = null;
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (_socket) { _socket.close(); _socket = null; }
  _reconnectDelay = 1000;
}

async function _connect(): Promise<void> {
  if (!_jobId) return;
  const token = await TokenStore.getAccessToken();
  if (!token) return;

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
    if (!_jobId) return;
    // Exponential backoff: 1s → 2s → 4s … 30s max
    _reconnectTimer = setTimeout(() => {
      _reconnectDelay = Math.min(_reconnectDelay * 2, 30000);
      _connect();
    }, _reconnectDelay);
  };

  ws.onerror = () => {
    // onclose fires right after onerror — reconnect logic lives there
  };
}
