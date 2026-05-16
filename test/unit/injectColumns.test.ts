import { describe, it, expect, beforeEach } from "vitest";
import { renderColumns, clearFnbaCells } from "../../src/content/injectColumns.js";
import type { PlayerStatRow } from "../../src/shared/types.js";

const SAMPLE: Record<string, PlayerStatRow | null> = {
  "6014": {
    nbaId: 1629029, name: "Luka", teamAbbr: "LAL", position: null,
    // USG_PCT comes from nba.com as a fraction; column config multiplies by 100 for display.
    stats: { PTS: 33.5, REB: 7.7, AST: 8.3, EFG_PCT: 0.563, TS_PCT: 0.617, USG_PCT: 0.368 },
  },
  "404": null,
};

function mkTable(): HTMLTableElement {
  document.body.innerHTML = `
    <table>
      <thead>
        <tr><th>Players</th><th>PTS</th><th>REB</th></tr>
      </thead>
      <tbody>
        <tr><td><a data-ys-playerid="6014" title="Luka">Luka</a></td><td><div>99.9</div></td><td><div>50.0</div></td></tr>
        <tr><td><a data-ys-playerid="404" title="Missing">Missing</a></td><td><div>99.9</div></td><td><div>50.0</div></td></tr>
      </tbody>
    </table>`;
  return document.querySelector("table")!;
}

describe("renderColumns", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("appends three advanced column headers", () => {
    const t = mkTable();
    renderColumns(t, SAMPLE);
    const headers = Array.from(t.querySelectorAll("th[data-fnba]"));
    expect(headers.map((h) => h.textContent)).toEqual(["eFG%", "TS%", "USG%"]);
  });

  it("populates adv values for mapped players", () => {
    const t = mkTable();
    renderColumns(t, SAMPLE);
    const lukaRow = t.querySelector('tr:has(a[data-ys-playerid="6014"])')!;
    const advCells = Array.from(lukaRow.querySelectorAll("td[data-fnba]"));
    expect(advCells.map((c) => c.textContent)).toEqual([".563", ".617", "36.8"]);
  });

  it("shows dash for unmapped players", () => {
    const t = mkTable();
    renderColumns(t, SAMPLE);
    const missingRow = t.querySelector('tr:has(a[data-ys-playerid="404"])')!;
    const advCells = Array.from(missingRow.querySelectorAll("td[data-fnba]"));
    expect(advCells.map((c) => c.textContent)).toEqual(["-", "-", "-"]);
  });

  it("is idempotent (calling twice does not duplicate)", () => {
    const t = mkTable();
    renderColumns(t, SAMPLE);
    renderColumns(t, SAMPLE);
    expect(t.querySelectorAll("th[data-fnba]")).toHaveLength(3);
    const lukaRow = t.querySelector('tr:has(a[data-ys-playerid="6014"])')!;
    expect(lukaRow.querySelectorAll("td[data-fnba]")).toHaveLength(3);
  });

  it("overrides Base stat cells via header-index mapping", () => {
    const t = mkTable();
    renderColumns(t, SAMPLE);
    const lukaRow = t.querySelector('tr:has(a[data-ys-playerid="6014"])')!;
    const ptsCell = lukaRow.children[1] as HTMLElement;
    expect(ptsCell.textContent).toContain("33.5");
    expect(ptsCell.hasAttribute("data-fnba-override")).toBe(true);
  });

  it("clearFnbaCells removes injected and override marks", () => {
    const t = mkTable();
    renderColumns(t, SAMPLE);
    clearFnbaCells(t);
    expect(t.querySelectorAll("[data-fnba]")).toHaveLength(0);
    expect(t.querySelectorAll("[data-fnba-override]")).toHaveLength(0);
  });
});
