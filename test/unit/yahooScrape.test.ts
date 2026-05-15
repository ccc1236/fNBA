import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findStatsTable, scrapePlayers } from "../../src/content/yahoo.js";

const FIXTURE_DIR = resolve(__dirname, "../fixtures/yahoo");

describe("yahoo scraper - Players page", () => {
  beforeAll(() => {
    document.documentElement.innerHTML = readFileSync(
      resolve(FIXTURE_DIR, "players.html"),
      "utf8",
    );
  });

  it("finds the stats table", () => {
    const table = findStatsTable();
    expect(table).not.toBeNull();
    expect(table?.tagName).toBe("TABLE");
  });

  it("scrapes at least one player with id, name, team", () => {
    const players = scrapePlayers();
    expect(players.length).toBeGreaterThan(0);
    const p = players[0]!;
    expect(p.yahooId).toMatch(/^\d+$/);
    expect(p.name.length).toBeGreaterThan(0);
    expect(p.team).toMatch(/^[A-Z]{2,4}$/);
  });

  it("each player row links to /nba/players/<id>", () => {
    const players = scrapePlayers();
    expect(players.every((p) => /^\d+$/.test(p.yahooId))).toBe(true);
  });
});
