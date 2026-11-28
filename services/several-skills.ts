// How a job with several skills pays (skofy-backend app/domain/rate_card.py
// combine; jobs.all_skills_priced): set prices add up — each is work of its
// own; by the hour, day or night it pays once, at whichever skill's price comes
// to the most for the booking (each skill at the cheapest their prices allow:
// a day or week price can beat the hourly one) — it's one person's time. Said on the
// job card, the job's details and Rates & hosting, so providers know before
// they apply, and when they set their prices.

const PER: Record<string, string> = { HOUR: 'hour', DAY: 'day', NIGHT: 'night' };

/** One line for a job priced from every one of its skills — null otherwise. */
export function severalSkillsRule(allSkillsPriced: boolean | undefined, skillCount: number, unit: string | null | undefined): string | null {
  if (!allSkillsPriced || skillCount < 2 || !unit) return null;
  if (PER[unit]) return `${skillCount} skills: paid once, at whichever of your prices for them comes to the most — not added up.`;
  if (unit === 'VISIT' || unit === 'FIXED') return `${skillCount} skills: your price for each is added up.`;
  return null;
}

/** On Rates & hosting: under the skills priced by the hour or the visit, and
 *  under those priced by the night or the day. */
export const SEVERAL_SKILLS_NOTE = {
  skills: 'A job with several of your skills: prices by the visit are added up; by the hour it’s paid once, at whichever skill’s price comes to the most.',
  stays: 'A job with several of your skills is paid once, at whichever skill’s price comes to the most — not each added up.',
};
