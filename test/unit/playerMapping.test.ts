import { beforeEach, describe, expect, it } from "vitest";
import { buildMapping, normalizeName, loadMapping, saveMapping } from "../../src/background/playerMapping.js";

describe("normalizeName", () => {
  it("strips diacritics, lowercases, trims punctuation", () => {
    expect(normalizeName("Nikola Jokić")).toBe("nikola jokic");
    expect(normalizeName("Shai Gilgeous-Alexander")).toBe("shai gilgeous alexander");
    expect(normalizeName("  Luka  Dončić  ")).toBe("luka doncic");
    expect(normalizeName("Vít Krejčí")).toBe("vit krejci");
  });
});

describe("buildMapping", () => {
  it("matches exact name + team", () => {
    const yahoo = [{ yahooId: "y1", name: "Nikola Jokić", team: "DEN" }];
    const nba = [{ nbaId: 203999, name: "Nikola Jokic", team: "DEN" }];
    const m = buildMapping(yahoo, nba);
    expect(m).toEqual([{ yahooId: "y1", nbaId: 203999, name: "Nikola Jokić", matchedBy: "exact" }]);
  });

  it("falls back to fuzzy when team matches and name is close", () => {
    const yahoo = [{ yahooId: "y2", name: "Shai Gilgeous-Alexander", team: "OKC" }];
    const nba = [{ nbaId: 1628983, name: "Shai Gilgeous Alexander", team: "OKC" }];
    const m = buildMapping(yahoo, nba);
    expect(m).toHaveLength(1);
    expect(m[0]!.nbaId).toBe(1628983);
    expect(m[0]!.matchedBy).toBe("exact"); // normalization collapses the hyphen
  });

  it("uses fuzzy for misspellings within edit-distance 2", () => {
    const yahoo = [{ yahooId: "y3", name: "Luka Doncic", team: "DAL" }];
    const nba = [{ nbaId: 1629029, name: "Luca Doncec", team: "DAL" }];
    const m = buildMapping(yahoo, nba);
    expect(m[0]!.matchedBy).toBe("fuzzy");
  });

  it("skips a Yahoo player with no NBA match", () => {
    const yahoo = [{ yahooId: "y4", name: "Made Up Player", team: "ZZZ" }];
    const nba = [{ nbaId: 1, name: "Real Person", team: "DEN" }];
    expect(buildMapping(yahoo, nba)).toEqual([]);
  });
});

describe("persistence", () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });
  it("saveMapping + loadMapping round-trips by season", async () => {
    const entries = [{ yahooId: "y1", nbaId: 203999, name: "Nikola Jokić", matchedBy: "exact" as const }];
    await saveMapping("2025-26", entries);
    expect(await loadMapping("2025-26")).toEqual(entries);
    expect(await loadMapping("2024-25")).toEqual([]);
  });
});
