import { describe, it, expect } from "vitest";
import { currentSeason } from "../../src/background/season.js";

describe("currentSeason", () => {
  it("returns 2025-26 for Oct 2025", () => {
    expect(currentSeason(new Date("2025-10-15T00:00:00Z"))).toBe("2025-26");
  });
  it("returns 2024-25 for Jun 2025 (still playoffs)", () => {
    expect(currentSeason(new Date("2025-06-15T00:00:00Z"))).toBe("2024-25");
  });
  it("returns 2025-26 for Jul 2025 (new season cycle starts)", () => {
    expect(currentSeason(new Date("2025-07-01T00:00:00Z"))).toBe("2025-26");
  });
  it("returns 2026-27 for Dec 2026", () => {
    expect(currentSeason(new Date("2026-12-31T00:00:00Z"))).toBe("2026-27");
  });
});
