import { describe, it, expect } from "vitest";
import { detectPage } from "../../src/content/pageDetect.js";

describe("detectPage", () => {
  it("identifies the My Team page (literal /team)", () => {
    expect(detectPage("https://basketball.fantasysports.yahoo.com/nba/123456/team"))
      .toEqual({ kind: "myTeam", leagueId: "123456" });
  });
  it("identifies the My Team page (numeric team ID)", () => {
    expect(detectPage("https://basketball.fantasysports.yahoo.com/nba/9144/1"))
      .toEqual({ kind: "myTeam", leagueId: "9144" });
  });
  it("identifies the Players page", () => {
    expect(detectPage("https://basketball.fantasysports.yahoo.com/nba/123456/players"))
      .toEqual({ kind: "players", leagueId: "123456" });
  });
  it("identifies the Players page with query string", () => {
    expect(detectPage("https://basketball.fantasysports.yahoo.com/nba/123456/players?status=A&pos=PG"))
      .toEqual({ kind: "players", leagueId: "123456" });
  });
  it("returns unknown for unrelated routes", () => {
    expect(detectPage("https://basketball.fantasysports.yahoo.com/nba/123456/matchup"))
      .toEqual({ kind: "unknown" });
  });
  it("returns unknown for non-Yahoo URLs", () => {
    expect(detectPage("https://example.com/nba/123/team"))
      .toEqual({ kind: "unknown" });
  });
});
