// Every query key in one place: two screens asking for the same thing share
// one request and one cached answer (docs/APP_DATA_ARCHITECTURE.md).
export const qk = {
  provider: {
    all: ['provider'] as const,
    profile: ['provider', 'profile'] as const,
    skills: ['provider', 'skills'] as const,
    hosting: ['provider', 'hosting'] as const,
    jobAlerts: ['provider', 'job-alerts'] as const,
    vehicles: ['provider', 'vehicles'] as const,
  },
  reference: {
    usStates: ['reference', 'us-states'] as const,
  },
  jobs: {
    all: ['jobs'] as const,
    active: ['jobs', 'active'] as const,
    inbound: ['jobs', 'inbound'] as const,
    /** The feed narrowed to one skill (or every one), read a page at a time. */
    inboundFeed: (skillId: string | null) => ['jobs', 'inbound', skillId ?? 'all'] as const,
    inboundCounts: ['jobs', 'inbound-counts'] as const,
    history: ['jobs', 'history'] as const,
    pendingRatings: ['jobs', 'pending-ratings'] as const,
  },
  appConfig: ['app-config', 'provider'] as const,
};
