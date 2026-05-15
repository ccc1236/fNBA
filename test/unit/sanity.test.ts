import { describe, it, expect } from "vitest";

describe("sanity", () => {
  it("vitest runs", () => {
    expect(1 + 1).toBe(2);
  });
  it("fake-indexeddb is available", () => {
    expect(typeof indexedDB).toBe("object");
  });
});
