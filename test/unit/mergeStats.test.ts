import { describe, it, expect } from "vitest";
import { mergeBaseAndAdvanced } from "../../src/background/mergeStats.js";
import type { PlayerStatRow } from "../../src/shared/types.js";

function row(nbaId: number, name: string, stats: Record<string, number | null>): PlayerStatRow {
  return { nbaId, name, teamAbbr: "DEN", position: null, stats };
}

describe("mergeBaseAndAdvanced", () => {
  it("lets Base counting stats win over Advanced totals on overlap", () => {
    // Reproduces the live bug: nba.com Advanced returns FGM=644 (season totals)
    // while Base correctly returns FGM=9.9 (per-game). Base must win.
    const base = [row(203999, "Nikola Jokić", { FGM: 9.9, FGA: 17.4, PTS: 27.7, FG_PCT: 0.569 })];
    const adv = [row(203999, "Nikola Jokić", { FGM: 644, FGA: 1132, EFG_PCT: 0.618, TS_PCT: 0.670, USG_PCT: 0.289 })];

    const merged = mergeBaseAndAdvanced(base, adv).get(203999)!;

    expect(merged.stats.FGM).toBe(9.9);
    expect(merged.stats.FGA).toBe(17.4);
    expect(merged.stats.PTS).toBe(27.7);
    expect(merged.stats.EFG_PCT).toBe(0.618);
    expect(merged.stats.TS_PCT).toBe(0.670);
    expect(merged.stats.USG_PCT).toBe(0.289);
  });

  it("keeps an Advanced-only row when Base is missing the player", () => {
    const base: PlayerStatRow[] = [];
    const adv = [row(1, "Two-Way Player", { EFG_PCT: 0.5 })];
    const merged = mergeBaseAndAdvanced(base, adv);
    expect(merged.get(1)?.stats.EFG_PCT).toBe(0.5);
  });

  it("keeps a Base-only row when Advanced is missing the player", () => {
    const base = [row(2, "Base Only", { FGM: 5.0 })];
    const adv: PlayerStatRow[] = [];
    const merged = mergeBaseAndAdvanced(base, adv);
    expect(merged.get(2)?.stats.FGM).toBe(5.0);
  });

  it("does not mutate the input rows", () => {
    const baseStats = { FGM: 9.9 };
    const advStats = { FGM: 644, EFG_PCT: 0.6 };
    const base = [row(1, "A", baseStats)];
    const adv = [row(1, "A", advStats)];
    mergeBaseAndAdvanced(base, adv);
    expect(baseStats.FGM).toBe(9.9);
    expect(advStats.FGM).toBe(644);
  });
});
