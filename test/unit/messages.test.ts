import { describe, it, expect } from "vitest";
import { isGetPlayerStatsRequest, isBootstrapPlayersRequest, isGetSpiderDataRequest } from "../../src/shared/messages.js";

describe("message guards", () => {
  it("accepts a well-formed getPlayerStats request", () => {
    const msg = {
      type: "getPlayerStats",
      yahooIds: ["6015", "5007"],
      window: "Last5",
      perMode: "Per36",
    };
    expect(isGetPlayerStatsRequest(msg)).toBe(true);
  });

  it("rejects missing type", () => {
    expect(isGetPlayerStatsRequest({ yahooIds: [], window: "Season", perMode: "PerGame" })).toBe(false);
  });

  it("rejects wrong window value", () => {
    const msg = { type: "getPlayerStats", yahooIds: [], window: "Last20", perMode: "PerGame" };
    expect(isGetPlayerStatsRequest(msg)).toBe(false);
  });

  it("rejects non-array yahooIds", () => {
    const msg = { type: "getPlayerStats", yahooIds: "5007", window: "Season", perMode: "PerGame" };
    expect(isGetPlayerStatsRequest(msg)).toBe(false);
  });
});

describe("isBootstrapPlayersRequest", () => {
  it("accepts a well-formed request", () => {
    const msg = {
      type: "bootstrapPlayers",
      season: "2025-26",
      players: [{ yahooId: "y1", name: "Luka Dončić", team: "LAL" }],
    };
    expect(isBootstrapPlayersRequest(msg)).toBe(true);
  });
  it("rejects wrong type", () => {
    expect(isBootstrapPlayersRequest({ type: "other", season: "2025-26", players: [] })).toBe(false);
  });
  it("rejects non-array players", () => {
    expect(isBootstrapPlayersRequest({ type: "bootstrapPlayers", season: "2025-26", players: "x" }))
      .toBe(false);
  });
  it("rejects malformed player entries", () => {
    expect(isBootstrapPlayersRequest({
      type: "bootstrapPlayers", season: "2025-26", players: [{ yahooId: 1, name: "x", team: "y" }],
    })).toBe(false);
  });
});

describe("isGetSpiderDataRequest", () => {
  it("accepts a well-formed request", () => {
    expect(
      isGetSpiderDataRequest({
        type: "getSpiderData",
        yahooId: "5583",
        perMode: "PerGame",
      }),
    ).toBe(true);
  });

  it("rejects requests with the wrong type", () => {
    expect(isGetSpiderDataRequest({ type: "other", yahooId: "1", perMode: "PerGame" })).toBe(false);
  });

  it("rejects requests with a missing or non-string yahooId", () => {
    expect(isGetSpiderDataRequest({ type: "getSpiderData", perMode: "PerGame" })).toBe(false);
    expect(isGetSpiderDataRequest({ type: "getSpiderData", yahooId: 1, perMode: "PerGame" })).toBe(false);
  });

  it("rejects requests with an unknown perMode", () => {
    expect(
      isGetSpiderDataRequest({ type: "getSpiderData", yahooId: "1", perMode: "Bogus" }),
    ).toBe(false);
  });
});
