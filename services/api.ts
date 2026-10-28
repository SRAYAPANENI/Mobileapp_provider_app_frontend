/**
 * Dodorez Pro — API Client
 *
 * Real HTTP calls to the FastAPI backend.
 * - Tokens stored securely via expo-secure-store
 * - Bearer token auto-attached to every authenticated request
 * - Auto-refreshes access token on 401
 * - Consistent error format matches backend: { success, error_code, message }
 *
 * BASE_URL:
 *   Local dev on emulator  → http://10.0.2.2:8000/v1   (Android emulator localhost)
 *   Local dev on simulator → http://localhost:8000/v1   (iOS simulator)
 *   Physical device        → http://<YOUR_LAN_IP>:8000/v1  ← update DEV_LAN_IP below
 *   Production             → https://api.skofy.com/v1
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { File, Paths } from 'expo-file-system';
import { API_BASE_URL } from './api-config';

// ─── CONFIG ─────────────────────────────────────────────────────────────────
// URL is defined once in api-config.ts — background-location.ts imports the
// same constant so both always stay in sync.
const BASE_URL = API_BASE_URL;

// ─── TOKEN STORAGE ───────────────────────────────────────────────────────────
const TOKEN_KEY = 'skofy_access_token';
const REFRESH_KEY = 'skofy_refresh_token';
const USER_KEY = 'skofy_user';

export const TokenStore = {
  async setTokens(access: string, refresh: string) {
    await SecureStore.setItemAsync(TOKEN_KEY, access);
    await SecureStore.setItemAsync(REFRESH_KEY, refresh);
  },
  async getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_KEY);
  },
  async setUser(user: AuthUser) {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  },
  async getUser(): Promise<AuthUser | null> {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  async clear() {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  },
};

// ─── STALE SESSION ON REINSTALL ──────────────────────────────────────────────
// iOS Keychain (what SecureStore is backed by) is explicitly NOT cleared when
// an app is deleted — standard platform behavior, not a bug here. Android's
// auto-backup can similarly restore SecureStore's encrypted prefs across a
// reinstall. Either way, a token issued to a before-uninstall install can
// still be sitting in SecureStore after a fresh install, read back by the
// splash screen as "logged in", and then rejected by the backend a moment
// later (session_version mismatch / revoked refresh token) as a "Signed Out"
// the user never actually triggered. The document directory, unlike
// SecureStore/Keychain, IS wiped on uninstall on both platforms, so the
// absence of this marker file is a reliable "this is a fresh install" signal
// regardless of platform-specific token-persistence quirks.
let installMarkerFile: File | null | undefined;
function getInstallMarkerFile(): File | null {
  if (installMarkerFile === undefined) {
    try {
      installMarkerFile = new File(Paths.document, 'install_marker.txt');
    } catch {
      installMarkerFile = null;
    }
  }
  return installMarkerFile;
}

export async function clearStaleSessionAfterReinstall(): Promise<void> {
  try {
    const marker = getInstallMarkerFile();
    if (!marker || marker.exists) return;
    await TokenStore.clear();
    marker.write('1');
  } catch {
    // Best-effort — worst case a stale session survives one extra launch
    // and gets caught by the normal "Signed Out" rejection instead.
  }
}

// ─── TYPES ───────────────────────────────────────────────────────────────────
export interface AuthUser {
  user_id: string;
  role: 'provider';
  is_new_user: boolean;
  // True whenever this phone's Provider profile was just created — true for
  // a brand-new account, but ALSO true for an existing account (registered
  // as a Customer) that's now getting a Provider profile added for the
  // first time (dual-role support, same identity/phone). Screens deciding
  // whether to route into profile-completion should key off this, not
  // is_new_user — is_new_user alone can't distinguish those two cases.
  is_new_role: boolean;
  profile_complete: boolean;
  /** Logging in just cancelled a deletion they'd asked for. */
  account_restored?: boolean;
}

export interface ApiError {
  success: false;
  error_code: string;
  message: string;
  details: Record<string, any>;
}

export interface HCIScore {
  overall: number;
  confidence: number;
  dimensions: {
    trust: number;
    skill: number;
    reliability: number;
    efficiency: number;
    emotional_intelligence: number;
    adaptability: number;
    network_capital: number;
    learning_velocity: number;
    civic_signal: number;
  };
  band: 'LEGENDARY' | 'MASTER' | 'EXPERT' | 'PROFICIENT' | 'DEVELOPING';
}

// ─── CORE REQUEST ────────────────────────────────────────────────────────────
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;
let _onSessionExpired: (() => void) | null = null;
// A screen that fires several parallel fetches on mount can 401 all of them
// at once — _refreshAccessToken() itself is deduped (isRefreshing/
// refreshPromise), but every one of those callers still independently hits
// this same fallback once the shared refresh comes back empty, each firing
// _onSessionExpired?.() again. Harmless when that was just a silent
// router.replace(), but it now also shows an Alert — and Alert.alert() calls
// stack instead of no-op, so a burst of these could show the "Signed Out"
// message 2-3 times in a row. Reset the moment any request next succeeds
// (the user logged back in and is making happy-path calls again), so a
// later, genuinely new session-death still surfaces the alert.
let sessionExpiredNotified = false;

export function setSessionExpiredHandler(fn: () => void): void {
  _onSessionExpired = fn;
}

// fetch has no timeout of its own: on a dead connection a call can hang for
// minutes with the button spinning. Every call gets a limit; uploads (photos,
// videos) get a longer one.
const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;

async function timedFetch(url: string, init: RequestInit, ms = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw {
      success: false,
      error_code: controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: controller.signal.aborted
        ? 'This is taking too long. Please check your connection and try again.'
        : "Couldn't reach the server. Please check your connection and try again.",
    } as ApiError;
  } finally {
    clearTimeout(timer);
  }
}

