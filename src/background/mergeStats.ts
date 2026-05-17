import type { PlayerStatRow } from "../shared/types.js";

/**
 * Merge Base and Advanced leaguedashplayerstats responses into a single
 * per-player record, keyed by nbaId.
 *
 * nba.com's Advanced MeasureType ignores PerMode for counting stats and
 * always returns season totals (e.g. FGM=644, FGA=1132 instead of 9.9/17.4).
 * Base correctly honors PerMode. So we seed with Advanced, then let Base
 * overwrite on the overlap: per-game counting stats are preserved while
 * Advanced's unique fields (EFG_PCT, TS_PCT, USG_PCT, OFF_RATING, etc.)
 * remain untouched.
 *
 * A player present in Advanced but missing from Base (rare, e.g. some
 * Two-Way players) keeps its Advanced row as a fallback.
 */
export function mergeBaseAndAdvanced(
  base: PlayerStatRow[],
  adv: PlayerStatRow[],
): Map<number, PlayerStatRow> {
  const byNbaId = new Map<number, PlayerStatRow>();
  for (const row of adv) {
    byNbaId.set(row.nbaId, { ...row, stats: { ...row.stats } });
  }
  for (const row of base) {
    const existing = byNbaId.get(row.nbaId);
    if (existing) {
      Object.assign(existing.stats, row.stats);
    } else {
      byNbaId.set(row.nbaId, { ...row, stats: { ...row.stats } });
    }
  }
  return byNbaId;
}
