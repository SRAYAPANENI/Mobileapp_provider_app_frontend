// The rules behind a skill's row in Verification → Skill Assessments: which
// test button it shows, its level badge, and what to say when a test can't
// be taken yet. Pure functions — no React, no network — so the row component
// only draws and these can be reasoned about (and tested) on their own.

export interface AssessableSkill {
  skill_id: string;
  name: string;
  profession: string;
  is_verified: boolean;
  /** 0–1 */
  skill_o_meter: number;
}

export interface SkillEligibility {
  eligible: boolean;
  reason: string;
  jobs_completed: number;
  jobs_required: number;
  retry_after_minutes?: number | null;
  /** Its test is a camera test: consent, a face photo, photos during it and two spoken answers. */
  proctored?: boolean;
}

/** done | upgrade available | verified, upgrade locked | first test | locked (a wait) |
 * a pass waiting for Dodorez's review | a test still open, to pick up again
 * (docs/SKILL_VERIFICATION_DESIGN.md). */
export type TestButtonState = 'maxed' | 'upgrade' | 'verified_locked' | 'take_test' | 'locked' | 'review' | 'resume'
  // No test for this skill (docs/SKILL_VERIFICATION_DESIGN.md §4): open with a verified ID, or waiting for one.
  | 'no_test' | 'id_needed';

export function testButtonState(skill: AssessableSkill, eligibility?: SkillEligibility): TestButtonState {
  if (eligibility?.reason === 'no_test') return skill.is_verified ? 'no_test' : 'id_needed';
  if (eligibility?.reason === 'in_progress') return 'resume';
  if (eligibility?.reason === 'under_review') return 'review';
  const eligible = eligibility?.eligible ?? false;
  if (skill.is_verified) {
    if (skill.skill_o_meter >= 1) return 'maxed';
    return eligible ? 'upgrade' : 'verified_locked';
  }
  return eligible ? 'take_test' : 'locked';
}

export interface SkillLevel { label: 'Expert' | 'Intermediate' | 'Beginner'; bg: string; border: string; color: string }

const LEVELS: Record<SkillLevel['label'], Omit<SkillLevel, 'label'>> = {
  Expert: { bg: '#FEF2F2', border: '#FCA5A5', color: '#DC2626' },
  Intermediate: { bg: '#F0F9FF', border: '#BAE6FD', color: '#0284C7' },
  Beginner: { bg: '#F9FAFB', border: '#E5E7EB', color: '#6B7280' },
};

export function skillLevel(meter: number): SkillLevel {
  const pct = meter * 100;
  const label: SkillLevel['label'] = pct >= 70 ? 'Expert' : pct >= 35 ? 'Intermediate' : 'Beginner';
  return { label, ...LEVELS[label] };
}

/** "45 minutes", "about 5 hours", "about 3 days" — the server's wording (skill_test_integrity.wait_words). */
export function waitWords(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `about ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(minutes / 1440);
  return `about ${days} day${days === 1 ? '' : 's'}`;
}

/** For the button: "45m", "5h", "3d". */
export function shortWait(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 36 ? `${hours}h` : `${Math.round(minutes / 1440)}d`;
}

export function eligibilityMessage(e?: SkillEligibility | null): string {
  if (!e) return "You can't take this test right now.";
  const wait = waitWords(e.retry_after_minutes ?? 1);
  if (e.reason === 'cooldown') return `You can take this test again in ${wait}. Each try has new questions.`;
  if (e.reason === 'rejected') return `Your last test was turned down after review. You can take it again in ${wait}.`;
  if (e.reason === 'under_review') return "Your test is being reviewed by Dodorez. You'll be told as soon as it's decided.";
  if (e.reason === 'no_test') return "This skill doesn't need a test. It opens once your ID is verified, and your first customers' ratings decide whether it stays that way.";
  if (e.reason === 'needs_more_jobs') {
    const left = e.jobs_required - e.jobs_completed;
    return `Complete ${left} more job${left === 1 ? '' : 's'} in this skill before retesting for an upgrade.`;
  }
  return "You can't take this test right now.";
}

/** The alert's title when a test can't be taken. */
export function eligibilityTitle(e?: SkillEligibility | null): string {
  if (e?.reason === 'under_review') return 'Being reviewed';
  if (e?.reason === 'no_test') return 'No test needed';
  if (e?.reason === 'cooldown' || e?.reason === 'rejected') return 'Not yet';
  return 'Not eligible yet';
}

/** Case-insensitive match on the skill or its profession. */
export function filterSkills<T extends Pick<AssessableSkill, 'name' | 'profession'>>(skills: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter(s => s.name.toLowerCase().includes(q) || (s.profession ?? '').toLowerCase().includes(q));
}