async function request<T = any>(
  endpoint: string,
  options: RequestInit & { skipAuth?: boolean } = {}
): Promise<T> {
  const { skipAuth = false, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
    ...((fetchOptions.headers as Record<string, string>) || {}),
  };

  if (!skipAuth) {
    const token = await TokenStore.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  // A photo sent inside the JSON (ID proof, profile picture) is an upload too.
  const limit = typeof fetchOptions.body === 'string' && fetchOptions.body.length > 200_000
    ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  const response = await timedFetch(`${BASE_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  }, limit);

  // Auto-refresh on 401
  if (response.status === 401 && !skipAuth) {
    const newToken = await _refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      const retried = await timedFetch(`${BASE_URL}${endpoint}`, { ...fetchOptions, headers }, limit);
      return _parseResponse<T>(retried);
    }
    // Refresh failed → clear tokens and force back to login
    await TokenStore.clear();
    if (!sessionExpiredNotified) {
      sessionExpiredNotified = true;
      _onSessionExpired?.();
    }
    throw { success: false, error_code: 'SESSION_EXPIRED', message: 'Please log in again.' } as ApiError;
  }

  if (response.ok) {
    sessionExpiredNotified = false;
  }

  return _parseResponse<T>(response);
}

async function _parseResponse<T>(response: Response): Promise<T> {
  let json: any;
  try {
    json = await response.json();
  } catch {
    // The server didn't return valid JSON at all — most often a proxy/
    // tunnel's own error page (e.g. ngrok's branded HTML page when the
    // tunnel is down or over its bandwidth cap) instead of our API's JSON
    // error shape. Unguarded, response.json() throws a raw SyntaxError
    // ("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON") straight
    // into whatever alert the caller shows — exactly the kind of internals
    // leaking into the UI this was meant to stop.
    throw {
      success: false,
      error_code: 'INVALID_RESPONSE',
      message: "Couldn't reach the server. Please check your connection and try again.",
    } as ApiError;
  }
  if (!response.ok) {
    throw json as ApiError;
  }
  // Backend wraps all responses in { success: true, data: ... }
  return json.data !== undefined ? json.data : json;
}

/**
 * Multipart file upload — used for video proofs, which are too large to
 * practically send as base64-encoded JSON. Do NOT set Content-Type manually;
 * fetch sets the multipart boundary automatically when given a FormData body.
 */
async function requestMultipart<T = any>(endpoint: string, formData: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const token = await TokenStore.getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await timedFetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: formData,
  }, UPLOAD_TIMEOUT_MS);

  if (response.status === 401) {
    const newToken = await _refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      const retried = await timedFetch(`${BASE_URL}${endpoint}`, { method: 'POST', headers, body: formData }, UPLOAD_TIMEOUT_MS);
      return _parseResponse<T>(retried);
    }
    await TokenStore.clear();
    throw { success: false, error_code: 'SESSION_EXPIRED', message: 'Please log in again.' } as ApiError;
  }

  return _parseResponse<T>(response);
}

async function _refreshAccessToken(): Promise<string | null> {
  if (isRefreshing) return refreshPromise;
  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const refreshToken = await TokenStore.getRefreshToken();
      if (!refreshToken) return null;
      const response = await timedFetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      // Only a refusal ends the session. A server error (a 502 mid-deploy)
      // says nothing about the token, so it's thrown as "couldn't reach the
      // server" and the user stays signed in.
      if (response.status >= 500) {
        throw {
          success: false,
          error_code: 'NETWORK_ERROR',
          message: "Couldn't reach the server. Please check your connection and try again.",
        } as ApiError;
      }
      if (!response.ok) return null;
      const json = await response.json();
      const newToken: string = json.data?.access_token;
      // The backend now rotates the refresh token on every use (consumes
      // the one just presented, issues a fresh one) — this MUST be stored
      // in place of the old one, or the next refresh attempt replays an
      // already-rotated-away token, which the backend now treats as a
      // stolen-token signal and revokes every session for this role.
      const newRefreshToken: string | undefined = json.data?.refresh_token;
      if (newToken) {
        await SecureStore.setItemAsync(TOKEN_KEY, newToken);
      }
      if (newRefreshToken) {
        await SecureStore.setItemAsync(REFRESH_KEY, newRefreshToken);
      }
      return newToken ?? null;
    } catch (err: any) {
      // No answer (offline, timed out) isn't a refusal either: keep the tokens.
      if (err?.error_code === 'TIMEOUT' || err?.error_code === 'NETWORK_ERROR') throw err;
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

// ─── TOKEN FOR LIVE CONNECTIONS ──────────────────────────────────────────────
// request() refreshes on a 401, but a WebSocket gets no 401 — the server just
// closes it (4401) when the token in the auth message has expired (access
// tokens live 15 minutes). Screens that opened their socket with the stored,
// expired token silently lost live chat and calls: offers were never
// delivered and nothing rang. Every socket gets its token from here.
export async function getFreshAccessToken(): Promise<string | null> {
  const token = await TokenStore.getAccessToken();
  if (token && !_expiresWithin(token, 60)) return token;
  // Offline: hand back the stored token; the socket just retries later.
  return (await _refreshAccessToken().catch(() => null)) ?? token;
}

function _expiresWithin(token: string, seconds: number): boolean {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')));
    return typeof exp !== 'number' || exp * 1000 - Date.now() < seconds * 1000;
  } catch {
    return true;
  }
}

// ─── API SURFACE ─────────────────────────────────────────────────────────────
/** A voice call on a support ticket (backend: app/services/support_call_service.py). */
/** A customer who wants you on a schedule (§13). */
export interface Series {
  id: string; title: string; customer_name: string | null; provider_name: string | null;
  cadence: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'; next_at: string;
  status: 'PROPOSED' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'DECLINED';
}

/** A customer's guarantee claim on your work (§12). */
export interface GuaranteeClaim {
  id: string; job_id: string; job_title: string; description: string; photo_urls: string[];
  status: 'OPEN' | 'FIX_OFFERED' | 'FIXED' | 'REFUNDED' | 'DECLINED';
  provider_responded_at: string | null; decision_note: string | null;
}

/** Your prices per hour / day / night, and hosting at your place
 * (docs/JOB_SHAPE_DESIGN.md phase 4). */
export interface ProviderRate { skill_id: string; skill_name: string; unit: 'HOUR' | 'DAY' | 'NIGHT' | 'VISIT' | 'FIXED'; amount: number }
export interface Hosting {
  hosts_at_home: boolean; host_capacity: number; base_address: string | null;
  base_lat: number | null; base_lng: number | null; rates: ProviderRate[];
}

/** The hand-over photos and every update, for a pet or home in your care. */
export interface CareRecord {
  handover_at: string | null;
  handover_photos: { url: string; taken_at: string }[];
  updates: { id: string; note: string | null; photo_urls: string[]; created_at: string }[];
}

/** A business provider (docs/BUSINESS_PROVIDERS_DESIGN.md). */
export type BusinessStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
export type BusinessDocumentKind = 'GENERAL_LIABILITY' | 'WORKERS_COMP' | 'LICENCE';
export interface BusinessDocument {
  id: string; kind: BusinessDocumentKind; file_url: string; issuer: string | null; number: string | null;
  coverage_limit: number | null; trade: string | null; issuing_state: string | null; expires_on: string | null;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED'; review_note: string | null;
}
export interface Business {
  id: string; name: string; legal_name: string; entity_type: 'LLC' | 'CORPORATION' | 'PARTNERSHIP' | 'SOLE_PROPRIETOR';
  state: string; email: string | null; phone: string | null; status: BusinessStatus;
  /** Whether its members may also work for themselves. */
  allow_independent_work: boolean;
  review_note: string | null; connect_onboarding_status: string;
  documents: BusinessDocument[]; ready_for_on_site_work: boolean; missing: string[];
}
export interface MyBusiness {
  enabled: boolean; business: Business | null; role: 'OWNER' | 'DISPATCHER' | 'WORKER' | null;
  /** Two hats (§7): their own "Myself" switch, and whether it's in effect. */
  own_switch?: boolean; works_for_self?: boolean;
  /** Whether their business lets them work for themselves; null as its owner. */
  own_work_allowed?: boolean | null;
  /** Asked to leave: the day they go (sooner if released). */
  leave_at?: string | null;
  /** General liability required for on-site work, in dollars. */
  min_liability: number;
}
export interface BusinessProfileInput {
  name: string; legal_name: string; entity_type: Business['entity_type']; state: string; email?: string; phone?: string;
}
export type MemberRole = 'OWNER' | 'DISPATCHER' | 'WORKER';
export interface TeamMember {
  id: string; provider_id: string | null; name: string | null; phone: string | null; role: MemberRole;
  status: 'INVITED' | 'ACTIVE'; joined_at: string | null; is_identity_verified: boolean | null;
  /** Whether the business lets them also take jobs for themselves (§7). */
  own_work_allowed?: boolean;
  /** Asked to leave: the day they go. */
  leave_at?: string | null;
  background_check_status: 'NOT_STARTED' | 'PENDING' | 'CLEAR' | 'CONSIDER' | 'FAILED' | null;
}
export interface CheckCharge {
  id: string; name: string; amount: number; free: boolean; status: 'PENDING' | 'DUE' | 'DEDUCTED' | 'WAIVED'; created_at: string;
}
export interface Team { members: TeamMember[]; free_checks_left: number; check_cost: number; check_charges: CheckCharge[] }
export interface BusinessInvite {
  id: string; business_id: string; business_name: string; role: MemberRole; invited_by: string | null;
  /** The location notice to read and accept before joining. */
  notice: string;
  /** No clear background check yet: they authorise one (this disclosure) before joining. */
  needs_check: boolean; check_disclosure: string | null;
}
/** The business's jobs (docs/BUSINESS_PROVIDERS_DESIGN.md §3). */
export interface TeamOpenJob {
  job_id: string; title: string; description: string; urgency: string; scheduled_at: string | null; created_at: string;
  venue: string; pricing_unit: string; lat: number | null; lng: number | null;
  /** Members the job reached — the business can name anyone able to do it. */
  reached_member_ids: string[]; applied: boolean;
}
export interface TeamActiveJob {
  job_id: string; title: string; status: string; scheduled_at: string | null; hired_at: string | null;
  navigation_started_at: string | null; arrived_at: string | null; checked_in_at: string | null;
  worker_id: string | null; worker_name: string | null; customer_name: string | null;
}
export interface BusinessBoard { open: TeamOpenJob[]; active: TeamActiveJob[] }
export interface TeamPosition {
  job_id: string; title: string; status: string; worker_id: string; worker_name: string | null;
  lat: number; lng: number; heading: number | null; job_lat: number | null; job_lng: number | null;
}
export interface BusinessJobDetail {
  job_id: string; title: string; status: string; customer_id: string; customer_name: string | null;
  scheduled_at: string | null; worker_id: string | null; worker_name: string | null; address: string | null;
  timeline: { step: string; actor_role: string; actor_name: string | null; created_at: string; evidence: any }[];
}
export interface BusinessEarnings {
  total_earned: number; pending: number; jobs_paid_out: number; owed_to_dodorez: number;
  payouts: { job_id: string; job_title: string; purpose: string; provider_amount: number; recovered_amount: number;
    released_at: string; worker_name: string | null }[];
  /** Each member who earned this month has their own cap: monthly_cap = that cap × cap_seats. */
  fees: { month: string; fees_paid: number; monthly_cap: number; cap_seats?: number; rules?: { after_cap_percent: number } };
}
export interface BusinessDocumentInput {
  kind: BusinessDocumentKind; file: { uri: string; name: string; mimeType: string };
  issuer: string; number: string; coverage_limit?: string; trade?: string; issuing_state?: string; expires_on?: string;
}

/** Work asked to be added mid-job (§11). */
export interface ExtraWork {
  amount: number; description: string;
  status: 'PROPOSED' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN' | 'PAID';
}

/** A quote before it's sent (docs/MONEY_RULES_DESIGN.md §1–2). */
export interface QuotePreview {
  amount: number; visit_credit: number; customer_pays: number; fee: number; you_keep: number; max_deposit_percent: number;
}

/** A strike — for a provider, asking a customer to pay outside the app (§10). */
export interface StrikeView {
  id: string; reason: string; job_id: string | null; note: string; created_at: string; expires_at: string;
  active: boolean; appealed_at: string | null; revoked_at: string | null; revoke_note: string | null;
  can_appeal: boolean; cannot_appeal_reason: string | null;
}

export interface SupportCallView {
  id: string;
  ticket_id: string;
  subject: string | null;
  status: 'RINGING' | 'ACTIVE' | 'ENDED' | 'MISSED' | 'DECLINED' | 'CANCELLED';
  /** 'user' = this person called; 'agent' = support called them. */
  started_by: 'user' | 'agent';
  agent_name: string;
  answered_at: string | null;
  duration_seconds: number | null;
}

export interface SupportCallStatus {
  can_call: boolean;
  /** Why they can't call right now (closed, nobody has the ticket yet, agent away). */
  reason: string | null;
  agent_name: string | null;
  live_call: SupportCallView | null;
}

export interface RTCIceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Deleting the account (docs/ACCOUNT_DELETION_DESIGN.md). */
export interface AccountDeletionStatus {
  deletion_due_at: string | null;
  /** What has to be finished first — empty when it can be deleted now. */
  blockers: string[];
  grace_days: number;
}

export const SkoFyApi = {
  account: {
    deletionStatus: async (): Promise<AccountDeletionStatus> => request('/account/deletion') as any,
    /** Texts a code to the number they log in with. */
    sendDeletionCode: async (): Promise<{ sent_to: string; mock_otp?: string | null }> =>
      request('/account/deletion/code', { method: 'POST' }) as any,
    deleteAccount: async (code: string): Promise<{ deletion_due_at: string; message: string }> =>
      request('/account/deletion', { method: 'POST', body: JSON.stringify({ code }) }) as any,
  },

  // ── Auth ──────────────────────────────────────────────────────────────────
  auth: {
    /** Is this phone still the signed-in one? A 401 here runs the normal
     * "Signed Out" flow (the account signed in on another phone). */
    checkSession: async (): Promise<{ active: boolean }> => request('/auth/session'),
    /**
     * Send OTP to phone number.
     * In dev mode (OTP_MOCK_MODE=true on backend) returns mock_otp: "123456".
     */
    // purpose: the server sends a code only if this number is (login) or
    // isn't yet (register) registered in this app — NO_ACCOUNT,
    // OTHER_ROLE_ONLY or ALREADY_REGISTERED otherwise.
    // email (register only): checked with the phone before any code is sent.
    sendOTP: async (phone: string, purpose?: 'login' | 'register'): Promise<{ message: string; expires_in_seconds: number; mock_otp?: string }> => {
      const normalised = phone.startsWith('+') ? phone : `+${phone.replace(/[\s\-\(\)\.]/g, '')}`;
      return request('/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ phone: normalised, role: 'provider', purpose }),
        skipAuth: true,
      });
    },

    /** Register form: is this email free for me? Needs the signed-in session. */
    checkEmail: async (email: string): Promise<{ available: boolean }> =>
      request('/auth/email-check', { method: 'POST', body: JSON.stringify({ email }) }),

    /**
     * Verify OTP. Returns tokens + user info.
     * Automatically stores tokens and user in SecureStore.
     */
    verifyOTP: async (phone: string, otp: string): Promise<AuthUser> => {
      const normalised = phone.startsWith('+') ? phone : `+${phone.replace(/[\s\-\(\)\.]/g, '')}`;
      const data = await request<{
        tokens: { access_token: string; refresh_token: string };
        user_id: string;
        role: string;
        is_new_user: boolean;
        is_new_role: boolean;
        profile_complete: boolean;
        account_restored?: boolean;
      }>('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ phone: normalised, otp, role: 'provider' }),
        skipAuth: true,
      });
      // Defensive only — the backend already grants exactly the role
      // requested (or auto-adds a Provider profile to an existing
      // Customer-only account and returns 'provider' either way), so this
      // should never actually fire. Kept as a safety net in case the
      // contract ever changes.
      if (data.role !== 'provider') {
        throw { success: false, error_code: 'WRONG_APP', message: 'This number is registered as a Customer account. Please use the Dodorez Customer app.' } as ApiError;
      }
      await TokenStore.setTokens(data.tokens.access_token, data.tokens.refresh_token);
      const user: AuthUser = {
        user_id: data.user_id,
        role: 'provider',
        is_new_user: data.is_new_user,
        is_new_role: data.is_new_role,
        profile_complete: data.profile_complete,
        account_restored: !!data.account_restored,
      };
      await TokenStore.setUser(user);
      return user;
    },

    /** Set or update password for the logged-in provider. currentPassword is
     * required when actually changing an existing password (not needed for
     * first-time setup, e.g. right after registration). */
    /** A real password change revokes the calling session's own token
     * server-side (along with every other device's, as a security measure)
     * and returns a fresh pair in its place — stored here so the user isn't
     * immediately bounced to "Signed Out" by the very change they just made. */
    setPassword: async (password: string, currentPassword?: string) => {
      const data = await request<{
        message: string;
        tokens?: { access_token: string; refresh_token: string };
      }>('/auth/set-password', {
        method: 'POST',
        body: JSON.stringify({ password, current_password: currentPassword }),
      });
      if (data.tokens) {
        await TokenStore.setTokens(data.tokens.access_token, data.tokens.refresh_token);
      }
      return data;
    },

    /**
     * Forgot password, step 1 — separate from sendOTP (shared with login/
     * registration) because this one confirms an account exists before
     * sending anything, rather than silently allowing "no account yet"
     * the way first-time signup needs to.
     */
    sendResetOTP: async (phone: string): Promise<{ message: string; expires_in_seconds: number; mock_otp?: string }> => {
      const normalised = phone.startsWith('+1') ? phone : `+1${phone.replace(/[\s\-\(\)\.]/g, '')}`;
      return request('/auth/send-reset-otp', {
        method: 'POST',
        body: JSON.stringify({ phone: normalised, role: 'provider' }),
        skipAuth: true,
      });
    },

    /**
     * Forgot password, step 2: no auth required — the freshly-sent OTP
     * stands in for the current password. Send it with sendResetOTP
     * first, then submit the code and the new password together here.
     */
    resetPassword: async (phone: string, otp: string, newPassword: string) => {
      const normalised = phone.startsWith('+1') ? phone : `+1${phone.replace(/[\s\-\(\)\.]/g, '')}`;
      return request('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ phone: normalised, otp, role: 'provider', new_password: newPassword }),
        skipAuth: true,
      });
    },

    /** Login with phone number OR email + password. Stores tokens on success. */
    loginWithPassword: async (identifier: string, password: string): Promise<AuthUser> => {
      const isEmail = identifier.includes('@');
      const normalised = isEmail
        ? identifier.trim().toLowerCase()
        : (identifier.startsWith('+') ? identifier : `+${identifier.replace(/[\s\-\(\)\.]/g, '')}`);
      const data = await request<{
        tokens: { access_token: string; refresh_token: string };
        user_id: string;
        role: string;
        is_new_user: boolean;
        is_new_role: boolean;
        profile_complete: boolean;
        account_restored?: boolean;
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: normalised, password, role: 'provider' }),
        skipAuth: true,
      });
      if (data.role !== 'provider') {
        throw { success: false, error_code: 'WRONG_APP', message: 'This number is registered as a Customer account. Please use the Dodorez Customer app.' } as ApiError;
      }
      await TokenStore.setTokens(data.tokens.access_token, data.tokens.refresh_token);
      const user: AuthUser = {
        user_id: data.user_id,
        role: 'provider',
        is_new_user: data.is_new_user,
        is_new_role: data.is_new_role,
        profile_complete: data.profile_complete,
        account_restored: !!data.account_restored,
      };
      await TokenStore.setUser(user);
      return user;
    },

    /** Complete provider profile after first login. */
    updateProfile: async (data: {
      name: string;
      email?: string;
      bio?: string;
      years_experience?: number;
      city?: string;
      state?: string;
      zip_code?: string;
      lat?: number;
      lng?: number;
    }) => request('/auth/profile/provider', { method: 'POST', body: JSON.stringify(data) }),

    /** Register FCM push token for this device. */
    registerFCMToken: async (token: string, platform: 'IOS' | 'ANDROID') =>
      request('/auth/fcm-token', {
        method: 'POST',
        body: JSON.stringify({ token, platform }),
      }),

    /** fcmToken/voipToken: this device's own push token(s), so the backend
     * can delete exactly the rows this app instance registered — a
     * logged-out device that keeps its token registered keeps receiving
     * calls/notifications for the account indefinitely. Best-effort: if
     * fetching them fails, logout still proceeds. */
    logout: async (fcmToken?: string, voipToken?: string) => {
      try {
        await request('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ fcm_token: fcmToken, voip_token: voipToken }),
        });
      } finally {
        await TokenStore.clear();
      }
    },
  },

  // ── Provider Profile & Availability ────────────────────────────────────────
  provider: {
    getProfile: async () =>
      request('/providers/me'),

    updateProfile: async (data: {
      name?: string;
      email?: string;
      bio?: string;
      years_experience?: number;
      city?: string;
      id_number?: string;
    }) => request('/providers/me', { method: 'PATCH', body: JSON.stringify(data) }),

    setAvailability: async (isAvailable: boolean) =>
      request('/providers/me/availability', {
        method: 'PATCH',
        body: JSON.stringify({ is_available: isAvailable }),
      }),

    setRates: async (visitingFee: number, hourlyRate: number) =>
      request('/providers/me/rates', {
        method: 'PATCH',
        body: JSON.stringify({ visiting_fee: visitingFee, hourly_rate: hourlyRate }),
      }),

    suggestRates: async (): Promise<{
      visiting_fee: number;
      hourly_rate: number;
      based_on: 'market_average' | 'category_default';
      sample_size: number;
    }> => request('/providers/me/rates/suggest'),

    /** Customers who've booked this provider more than once, most-booked
     * first — Repeat Customers dashboard feature. */
    getRepeatCustomers: async (): Promise<Array<{
      customer_id: string;
      name: string;
      profile_image_url: string | null;
      avg_payment_rating: number | null;
      avg_behaviour_rating: number | null;
      avg_negotiation_rating: number | null;
      avg_environment_rating: number | null;
      jobs_with_you_count: number;
    }>> => request('/providers/me/repeat-customers'),

    /** This provider's full completed-job history with one specific repeat
     * customer, both review directions attached. */
    getCustomerJobHistory: async (customerId: string): Promise<Array<{
      job_id: string;
      title: string;
      completed_at: string | null;
      final_amount: number | null;
      review_overall_rating: number | null;
      review_skill_rating: number | null;
      review_punctuality_rating: number | null;
      review_behaviour_rating: number | null;
      review_communication_rating: number | null;
      review_comment: string | null;
      customer_review_overall_rating: number | null;
      customer_review_behaviour_rating: number | null;
      customer_review_negotiation_rating: number | null;
      customer_review_payment_rating: number | null;
      customer_review_environment_rating: number | null;
      customer_review_comment: string | null;
    }>> => request(`/providers/me/repeat-customers/${customerId}/jobs`),

    updateLocation: async (lat: number, lng: number) =>
      request('/providers/me/location', {
        method: 'PATCH',
        body: JSON.stringify({ lat, lng }),
      }),

    uploadProfileImage: async (base64: string, mimeType: string) =>
      request('/providers/me/profile-image', {
        method: 'POST',
        body: JSON.stringify({ image_base64: base64, mime_type: mimeType }),
      }),

    /** This month's fees against the cap, the rules, and any fixed plan (Fair Cap). */
    getFees: async (): Promise<{
      month: string; fees_paid: number; monthly_cap: number; remaining_before_free: number;
      fixed_plan: { to_month: string; monthly_price: number } | null; fixed_plan_price: number;
      rules: { first_rate_percent: number; above_rate_percent: number; band: number; job_cap: number; monthly_cap: number; after_cap_percent: number };
    }> => request('/fees/me'),

    /** A quote before it's sent: the visiting fee that counts toward it, what you keep, what may be paid at the start. */
    quotePreview: async (jobId: string, amount: number, partsTotal: number): Promise<QuotePreview> =>
      request(`/fees/me/quote-preview?job_id=${jobId}&amount=${amount}&parts_total=${partsTotal}`),

    /** "You'll keep $X" for an amount, with what's already been paid on the job and this month. */
    previewFee: async (amount: number, jobId?: string): Promise<{ amount: number; fee: number; you_keep: number }> =>
      request(`/fees/me/preview?amount=${amount}${jobId ? `&job_id=${jobId}` : ''}`),

    /** Your side of an open dispute, with photos. */
    addDisputeStatement: async (jobId: string, body: string, photos: { uri: string; mimeType: string }[]) => {
      const form = new FormData();
      form.append('body', body);
      photos.forEach((p, i) => {
        const ext = p.mimeType.split('/')[1] || 'jpg';
        form.append('photos', { uri: p.uri, name: `statement-${i}.${ext}`, type: p.mimeType } as any);
      });
      return requestMultipart(`/disputes/jobs/${jobId}/statements`, form);
    },

    getEarnings: async (): Promise<{
      total_earned: number;
      pending: number;
      jobs_paid_out: number;
      recent_payouts: Array<{
        job_id: string; job_title: string; amount: number; paid_at: string | null;
        purpose?: string | null; recovered?: number; arrives_by?: string | null;
      }>;
      /** Still owed toward a chargeback, taken from the next payouts (§12). */
      recovery_owed?: number;
      payout_days?: number;
    }> => request('/providers/me/earnings'),

    /** Stripe's own hosted Express dashboard — real bank details + payout history. */
    getConnectDashboardLink: async (): Promise<{ url: string }> =>
      request('/providers/me/connect-dashboard-link', { method: 'POST' }),

    /** Upload an ID proof, work proof, or skill proof image/video. */
    addDocument: async (data: {
      doc_type: 'ID_PROOF' | 'WORK_PROOF' | 'SKILL_PROOF' | 'TRADE_LICENSE';
      image_base64: string;
      mime_type: string;
      skill_name?: string;
      description?: string;
    }) => request('/providers/me/documents', { method: 'POST', body: JSON.stringify(data) }),

    getDocuments: async (docType?: 'ID_PROOF' | 'WORK_PROOF' | 'SKILL_PROOF' | 'TRADE_LICENSE'): Promise<Array<{
      id: string;
      doc_type: string;
      media_url: string;
      media_type: 'IMAGE' | 'VIDEO';
      skill_name?: string;
      description?: string;
      created_at: string;
    }>> => request(`/providers/me/documents${docType ? `?doc_type=${docType}` : ''}`),

    deleteDocument: async (docId: string) =>
      request(`/providers/me/documents/${docId}`, { method: 'DELETE' }),

    /**
     * Upload a document (typically a video proof) directly from a local file URI.
     * Use this instead of addDocument() when base64 isn't available (e.g. videos —
     * the image picker doesn't base64-encode video assets).
     */
    addDocumentFile: async (data: {
      fileUri: string;
      mimeType: string;
      doc_type: 'ID_PROOF' | 'WORK_PROOF' | 'SKILL_PROOF' | 'TRADE_LICENSE';
      skill_name?: string;
      description?: string;
    }) => {
      const form = new FormData();
      const ext = data.mimeType.split('/')[1] || 'mp4';
      form.append('file', { uri: data.fileUri, name: `upload.${ext}`, type: data.mimeType } as any);
      form.append('doc_type', data.doc_type);
      if (data.skill_name) form.append('skill_name', data.skill_name);
      if (data.description) form.append('description', data.description);
      return requestMultipart('/providers/me/documents/upload', form);
    },

    /** Add an availability time slot (date: YYYY-MM-DD, times: HH:MM 24h). */
    addSlot: async (data: { date: string; start_time: string; end_time: string }): Promise<{
      id: string; date: string; start_time: string; end_time: string;
    }> => request('/providers/me/slots', { method: 'POST', body: JSON.stringify(data) }),

    getSlots: async (): Promise<Array<{ id: string; date: string; start_time: string; end_time: string }>> =>
      request('/providers/me/slots'),

    deleteSlot: async (slotId: string) =>
      request(`/providers/me/slots/${slotId}`, { method: 'DELETE' }),

    /** Hosted Stripe Connect Express onboarding link — open with expo-web-browser. */
    getConnectOnboardingLink: async (): Promise<{ url: string }> =>
      request('/providers/me/connect-onboarding-link', { method: 'POST' }),

    getConnectStatus: async (): Promise<{
      connect_onboarding_status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'RESTRICTED';
      charges_enabled: boolean;
      payouts_enabled: boolean;
    }> => request('/providers/me/connect-status'),
  },

  // ── Skills (Provider can add skills and take tests) ──────────────────────
  skills: {
    professions: async (): Promise<string[]> => request('/skills/professions'),

    list: async (profession?: string) =>
      request(`/skills${profession ? `?profession=${encodeURIComponent(profession)}` : ''}`),

    getMySkills: async () =>
      request('/providers/me/skills'),

    /** Every skill's test status in one request: { [skill_id]: eligibility }. */
    getAllTestEligibility: async (): Promise<Record<string, any>> =>
      request('/skills/test/eligibility'),

    /** Skills the provider gets "New job" alerts for — [] = every job. */
    getJobAlerts: async (): Promise<{ skill_ids: string[] }> =>
      request('/providers/me/job-alerts'),

    setJobAlerts: async (skillIds: string[]): Promise<{ skill_ids: string[] }> =>
      request('/providers/me/job-alerts', {
        method: 'PUT',
        body: JSON.stringify({ skill_ids: skillIds }),
      }),

    addSkill: async (skillId: string) =>
      request('/providers/me/skills', {
        method: 'POST',
        body: JSON.stringify({ skill_id: skillId }),
      }),

    addSkillsByName: async (skills: { name: string; profession: string }[]) =>
      request('/providers/me/skills-by-name', {
        method: 'POST',
        body: JSON.stringify({ skills }),
      }),

    removeSkill: async (skillId: string) =>
      request(`/providers/me/skills/${skillId}`, { method: 'DELETE' }),

    // Gated on identity verification (DL/govt ID), not a skill test —
    // anyone can physically pick up and drop off; the risk being managed
    // is trust, not competency.
    setPickupDropoffEnabled: async (enabled: boolean) =>
      request('/providers/me/pickup-dropoff', {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }),

    /** Whether this provider can take a test for this skill right now. */
    getTestEligibility: async (skillId: string): Promise<{
      eligible: boolean;
      reason: string;
      jobs_completed: number;
      jobs_required: number;
      retry_after_minutes?: number | null;
    }> => request(`/skills/${skillId}/test/eligibility`),

    /**
     * Get the next skill test question from Claude AI.
     * Returns a question with multiple choice options.
     */
    getTestQuestion: async (skillId: string, sessionId?: string): Promise<{
      session_id: string;
      question_number: number;
      total_questions: number;
      question: string;
      options: string[];
      skill_area: string;
    }> => request(`/skills/${skillId}/test/question${sessionId ? `?session_id=${sessionId}` : ''}`),

    submitTestAnswer: async (skillId: string, sessionId: string, answer: string): Promise<{
      is_correct: boolean;
      explanation: string;
      session_complete: boolean;
      score?: number;
      passed?: boolean;
      // Present iff session_complete is false — lets the caller advance
      // straight to it without a second getTestQuestion round-trip.
      next_question?: {
        session_id: string;
        question_number: number;
        total_questions: number;
        question: string;
        options: string[];
        skill_area: string;
      };
    }> => request(`/skills/${skillId}/test/answer`, {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, answer }),
    }),
  },

  // ── Jobs (Provider view) ──────────────────────────────────────────────────
  jobs: {
    /**
     * Jobs that the Distribution Agent has sent to this provider.
     * These are inbound notifications awaiting a bid.
     */
    getInbound: async () =>
      request('/jobs/inbound'),

    getActive: async () =>
      request('/jobs/active'),

    getHistory: async (page = 1) =>
      request(`/jobs/history?page=${page}`),

    get: async (jobId: string) =>
      request(`/jobs/${jobId}`),

    /**
     * Apply to a distributed job. Bidding is retired — there's no fee to
     * propose anymore, price is only ever set by the post-inspection
     * invoice (see the inspection/invoice methods below).
     */
    bid: async (jobId: string, message?: string) =>
      request(`/jobs/${jobId}/bid`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      }),

    startNavigation: async (jobId: string) =>
      request(`/jobs/${jobId}/start-navigation`, { method: 'POST' }),

    /** @deprecated superseded by the OTP-gated inspection flow below. */
    markStarted: async (jobId: string, lat: number, lng: number) =>
      request(`/jobs/${jobId}/start`, {
        method: 'POST',
        body: JSON.stringify({ lat, lng }),
      }),

    // ── On-site inspection + invoice ────────────────────────────────────

    // ── Pickup & Drop: hand-over at the drop-off ─────────────────────────

    requestDeliveryCode: async (jobId: string) =>
      request(`/jobs/${jobId}/delivery/request-code`, { method: 'POST' }),

    verifyDeliveryCode: async (jobId: string, code: string, lat: number, lng: number) =>
      request(`/jobs/${jobId}/delivery/verify`, {
        method: 'POST',
        body: JSON.stringify({ otp: code, lat, lng }),
      }),

    requestInspectionOtp: async (jobId: string) =>
      request(`/jobs/${jobId}/inspection/request-otp`, { method: 'POST' }),

    verifyInspectionOtp: async (jobId: string, otp: string, lat: number, lng: number) =>
      request(`/jobs/${jobId}/inspection/verify-otp`, {
        method: 'POST',
        body: JSON.stringify({ otp, lat, lng }),
      }),

    /** @deprecated an older app's one-tap "done" — the fee is held for review. Use submitInspectionReport. */
    completeInspection: async (jobId: string) =>
      request(`/jobs/${jobId}/inspection/complete`, { method: 'POST' }),

    /** What you found, with photos taken in the app — the customer then
     * confirms it (docs/MONEY_RULES_DESIGN.md §4). */
    submitInspectionReport: async (
      jobId: string, findings: string, result: 'QUOTE' | 'NO_WORK', lat: number, lng: number,
      photos: { uri: string; mimeType: string }[],
    ) => {
      const form = new FormData();
      form.append('findings', findings);
      form.append('result', result);
      form.append('lat', String(lat));
      form.append('lng', String(lng));
      photos.forEach((p, i) => {
        const ext = p.mimeType.split('/')[1] || 'jpg';
        form.append('photos', { uri: p.uri, name: `inspection-${i}.${ext}`, type: p.mimeType } as any);
      });
      return requestMultipart(`/jobs/${jobId}/inspection/report`, form);
    },

    /** The code the customer reads out to confirm the inspection. */
    verifyInspectionEndCode: async (jobId: string, code: string) =>
      request(`/jobs/${jobId}/inspection/end-code`, { method: 'POST', body: JSON.stringify({ code }) }),

    /** "I'm here" — at the job, checked against its location (§3). */
    markArrived: async (jobId: string, lat: number, lng: number): Promise<{ arrived_at: string; can_report_absent_at: string | null }> =>
      request(`/jobs/${jobId}/arrived`, { method: 'POST', body: JSON.stringify({ lat, lng }) }),

    // ── Priced up front: check-in, hand-over and updates (phase 4) ───────

    /** The customer's screen shows a code; ask for it when they arrive. */
    requestCheckInCode: async (jobId: string) =>
      request(`/jobs/${jobId}/check-in/request-code`, { method: 'POST' }),

    checkIn: async (jobId: string, code: string, lat: number, lng: number) =>
      request(`/jobs/${jobId}/check-in`, { method: 'POST', body: JSON.stringify({ otp: code, lat, lng }) }),

    /** Photos of what's left in your care, as it was handed over. */
    handOver: async (jobId: string, lat: number, lng: number, photos: { uri: string; mimeType: string }[]) => {
      const form = new FormData();
      form.append('lat', String(lat));
      form.append('lng', String(lng));
      photos.forEach((p, i) => {
        const ext = p.mimeType.split('/')[1] || 'jpg';
        form.append('photos', { uri: p.uri, name: `handover-${i}.${ext}`, type: p.mimeType } as any);
      });
      return requestMultipart(`/jobs/${jobId}/hand-over`, form);
    },

    postCareUpdate: async (jobId: string, note: string, photos: { uri: string; mimeType: string }[]) => {
      const form = new FormData();
      if (note.trim()) form.append('note', note.trim());
      photos.forEach((p, i) => {
        const ext = p.mimeType.split('/')[1] || 'jpg';
        form.append('photos', { uri: p.uri, name: `update-${i}.${ext}`, type: p.mimeType } as any);
      });
      return requestMultipart(`/jobs/${jobId}/care-updates`, form);
    },

    careRecord: async (jobId: string): Promise<CareRecord> => request(`/jobs/${jobId}/care-updates`) as any,

    /** "Customer not here" — after checking in and waiting; the visiting fee is yours. */
    reportCustomerAbsent: async (jobId: string, lat: number, lng: number) =>
      request(`/jobs/${jobId}/customer-absent`, { method: 'POST', body: JSON.stringify({ lat, lng }) }),

    /** `depositPercent`: on a quote of $1,000+, the share paid when work starts. */
    // ── Work added mid-job (docs/MONEY_RULES_DESIGN.md §11) ──────────────
    extraWork: async (jobId: string): Promise<ExtraWork | null> => request(`/jobs/${jobId}/extra-work`) as any,
    proposeExtraWork: async (jobId: string, amount: number, description: string): Promise<{ message: string }> =>
      request(`/jobs/${jobId}/extra-work`, { method: 'POST', body: JSON.stringify({ amount, description }) }) as any,
    withdrawExtraWork: async (jobId: string) => request(`/jobs/${jobId}/extra-work/withdraw`, { method: 'POST' }),

    raiseInvoice: async (
      jobId: string, amount: number, materials: Array<{ name: string; quantity: number; unit_cost: number; notes?: string }>,
      notes?: string, depositPercent = 0,
    ) =>
      request(`/jobs/${jobId}/invoice`, {
        method: 'POST',
        body: JSON.stringify({ amount, materials, notes, deposit_percent: depositPercent }),
      }),

    /**
     * Proof of pickup for a PICKUP_DROPOFF job — a photo of what was picked
     * up, geofence-checked against the job's pickup point. Plays the same
     * "arrival proven" role the OTP-gated inspection flow plays for a
     * standard job (that flow can't apply here: the customer isn't
     * physically at the pickup point to hand over a code).
     */
    confirmPickup: async (
      jobId: string, photoUri: string, mimeType: string, lat: number, lng: number, goodsAmount?: number,
      itemChecked = false,
    ) => {
      const form = new FormData();
      const ext = mimeType.split('/')[1] || 'jpg';
      form.append('photo', { uri: photoUri, name: `pickup.${ext}`, type: mimeType } as any);
      form.append('lat', String(lat));
      form.append('lng', String(lng));
      // Buy it for me: the receipt total, paid back from the customer's hold.
      if (goodsAmount != null) form.append('goods_amount', String(goodsAmount));
      // From a person: the item has been seen and checked.
      if (itemChecked) form.append('item_checked', 'true');
      return requestMultipart(`/jobs/${jobId}/pickup/confirm`, form);
    },

    /** From a person: not taking the item (prohibited, not as described,
     * not shown, nobody there). The job is cancelled; the trip is paid.
     * "Nobody there" needs a photo of the door (the reason's `photo` flag). */
    refusePickup: async (
      jobId: string, reason: string, lat: number, lng: number, note?: string,
      photo?: { uri: string; mimeType: string },
    ) => {
      const form = new FormData();
      form.append('reason', reason);
      form.append('lat', String(lat));
      form.append('lng', String(lng));
      if (note) form.append('note', note);
      if (photo) {
        const ext = photo.mimeType.split('/')[1] || 'jpg';
        form.append('photo', { uri: photo.uri, name: `refusal.${ext}`, type: photo.mimeType } as any);
      }
      return requestMultipart(`/jobs/${jobId}/pickup/refuse`, form);
    },

    /** A pickup from a person: the value cap, what's never carried, why an item can be refused. */
    getPersonPickupRules: async (): Promise<{
      max_value: number; banned: string; refusal_reasons: { key: string; label: string; photo?: boolean }[];
    }> => request('/jobs/pickup-from-person'),

    respondToCounter: async (jobId: string, accept: boolean) =>
      request(`/jobs/${jobId}/invoice/respond-counter`, {
        method: 'POST',
        body: JSON.stringify({ accept }),
      }),

    markComplete: async (jobId: string, completionNote?: string) =>
      request(`/jobs/${jobId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ completion_note: completionNote }),
      }),

    disputeJob: async (jobId: string, reason: string) =>
      request(`/jobs/${jobId}/dispute`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),

    cancelJob: async (jobId: string, reason: string) =>
      request(`/jobs/${jobId}/provider-cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),

    declineDirectRequest: async (jobId: string) =>
      request(`/jobs/${jobId}/decline-direct`, { method: 'POST' }),

    submitCustomerReview: async (jobId: string, review: {
      behaviour_rating: number;
      negotiation_rating: number;
      payment_rating: number;
      environment_rating: number;
      comment?: string;
    }) => request(`/jobs/${jobId}/customer-review`, { method: 'POST', body: JSON.stringify(review) }),

    // Finished jobs (completed or disputed) the provider hasn't rated the customer for yet.
    pendingRatings: async (): Promise<{ job_id: string; title: string; counterpart_name: string; status: string }[]> =>
      request('/jobs/pending-ratings') as any,
  },

  // ── HCI Score ─────────────────────────────────────────────────────────────
  hci: {
    getMyScore: async (): Promise<HCIScore> =>
      request('/providers/me/hci'),

    getHistory: async () =>
      request('/providers/me/hci/history'),

    /**
     * Explains how each dimension was calculated.
     * Useful for the provider to understand what drove their score.
     */
    getBreakdown: async (): Promise<{
      dimensions: Array<{
        name: string;
        weight: number;
        raw_score: number;
        weighted_score: number;
        signal_count: number;
        explanation: string;
      }>;
    }> => request('/providers/me/hci/breakdown'),
  },

  // ── Live Location (for job tracking) ─────────────────────────────────────
  tracking: {
    updateLocation: async (lat: number, lng: number, heading?: number | null) =>
      request('/providers/me/location', {
        method: 'PATCH',
        body: JSON.stringify(heading != null && heading >= 0 ? { lat, lng, heading } : { lat, lng }),
      }),
  },

  // ── Chat ──────────────────────────────────────────────────────────────────
  chat: {
    send: async (jobId: string, message: string, messageType: string = 'TEXT', imageUrl?: string) =>
      request(`/jobs/${jobId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message, message_type: messageType, image_url: imageUrl }),
      }),
    getMessages: async (jobId: string, before?: string) =>
      request(`/jobs/${jobId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`),
    // Caller owns the WebSocket lifecycle (open/onmessage/close). No token in
    // the URL — RN's WebSocket can't set headers, and query params tend to
    // end up in proxy/tunnel access logs, so the caller must send
    // {type:'auth', token: await TokenStore.getAccessToken()} as the very
    // first message right after the socket opens instead.
    getSocketUrl: async (jobId: string): Promise<string> => {
      const wsBase = BASE_URL.replace(/^http/, 'ws');
      return `${wsBase}/ws/jobs/${jobId}`;
    },
  },

  // ── Support tickets ──────────────────────────────────────────────────────
  // Not the same thing as the "Support AI" namespace below (an unrelated,
  // currently-unused AI chat endpoint) — this is the real ticket system the
  // admin panel's Support Tickets page reads from. No WebSocket for this
  // one; screens polling for new admin replies do so on a plain interval.
  // Voice calls with the agent handling a support ticket (backend:
  // app/services/support_call_service.py).
  supportCalls: {
    /** Can this person call their agent now (and why not), and any live call. */
    status: async (ticketId: string): Promise<SupportCallStatus> => request(`/support-tickets/${ticketId}/call`),
    /** Ring the agent handling this ticket. */
    call: async (ticketId: string): Promise<SupportCallView> =>
      request(`/support-tickets/${ticketId}/call`, { method: 'POST' }),
    answer: async (callId: string): Promise<SupportCallView> =>
      request(`/support-calls/${callId}/answer`, { method: 'POST' }),
    /** Hang up, cancel (still ringing, the caller) or decline (still ringing, the callee). */
    end: async (callId: string): Promise<SupportCallView> =>
      request(`/support-calls/${callId}/end`, { method: 'POST' }),
    /** A pass to this call's audio on our own media server. */
    media: async (callId: string): Promise<{ url: string; token: string; room: string; recorded: boolean }> =>
      request(`/support-calls/${callId}/media`, { method: 'POST' }),
    getSocketUrl: (ticketId: string): string => `${BASE_URL.replace(/^http/, 'ws')}/ws/support/${ticketId}`,
  },

  supportTickets: {
    // openingIsSystem: the message is an automatic note (e.g. which FAQs were
    // viewed), not something the user typed — shown as from support.
    // topic: what they picked (payment, job, behaviour, account, other) —
    // decides which support team gets it.
    create: async (subject: string, message: string, jobId?: string, openingIsSystem = false, topic?: string) =>
      request('/support-tickets', {
        method: 'POST',
        body: JSON.stringify({ subject, message, job_id: jobId, opening_is_system: openingIsSystem, topic }),
      }),
    list: async () => request('/support-tickets'),
    get: async (ticketId: string) => request(`/support-tickets/${ticketId}`),
    addMessage: async (ticketId: string, message: string) =>
      request(`/support-tickets/${ticketId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      }),
    addSystemMessage: async (ticketId: string, message: string) =>
      request(`/support-tickets/${ticketId}/system-message`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      }),
    selfResolve: async (ticketId: string) =>
      request(`/support-tickets/${ticketId}/self-resolve`, { method: 'PATCH' }),
  },

  // ── Push notifications ──────────────────────────────────────────────────
  fcm: {
    registerToken: async (token: string, platform: 'IOS' | 'ANDROID', tokenType: 'FCM' | 'VOIP' = 'FCM') =>
      request('/auth/fcm-token', {
        method: 'POST',
        body: JSON.stringify({ token, platform, token_type: tokenType }),
      }),
  },

  // ── Payments ──────────────────────────────────────────────────────────────
  payments: {
    /** Buy it for me: is the customer's shopping money held yet? */
    getStatus: async (jobId: string, purpose: 'INSPECTION_FEE' | 'JOB_COST' | 'GOODS_ADVANCE'): Promise<{
      status: 'PENDING_CAPTURE' | 'HELD' | 'RELEASED' | 'REFUNDED' | 'FAILED'; amount: number;
    }> => request(`/payments/${jobId}?purpose=${purpose}`),
  },

  // ── Payouts ───────────────────────────────────────────────────────────────
  payouts: {
    getBankAccount: async () =>
      request('/providers/me/payout-account'),

    addBankAccount: async (data: {
      account_number: string;
      ifsc_code: string;
      account_holder_name: string;
    }) => request('/providers/me/payout-account', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

    getPayoutHistory: async (page = 1) =>
      request(`/providers/me/payouts?page=${page}`),
  },

  // ── Repeat bookings (docs/MONEY_RULES_DESIGN.md §13) ─────────────────────
  series: {
    mine: async (): Promise<Series[]> => request('/series/me') as any,
    respond: async (seriesId: string, accept: boolean) =>
      request(`/series/${seriesId}/respond`, { method: 'POST', body: JSON.stringify({ accept }) }),
    end: async (seriesId: string) =>
      request(`/series/${seriesId}/change`, { method: 'POST', body: JSON.stringify({ action: 'END' }) }),
  },

  // ── Business account (docs/BUSINESS_PROVIDERS_DESIGN.md) ─────────────────
  business: {
    mine: async (): Promise<MyBusiness> => request('/businesses/me') as any,
    create: async (body: BusinessProfileInput): Promise<MyBusiness> =>
      request('/businesses/me', { method: 'POST', body: JSON.stringify(body) }) as any,
    update: async (body: BusinessProfileInput): Promise<MyBusiness> =>
      request('/businesses/me', { method: 'PUT', body: JSON.stringify(body) }) as any,
    submit: async (): Promise<MyBusiness> => request('/businesses/me/submit', { method: 'POST' }) as any,
    setIndependentWork: async (on: boolean): Promise<MyBusiness> =>
      request('/businesses/me/independent-work', { method: 'PUT', body: JSON.stringify({ on }) }) as any,
    setOwnWork: async (on: boolean): Promise<MyBusiness> =>
      request('/businesses/me/own-work', { method: 'PUT', body: JSON.stringify({ on }) }) as any,
    addDocument: async (doc: BusinessDocumentInput): Promise<MyBusiness> => {
      const form = new FormData();
      form.append('kind', doc.kind);
      form.append('file', { uri: doc.file.uri, name: doc.file.name, type: doc.file.mimeType } as any);
      form.append('issuer', doc.issuer);
      form.append('number', doc.number);
      if (doc.coverage_limit) form.append('coverage_limit', doc.coverage_limit);
      if (doc.trade) form.append('trade', doc.trade);
      if (doc.issuing_state) form.append('issuing_state', doc.issuing_state);
      if (doc.expires_on) form.append('expires_on', doc.expires_on);
      return requestMultipart('/businesses/me/documents', form) as any;
    },
    removeDocument: async (documentId: string): Promise<MyBusiness> =>
      request(`/businesses/me/documents/${documentId}`, { method: 'DELETE' }) as any,
    payoutsLink: async (): Promise<{ url: string }> =>
      request('/businesses/me/payouts/onboarding', { method: 'POST' }) as any,
    payoutsStatus: async (): Promise<{ connect_onboarding_status: string; is_demo?: boolean }> =>
      request('/businesses/me/payouts/status') as any,
    payoutsDashboard: async (): Promise<{ url: string }> =>
      request('/businesses/me/payouts/dashboard', { method: 'POST' }) as any,
    team: async (): Promise<Team> => request('/businesses/me/team') as any,
    invite: async (phone: string, role: MemberRole): Promise<Team> =>
      request('/businesses/me/team/invites', { method: 'POST', body: JSON.stringify({ phone, role }) }) as any,
    changeRole: async (memberId: string, role: MemberRole): Promise<Team> =>
      request(`/businesses/me/team/${memberId}`, { method: 'PUT', body: JSON.stringify({ role }) }) as any,
    setMemberOwnWork: async (memberId: string, on: boolean): Promise<Team> =>
      request(`/businesses/me/team/${memberId}/own-work`, { method: 'PUT', body: JSON.stringify({ on }) }) as any,
    removeMember: async (memberId: string): Promise<Team> =>
      request(`/businesses/me/team/${memberId}`, { method: 'DELETE' }) as any,
    /** Asks to leave: they go on leave_at, after the notice — sooner if released. */
    /** What would stop the business closing now (owner). */
    closureStatus: async (): Promise<{ blockers: string[] }> => request('/businesses/me/close') as any,
    /** Closes it: the team is released, no more work, history kept. */
    close: async (confirmName: string): Promise<{ message: string; released: number }> =>
      request('/businesses/me/close', { method: 'POST', body: JSON.stringify({ confirm_name: confirmName }) }) as any,
    leave: async (): Promise<{ message: string; leave_at: string; jobs_after?: number }> => request('/businesses/me/leave', { method: 'POST' }) as any,
    cancelLeave: async (): Promise<{ message: string }> => request('/businesses/me/leave', { method: 'DELETE' }) as any,
    releaseMember: async (memberId: string): Promise<Team> =>
      request(`/businesses/me/team/${memberId}/release`, { method: 'POST' }) as any,
    board: async (): Promise<BusinessBoard> => request('/businesses/me/jobs') as any,
    job: async (jobId: string): Promise<BusinessJobDetail> => request(`/businesses/me/jobs/${jobId}`) as any,
    positions: async (): Promise<TeamPosition[]> => request('/businesses/me/positions') as any,
    earnings: async (): Promise<BusinessEarnings> => request('/businesses/me/earnings') as any,
    applyForJob: async (jobId: string, workerId: string, message?: string): Promise<{ message: string }> =>
      request(`/businesses/me/jobs/${jobId}/apply`, { method: 'POST', body: JSON.stringify({ worker_id: workerId, message }) }) as any,
    assignJob: async (jobId: string, workerId: string): Promise<{ message: string }> =>
      request(`/businesses/me/jobs/${jobId}/assign`, { method: 'POST', body: JSON.stringify({ worker_id: workerId }) }) as any,
    invites: async (): Promise<BusinessInvite[]> => request('/businesses/invites') as any,
    answerInvite: async (memberId: string, accept: boolean, acknowledgedNotice: boolean, authorizedCheck = false): Promise<{ message: string }> =>
      request(`/businesses/invites/${memberId}`, {
        method: 'POST',
        body: JSON.stringify({ accept, acknowledged_notice: acknowledgedNotice, authorized_check: authorizedCheck }),
      }) as any,
  },

  // ── Rates & hosting (docs/JOB_SHAPE_DESIGN.md phase 4) ───────────────────
  hosting: {
    mine: async (): Promise<Hosting> => request('/hosting/me') as any,
    update: async (body: { hosts_at_home: boolean; host_capacity: number; base_address: string | null; base_lat: number | null; base_lng: number | null }): Promise<Hosting> =>
      request('/hosting/me', { method: 'PUT', body: JSON.stringify(body) }) as any,
    setRate: async (skillId: string, unit: ProviderRate['unit'], amount: number): Promise<Hosting> =>
      request('/hosting/me/rates', { method: 'PUT', body: JSON.stringify({ skill_id: skillId, unit, amount }) }) as any,
    removeRate: async (skillId: string, unit: ProviderRate['unit']): Promise<Hosting> =>
      request(`/hosting/me/rates?skill_id=${encodeURIComponent(skillId)}&unit=${unit}`, { method: 'DELETE' }) as any,
  },

  // ── The Dodorez guarantee (docs/MONEY_RULES_DESIGN.md §12) ───────────────
  guarantee: {
    mine: async (): Promise<GuaranteeClaim[]> => request('/protection/provider/guarantee-claims') as any,
    /** Offer to fix it at no charge, or explain why not. */
    respond: async (jobId: string, fix: boolean, note?: string): Promise<{ message: string }> =>
      request(`/protection/jobs/${jobId}/guarantee/respond`, { method: 'POST', body: JSON.stringify({ fix, note }) }) as any,
  },

  // ── Strikes (docs/MONEY_RULES_DESIGN.md §10) ─────────────────────────────
  strikes: {
    mine: async (): Promise<{ off_app_strikes: number; consequences_enabled: boolean; strikes: StrikeView[] }> =>
      request('/strikes/provider/me'),
    appeal: async (strikeId: string, reason: string): Promise<{ ticket_id: string; message: string }> =>
      request(`/strikes/provider/me/${strikeId}/appeal`, { method: 'POST', body: JSON.stringify({ reason }) }),
  },

  // ── Support AI ────────────────────────────────────────────────────────────
  support: {
    sendMessage: async (message: string, jobId?: string) =>
      request('/support/chat', {
        method: 'POST',
        body: JSON.stringify({ message, job_id: jobId }),
      }),

    getHistory: async () =>
      request('/support/chat/history'),
  },

  // ── Notifications ─────────────────────────────────────────────────────────
  notifications: {
    list: async (): Promise<Array<{
      id: string;
      title: string;
      body: string;
      notif_type: string;
      job_id: string | null;
      is_read: boolean;
      created_at: string;
      image_url: string | null;
    }>> => request('/notifications'),
    unreadCount: async (): Promise<number> => {
      const data: any = await request('/notifications/unread-count');
      return data?.unread_count ?? 0;
    },
    /** This app's "Push Notifications" switch (Settings). */
    getPushPreference: async (): Promise<boolean> => {
      const data: any = await request('/notifications/push-preference');
      return data?.enabled !== false;
    },
    setPushPreference: async (enabled: boolean) =>
      request('/notifications/push-preference', { method: 'PUT', body: JSON.stringify({ enabled }) }),
    readAll: async () => request('/notifications/read-all', { method: 'POST' }),
    /** "Clear all": hides every notification from the list for good (kept on
     * the server for support). Marking read alone brought them all back. */
    clearAll: async (upTo?: string) =>
      request('/notifications/clear-all', { method: 'POST', body: JSON.stringify({ up_to: upTo ?? null }) }),
  },

  // ── Job rating status ─────────────────────────────────────────────────────
  calls: {
    /** STUN/TURN servers for in-app calls, with short-lived credentials for
     * Dodorez's own relay (see backend app/services/ice_servers.py). */
    iceServers: async (): Promise<RTCIceServerConfig[]> => request('/calls/ice-servers') as any,
    /** This phone is showing the incoming call — the caller's screen switches
     * to "Ringing…". Used where there's no live socket (a push notification). */
    ringing: async (jobId: string, callId: string) =>
      request(`/calls/${jobId}/ringing`, { method: 'POST', body: JSON.stringify({ call_id: callId }) }),
    /** A pass to join this call's audio on our own media server (only for
     * the call's caller or callee). docs/CALL_RECORDING_DESIGN.md. */
    media: async (callId: string): Promise<{ url: string; token: string; room: string; recorded: boolean }> =>
      request(`/calls/${callId}/media`, { method: 'POST' }),
  },

  ratingStatus: {
    get: async (jobId: string): Promise<{ customer_has_rated: boolean; provider_has_rated: boolean }> =>
      request(`/jobs/${jobId}/rating-status`),
  },

  // ── Customer public data (for provider viewing a customer's profile) ───────
  customers: {
    getDetail: async (customerId: string) => request(`/customers/${customerId}`),
    getReviews: async (customerId: string) => request(`/customers/${customerId}/reviews`),
  },
};
