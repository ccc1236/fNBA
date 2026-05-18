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

/**
 * Yahoo's fixture lands on "Stats > Today" (top tab "Stats" has the
 * `Selected` class). For tests that want the full overlay behavior we
 * have to flip the active markers to put us on Average Stats with the
 * current-season sub-tab. This helper does that mutation in place.
 */
function activateAverageStatsSeason(season: string): void {
  // Top tab: strip Selected from Stats, add Selected to Average Stats.
  for (const li of Array.from(document.querySelectorAll<HTMLElement>("li.Navitem"))) {
    li.classList.remove("Selected");
  }
  const top = Array.from(document.querySelectorAll<HTMLElement>("a.Navtarget"))
    .find((a) => (a.textContent ?? "").trim() === "Average Stats");
  top?.closest("li")?.classList.add("Selected");

  // Sub tab: mark "{season} Season" as Selected and clear Default-selected.
  for (const li of Array.from(document.querySelectorAll<HTMLElement>("li.Navitem"))) {
    li.classList.remove("Default-selected");
  }
  const sub = Array.from(document.querySelectorAll<HTMLElement>("a.Navtarget"))
    .find((a) => (a.textContent ?? "").trim() === `${season} Season`);
  sub?.closest("li")?.classList.add("Selected");
}

function currentSeason(): string {
  const now = new Date();
  const m = now.getUTCMonth();
  const y = now.getUTCFullYear();
  const start = m >= 6 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

describe("myTeam page module", () => {
  it("mounts a banner (no filter bar) on the default Stats > Today tab", async () => {
    await run({ kind: "myTeam", leagueId: "123456" });
    expect(document.querySelector(".fnba-banner-host")).not.toBeNull();
    expect(document.querySelector(".fnba-bar-host")).toBeNull();
    expect(document.querySelectorAll('th[data-fnba]').length).toBe(0);
  });

  it("mounts the filter bar and injects columns once Average Stats > current season is active", async () => {
    activateAverageStatsSeason(currentSeason());
    await run({ kind: "myTeam", leagueId: "123456" });
    expect(document.querySelector(".fnba-bar-host")).not.toBeNull();
    expect(document.querySelector(".fnba-banner-host")).toBeNull();
    expect(document.querySelectorAll('th[data-fnba]:not([data-fnba="group"])').length).toBe(3);
  });
});
