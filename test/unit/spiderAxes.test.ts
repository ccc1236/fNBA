import { describe, expect, it } from "vitest";
import { SPIDER_AXES, formatAxisValue } from "../../src/shared/spiderAxes.js";

describe("SPIDER_AXES", () => {
  it("lists 9 axes in clockwise order starting at 3PM", () => {
    expect(SPIDER_AXES.map((a) => a.key)).toEqual([
      "FG3M",
      "PTS",
      "REB",
      "AST",
      "STL",
      "BLK",
      "TOV",
      "TS_PCT",
      "USG_PCT",
    ]);
  });

  it("marks TOV as inverted; the rest as not inverted", () => {
    const inverted = SPIDER_AXES.filter((a) => a.inverted).map((a) => a.key);
    expect(inverted).toEqual(["TOV"]);
  });

  it("renders counting stats with 1 decimal", () => {
    expect(formatAxisValue("PTS", 22.4)).toBe("22.4");
    expect(formatAxisValue("REB", 5.5)).toBe("5.5");
  });

  it("renders TS_PCT as .XXX without leading zero", () => {
    expect(formatAxisValue("TS_PCT", 0.638)).toBe(".638");
  });

  it("multiplies USG_PCT by 100 and renders with 1 decimal, matching the injected USG% column", () => {
    expect(formatAxisValue("USG_PCT", 0.284)).toBe("28.4");
    expect(formatAxisValue("USG_PCT", 0.315)).toBe("31.5");
  });

  it("renders null as a dash", () => {
    expect(formatAxisValue("PTS", null)).toBe("—");
  });
});
