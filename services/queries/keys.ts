// Every query key in one place: two screens asking for the same thing share
// one request and one cached answer (docs/APP_DATA_ARCHITECTURE.md).
export const qk = {
  provider: {
    all: ['provider'] as const,
    profile: ['provider', 'profile'] as const,
    skills: ['provider', 'skills'] as const,
    hosting: ['provider', 'hosting'] as const,
    jobAlerts: ['provider', 'job-alerts'] as const,
  },
  jobs: {
    all: ['jobs'] as const,
    active: ['jobs', 'active'] as const,
    inbound: ['jobs', 'inbound'] as const,
    history: ['jobs', 'history'] as const,
    pendingRatings: ['jobs', 'pending-ratings'] as const,
  },
};
