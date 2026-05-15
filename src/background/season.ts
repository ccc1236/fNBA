import type { SeasonString } from "../shared/types.js";

/** NBA season cycle: July of year N through June of year (N+1) belongs to "N-(N+1)". */
export function currentSeason(now: Date = new Date()): SeasonString {
  const month = now.getUTCMonth(); // 0-11
  const year = now.getUTCFullYear();
  const startYear = month >= 6 ? year : year - 1; // July (6) onward → new season
  const endTwo = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endTwo}`;
}
