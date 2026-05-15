import { describe, it, expect } from "vitest";
import { formatStat } from "../../src/shared/format.js";

describe("formatStat", () => {
  it("formats 3-decimal percentages without leading zero", () => {
    expect(formatStat(0.586, 3)).toBe(".586");
    expect(formatStat(0.617, 3)).toBe(".617");
    expect(formatStat(1.0, 3)).toBe("1.000");
  });
  it("formats 1-decimal counts", () => {
    expect(formatStat(33.5, 1)).toBe("33.5");
    expect(formatStat(0.4, 1)).toBe("0.4");
  });
  it("formats USG-style (1-decimal percentage value)", () => {
    expect(formatStat(36.0, 1)).toBe("36.0");
  });
  it("returns em-less placeholder for null", () => {
    expect(formatStat(null, 1)).toBe("-");
    expect(formatStat(undefined, 1)).toBe("-");
  });
});
