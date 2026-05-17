import { describe, expect, it } from "vitest";
import { buildPercentileTable } from "../../src/background/percentiles.js";
import type { PlayerStatRow } from "../../src/shared/types.js";

function row(nbaId: number, stats: Record<string, number>): PlayerStatRow {
  return { nbaId, name: `p${nbaId}`, teamAbbr: "XXX", position: null, stats };
}

describe("buildPercentileTable", () => {
  it("scores each player by their league rank per stat, 0..100", () => {
    const rows = [
      row(1, { PTS: 10, REB: 5 }),
      row(2, { PTS: 20, REB: 4 }),
      row(3, { PTS: 30, REB: 3 }),
      row(4, { PTS: 40, REB: 2 }),
    ];
    const table = buildPercentileTable(rows, ["PTS", "REB"], new Set());
    expect(table.get(1)?.PTS).toBe(25);
    expect(table.get(2)?.PTS).toBe(50);
    expect(table.get(3)?.PTS).toBe(75);
    expect(table.get(4)?.PTS).toBe(100);
  });

  it("inverts the rank for stats listed as inverted (lower raw = higher percentile)", () => {
    const rows = [
      row(1, { TOV: 1.0 }),
      row(2, { TOV: 2.0 }),
      row(3, { TOV: 3.0 }),
      row(4, { TOV: 4.0 }),
    ];
    const table = buildPercentileTable(rows, ["TOV"], new Set(["TOV"]));
    // 4.0 TOV is worst, so percentile = 25 (bottom)
    expect(table.get(4)?.TOV).toBe(25);
    expect(table.get(1)?.TOV).toBe(100);
  });

  it("gives tied players the same percentile (average rank rule)", () => {
    const rows = [row(1, { PTS: 10 }), row(2, { PTS: 20 }), row(3, { PTS: 20 }), row(4, { PTS: 30 })];
    const table = buildPercentileTable(rows, ["PTS"], new Set());
    // Tied rank_asc = (2 + 3) / 2 = 2.5. Non-inverted percentile = 100 * 2.5 / 4 = 62.5.
    expect(table.get(2)?.PTS).toBe(62.5);
    expect(table.get(3)?.PTS).toBe(62.5);
  });

  it("returns null when a player's stat is missing or NaN", () => {
    const rows = [row(1, { PTS: 10 }), row(2, { PTS: NaN }), row(3, {})];
    const table = buildPercentileTable(rows, ["PTS"], new Set());
    expect(table.get(2)?.PTS).toBeUndefined();
    expect(table.get(3)?.PTS).toBeUndefined();
  });

  it("returns an empty table for an empty roster", () => {
    expect(buildPercentileTable([], ["PTS"], new Set()).size).toBe(0);
  });
});
