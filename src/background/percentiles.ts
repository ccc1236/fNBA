import type { NbaPlayerId, PlayerStatRow } from "../shared/types.js";
import type { PercentileRecord, SpiderStatKey } from "../shared/spider.js";

/**
 * Build a per-player percentile table for each requested stat key.
 *
 * For each stat, players are ranked using the average-rank method for ties:
 *   averageRank = mean of the 1-indexed ranks the tied group occupies after
 *   sorting raw values ascending.
 *
 * Non-inverted stats (higher raw = better): percentile = 100 * avgRank / n
 *   The player with the highest raw value lands at percentile 100.
 *
 * Inverted stats (lower raw = better, e.g. TOV):
 *   percentile = 100 * (n + 1 - avgRank) / n
 *   The player with the lowest raw value lands at percentile 100.
 *
 * Players with a missing or NaN value for a stat are excluded from the
 * ranking and get `undefined` for that stat in the result.
 */
export function buildPercentileTable(
  rows: readonly PlayerStatRow[],
  keys: readonly SpiderStatKey[],
  invertedKeys: ReadonlySet<SpiderStatKey>,
): Map<NbaPlayerId, PercentileRecord> {
  const table = new Map<NbaPlayerId, PercentileRecord>();
  for (const r of rows) table.set(r.nbaId, {});

  for (const key of keys) {
    const inverted = invertedKeys.has(key);
    const valid: Array<{ id: NbaPlayerId; v: number }> = [];
    for (const r of rows) {
      const raw = r.stats[key];
      if (typeof raw === "number" && Number.isFinite(raw)) {
        valid.push({ id: r.nbaId, v: raw });
      }
    }
    if (valid.length === 0) continue;
    valid.sort((a, b) => a.v - b.v);

    const n = valid.length;
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && valid[j + 1]!.v === valid[i]!.v) j++;
      const avg = (i + 1 + j + 1) / 2;
      const pct = inverted
        ? Math.round(((100 * (n + 1 - avg)) / n) * 10) / 10
        : Math.round(((100 * avg) / n) * 10) / 10;
      for (let k = i; k <= j; k++) {
        table.get(valid[k]!.id)![key] = pct;
      }
      i = j + 1;
    }
  }

  return table;
}
