// Single source of truth for the backend URL.
// Both api.ts and background-location.ts import from here — update ngrok
// in exactly one place instead of two.

// Your machine's LAN IP for physical device testing — phone must be on the
// same WiFi as this machine. Must match the customer app's DEV_LAN_IP.
const DEV_LAN_IP = '192.168.1.6';
// const DEV_URL = `http://${DEV_LAN_IP}:8000/v1`;

// TEMPORARY ngrok tunnel — lets a release APK reach the local backend over
// mobile data/any network, not just the same WiFi as DEV_LAN_IP.
// Previous accounts' URLs — each hit its monthly bandwidth cap (ERR_NGROK_725):
// const NGROK_URL = 'https://underrate-snowfield-chemist.ngrok-free.dev/v1';
// const NGROK_URL = 'https://lavender-strife-monopoly.ngrok-free.dev/v1';
const NGROK_URL = 'https://dill-unstirred-amply.ngrok-free.dev/v1';
// Dodorez API on AWS (Mumbai) — see skofy-backend/deploy/README.md.
// No laptop or ngrok tunnel needed. Switch back to NGROK_URL to test
// against a local backend. Must match the customer app's BASE_URL.
const AWS_URL = 'https://16-4-28-180.sslip.io/v1';
export const API_BASE_URL = AWS_URL;
