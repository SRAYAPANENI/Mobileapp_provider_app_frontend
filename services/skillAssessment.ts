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
}

/** done | upgrade available | verified, upgrade locked | first test | locked (cooldown) */
export type TestButtonState = 'maxed' | 'upgrade' | 'verified_locked' | 'take_test' | 'locked';

export function testButtonState(skill: AssessableSkill, eligibility?: SkillEligibility): TestButtonState {
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

export function eligibilityMessage(e?: SkillEligibility | null): string {
  if (!e) return 'You are not eligible to take this test right now.';
  if (e.reason === 'cooldown') return `Please wait ${e.retry_after_minutes} more minute(s) before retaking this test.`;
  if (e.reason === 'needs_more_jobs') return `Complete ${e.jobs_required - e.jobs_completed} more job(s) in this skill before retesting for an upgrade.`;
  return 'You are not eligible to take this test right now.';
}

/** Case-insensitive match on the skill or its profession. */
export function filterSkills<T extends Pick<AssessableSkill, 'name' | 'profession'>>(skills: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter(s => s.name.toLowerCase().includes(q) || (s.profession ?? '').toLowerCase().includes(q));
}
