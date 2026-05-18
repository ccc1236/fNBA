import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCommonAllPlayers } from "../../src/background/nbaPlayersList.js";

const SAMPLE = {
  resultSets: [
    {
      headers: ["PERSON_ID", "DISPLAY_FIRST_LAST", "TEAM_ABBREVIATION", "ROSTERSTATUS", "TO_YEAR"],
      rowSet: [
        [203999, "Nikola Jokic", "DEN", 1, "2026"],
        [1629029, "Luka Doncic", "LAL", 1, "2026"],
        [201939, "Stephen Curry", "GSW", 1, "2026"],
        [203954, "Injured Guy", "BKN", 0, "2026"],
        [977, "Truly Retired", "", 0, "2010"],
      ],
    },
  ],
};

describe("fetchCommonAllPlayers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns every player with a team abbreviation, regardless of ROSTERSTATUS", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<[string], Promise<Response>>(async () =>
        new Response(JSON.stringify(SAMPLE), { status: 200, headers: { "content-type": "application/json" } }),
      ),
    );
    const players = await fetchCommonAllPlayers("2025-26");
    // 3 active + 1 injured (still has team) = 4. The teamless retired row drops out.
    expect(players).toHaveLength(4);
    expect(players[0]).toEqual({ nbaId: 203999, name: "Nikola Jokic", team: "DEN" });
    expect(players.find((p) => p.name === "Injured Guy")).toEqual({
      nbaId: 203954, name: "Injured Guy", team: "BKN",
    });
    expect(players.find((p) => p.name === "Truly Retired")).toBeUndefined();
  });

  it("includes the Season param in the URL", async () => {
    const fetchMock = vi.fn<[string], Promise<Response>>(async () =>
      new Response(JSON.stringify(SAMPLE), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await fetchCommonAllPlayers("2025-26");
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain("stats.nba.com/stats/commonallplayers");
    expect(url).toContain("Season=2025-26");
    expect(url).toContain("IsOnlyCurrentSeason=1");
  });

  it("throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    await expect(fetchCommonAllPlayers("2025-26")).rejects.toThrow(/upstream/i);
  });
});
