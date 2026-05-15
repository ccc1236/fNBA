import { describe, it, expect } from "vitest";
import { isGetPlayerStatsRequest } from "../../src/shared/messages.js";

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
