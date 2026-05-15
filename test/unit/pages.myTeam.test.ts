import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { run } from "../../src/pages/myTeam.js";
import "../../src/ui/filter-bar.js";

const FIXTURE = readFileSync(resolve(__dirname, "../fixtures/yahoo/myTeam.html"), "utf8");

beforeEach(() => {
  document.documentElement.innerHTML = FIXTURE;
  const sendMessage = vi.fn(async (msg: { type: string; yahooIds?: string[] }) => {
    if (msg.type === "getPlayerStats") {
      const ids = msg.yahooIds ?? [];
      const byYahooId: Record<string, unknown> = {};
      for (const id of ids) {
        byYahooId[id] = {
          nbaId: Number(id), name: `Player ${id}`, teamAbbr: "DEN", position: null,
          stats: { PTS: 25.5, EFG_PCT: 0.55, TS_PCT: 0.6, USG_PCT: 28.0 },
        };
      }
      return { type: "getPlayerStatsResponse", byYahooId, fetchedAt: Date.now() };
    }
    return { type: "bootstrapPlayersResponse", added: 0, unmapped: [] };
  });
  (chrome as unknown as { runtime: { sendMessage: typeof sendMessage } }).runtime = {
    sendMessage,
  };
});
afterEach(() => { document.body.innerHTML = ""; });

describe("myTeam page module", () => {
  it("mounts a filter bar and injects columns", async () => {
    await run({ kind: "myTeam", leagueId: "123456" });
    expect(document.querySelector("fnba-filter-bar")).not.toBeNull();
    expect(document.querySelectorAll("th[data-fnba]").length).toBe(3);
  });
});
