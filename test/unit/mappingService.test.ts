import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapPlayers } from "../../src/background/mappingService.js";
import * as nbaList from "../../src/background/nbaPlayersList.js";
import { loadMapping } from "../../src/background/playerMapping.js";

describe("bootstrapPlayers", () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
    vi.restoreAllMocks();
  });

  it("merges new Yahoo entries into the season mapping", async () => {
    vi.spyOn(nbaList, "fetchCommonAllPlayers").mockResolvedValue([
      { nbaId: 1629029, name: "Luka Doncic", team: "LAL" },
      { nbaId: 203999, name: "Nikola Jokic", team: "DEN" },
    ]);

    const r1 = await bootstrapPlayers("2025-26", [
      { yahooId: "y1", name: "Luka Dončić", team: "LAL" },
    ]);
    expect(r1.added).toBe(1);
    expect(r1.unmapped).toEqual([]);

    const stored = await loadMapping("2025-26");
    expect(stored).toHaveLength(1);
    expect(stored[0]!.yahooId).toBe("y1");
    expect(stored[0]!.nbaId).toBe(1629029);
  });

  it("does not call the NBA list twice in one session if already cached in storage", async () => {
    const spy = vi
      .spyOn(nbaList, "fetchCommonAllPlayers")
      .mockResolvedValue([{ nbaId: 203999, name: "Nikola Jokic", team: "DEN" }]);

    await bootstrapPlayers("2025-26", [{ yahooId: "y1", name: "Nikola Jokić", team: "DEN" }]);
    await bootstrapPlayers("2025-26", [{ yahooId: "y2", name: "Someone Else", team: "DEN" }]);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("reports unmapped Yahoo players", async () => {
    vi.spyOn(nbaList, "fetchCommonAllPlayers").mockResolvedValue([
      { nbaId: 1, name: "Some Guy", team: "DEN" },
    ]);
    const r = await bootstrapPlayers("2025-26", [
      { yahooId: "yX", name: "Made Up", team: "ZZZ" },
    ]);
    expect(r.added).toBe(0);
    expect(r.unmapped).toEqual(["yX"]);
  });

  it("forceFresh re-fetches the NBA list and rescues previously unmapped players", async () => {
    // First fetch: stale list, missing the player.
    const spy = vi.spyOn(nbaList, "fetchCommonAllPlayers");
    spy.mockResolvedValueOnce([{ nbaId: 1, name: "Stale Roster", team: "DEN" }]);

    const r1 = await bootstrapPlayers("2025-26", [
      { yahooId: "y1", name: "Late Arrival", team: "BKN" },
    ]);
    expect(r1.unmapped).toEqual(["y1"]);

    // Second fetch with forceFresh: the NBA list cache is dropped and re-fetched,
    // this time containing the previously absent player.
    spy.mockResolvedValueOnce([
      { nbaId: 1, name: "Stale Roster", team: "DEN" },
      { nbaId: 2, name: "Late Arrival", team: "BKN" },
    ]);
    const r2 = await bootstrapPlayers(
      "2025-26",
      [{ yahooId: "y1", name: "Late Arrival", team: "BKN" }],
      true,
    );
    expect(spy).toHaveBeenCalledTimes(2);
    expect(r2.added).toBe(1);
    const stored = await loadMapping("2025-26");
    expect(stored.find((m) => m.yahooId === "y1")?.nbaId).toBe(2);
  });

  it("preserves existing mapping entries on re-bootstrap", async () => {
    vi.spyOn(nbaList, "fetchCommonAllPlayers").mockResolvedValue([
      { nbaId: 1629029, name: "Luka Doncic", team: "LAL" },
      { nbaId: 203999, name: "Nikola Jokic", team: "DEN" },
    ]);
    await bootstrapPlayers("2025-26", [{ yahooId: "y1", name: "Luka Dončić", team: "LAL" }]);
    await bootstrapPlayers("2025-26", [{ yahooId: "y2", name: "Nikola Jokić", team: "DEN" }]);
    const stored = await loadMapping("2025-26");
    expect(stored.map((m) => m.yahooId).sort()).toEqual(["y1", "y2"]);
  });
});
