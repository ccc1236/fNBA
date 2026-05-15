import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLeagueDashPlayerStats } from "../../src/background/nbaClient.js";

const SAMPLE = {
  resultSets: [
    {
      headers: ["PLAYER_ID", "PLAYER_NAME", "TEAM_ABBREVIATION", "PTS", "EFG_PCT"],
      rowSet: [
        [203999, "Nikola Jokic", "DEN", 26.4, 0.624],
        [1629029, "Luka Doncic", "DAL", 33.9, 0.586],
      ],
    },
  ],
};

describe("fetchLeagueDashPlayerStats", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("parses the response into PlayerStatRow[]", async () => {
    const fetchMock = vi.fn<[string], Promise<Response>>(async () =>
      new Response(JSON.stringify(SAMPLE), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const rows = await fetchLeagueDashPlayerStats({
      season: "2025-26",
      measureType: "Advanced",
      perMode: "PerGame",
      lastNGames: 0,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ nbaId: 203999, name: "Nikola Jokic", teamAbbr: "DEN" });
    expect(rows[0]!.stats.PTS).toBe(26.4);
    expect(rows[0]!.stats.EFG_PCT).toBe(0.624);

    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain("stats.nba.com/stats/leaguedashplayerstats");
    expect(url).toContain("Season=2025-26");
    expect(url).toContain("MeasureType=Advanced");
    expect(url).toContain("PerMode=PerGame");
    expect(url).toContain("LastNGames=0");
  });

  it("throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    await expect(
      fetchLeagueDashPlayerStats({ season: "2025-26", measureType: "Base", perMode: "PerGame", lastNGames: 5 }),
    ).rejects.toThrow(/upstream/i);
  });

  it("throws RateLimitedError on 429", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("slow down", { status: 429 })));
    const { RateLimitedError } = await import("../../src/background/nbaClient.js");
    await expect(
      fetchLeagueDashPlayerStats({ season: "2025-26", measureType: "Base", perMode: "PerGame", lastNGames: 5 }),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });
});
