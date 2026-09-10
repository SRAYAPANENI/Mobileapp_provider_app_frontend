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

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  // Auto-refresh on 401
  if (response.status === 401 && !skipAuth) {
    const newToken = await _refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      const retried = await fetch(`${BASE_URL}${endpoint}`, { ...fetchOptions, headers });
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
  const json = await response.json();
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

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (response.status === 401) {
    const newToken = await _refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      const retried = await fetch(`${BASE_URL}${endpoint}`, { method: 'POST', headers, body: formData });
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
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!response.ok) return null;
      const json = await response.json();
      const newToken: string = json.data?.access_token;
      if (newToken) {
        await SecureStore.setItemAsync(TOKEN_KEY, newToken);
      }
      return newToken ?? null;
    } catch {
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

// ─── API SURFACE ─────────────────────────────────────────────────────────────
export const SkoFyApi = {

  // ── Auth ──────────────────────────────────────────────────────────────────
  auth: {
    /**
     * Send OTP to phone number.
     * In dev mode (OTP_MOCK_MODE=true on backend) returns mock_otp: "123456".
     */
    sendOTP: async (phone: string): Promise<{ message: string; expires_in_seconds: number; mock_otp?: string }> => {
      const normalised = phone.startsWith('+') ? phone : `+${phone.replace(/[\s\-\(\)\.]/g, '')}`;
      return request('/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ phone: normalised, role: 'provider' }),
        skipAuth: true,
      });
    },

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
      };
      await TokenStore.setUser(user);
      return user;
    },

    /** Set or update password for the logged-in provider. currentPassword is
     * required when actually changing an existing password (not needed for
     * first-time setup, e.g. right after registration). */
    setPassword: async (password: string, currentPassword?: string) =>
      request('/auth/set-password', {
        method: 'POST',
        body: JSON.stringify({ password, current_password: currentPassword }),
      }),

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

    setPreferences: async (preferredRadiusKm: number) =>
      request('/providers/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ preferred_radius_km: preferredRadiusKm }),
      }),

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
    removeProfileImage: async () =>
      request('/providers/me/profile-image', { method: 'DELETE' }),

    getEarnings: async (): Promise<{
      total_earned: number;
      pending: number;
      jobs_paid_out: number;
      recent_payouts: Array<{ job_id: string; job_title: string; amount: number; paid_at: string | null }>;
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

    requestInspectionOtp: async (jobId: string) =>
      request(`/jobs/${jobId}/inspection/request-otp`, { method: 'POST' }),

    verifyInspectionOtp: async (jobId: string, otp: string, lat: number, lng: number) =>
      request(`/jobs/${jobId}/inspection/verify-otp`, {
        method: 'POST',
        body: JSON.stringify({ otp, lat, lng }),
      }),

    completeInspection: async (jobId: string) =>
      request(`/jobs/${jobId}/inspection/complete`, { method: 'POST' }),

    raiseInvoice: async (jobId: string, amount: number, materials: Array<{ name: string; quantity: number; unit_cost: number; notes?: string }>, notes?: string) =>
      request(`/jobs/${jobId}/invoice`, {
        method: 'POST',
        body: JSON.stringify({ amount, materials, notes }),
      }),

    /**
     * Proof of pickup for a PICKUP_DROPOFF job — a photo of what was picked
     * up, geofence-checked against the job's pickup point. Plays the same
     * "arrival proven" role the OTP-gated inspection flow plays for a
     * standard job (that flow can't apply here: the customer isn't
     * physically at the pickup point to hand over a code).
     */
    confirmPickup: async (jobId: string, photoUri: string, mimeType: string, lat: number, lng: number) => {
      const form = new FormData();
      const ext = mimeType.split('/')[1] || 'jpg';
      form.append('photo', { uri: photoUri, name: `pickup.${ext}`, type: mimeType } as any);
      form.append('lat', String(lat));
      form.append('lng', String(lng));
      return requestMultipart(`/jobs/${jobId}/pickup/confirm`, form);
    },

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
  },

  // ── Customers (public profile — checking who posted a job) ────────────────
  customers: {
    getDetail: async (customerId: string) => request(`/customers/${customerId}`),
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

  // ── Push notifications ──────────────────────────────────────────────────
  fcm: {
    registerToken: async (token: string, platform: 'IOS' | 'ANDROID', tokenType: 'FCM' | 'VOIP' = 'FCM') =>
      request('/auth/fcm-token', {
        method: 'POST',
        body: JSON.stringify({ token, platform, token_type: tokenType }),
      }),
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
    }>> => request('/notifications'),
    unreadCount: async (): Promise<number> => {
      const data: any = await request('/notifications/unread-count');
      return data?.unread_count ?? 0;
    },
    readAll: async () => request('/notifications/read-all', { method: 'POST' }),
  },

  // ── Job rating status ─────────────────────────────────────────────────────
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
