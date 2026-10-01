export interface ApplyGateInfo {
  code: string;
  title: string;
  message: string;
  actionLabel: string;
}

const GATE_COPY: Record<string, { title: string; message: string; actionLabel: string }> = {
  SKILL_NOT_VERIFIED: {
    title: 'Skill Test Required',
    message: "You need to pass the skill test for this job's required skill before applying.",
    actionLabel: 'Take Test',
  },
  IDENTITY_NOT_VERIFIED: {
    title: 'Identity Verification Required',
    message: 'Your identity must be verified before you can apply to jobs.',
    actionLabel: 'Verify Now',
  },
  CONNECT_ONBOARDING_INCOMPLETE: {
    title: 'Payout Setup Required',
    message: 'You need to finish setting up payouts before you can be hired for jobs.',
    actionLabel: 'Set Up Now',
  },
  BACKGROUND_CHECK_PENDING: {
    title: 'Verification Required',
    message: 'This job needs your verification to finish before you can be hired.',
    actionLabel: 'View Status',
  },
  LICENSE_NOT_VERIFIED: {
    title: 'Verification Required',
    message: 'This job needs your verification to finish before you can be hired.',
    actionLabel: 'View Status',
  },
};

// Every screen that calls SkoFyApi.jobs.bid() (Dashboard's Apply, Job
// Details' bid modal, Job Details' direct-request accept) hits the same set
// of gate error codes from the backend. This used to be copy-pasted per
// screen and had drifted out of sync — Job Details was missing the
// payout-setup and background-check/license gates entirely, silently
// falling back to a generic "Failed" alert with no path to actually fix
// the problem. One source of truth for "what does this error code mean"
// so the three call sites can't drift again; each still renders it through
// its own modal/alert since that presentation genuinely differs per screen.
export function resolveApplyGate(err: any): ApplyGateInfo | null {
  const code = err?.error_code;
  const copy = code ? GATE_COPY[code] : undefined;
  if (!copy) return null;
  return { code, title: copy.title, message: err?.message || copy.message, actionLabel: copy.actionLabel };
}
