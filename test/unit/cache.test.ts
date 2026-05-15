import { beforeEach, describe, expect, it, vi } from "vitest";
import { Cache } from "../../src/background/cache.js";

describe("Cache", () => {
  let cache: Cache;
  beforeEach(async () => {
    cache = new Cache({ dbName: `test-${Math.random()}`, defaultTtlMs: 1000 });
    await cache.open();
  });

  it("returns null for missing key", async () => {
    expect(await cache.get("nope")).toBeNull();
  });

  it("round-trips a value", async () => {
    await cache.set("k", { hello: "world" });
    expect(await cache.get("k")).toEqual({ hello: "world" });
  });

  it("expires entries past ttl", async () => {
    vi.useFakeTimers();
    const now = Date.UTC(2026, 0, 1);
    vi.setSystemTime(now);
    await cache.set("k", "v", 500);
    vi.setSystemTime(now + 600);
    expect(await cache.get("k")).toBeNull();
    vi.useRealTimers();
  });

  it("invalidate removes a key", async () => {
    await cache.set("k", "v");
    await cache.invalidate("k");
    expect(await cache.get("k")).toBeNull();
  });

  it("clear empties the store", async () => {
    await cache.set("a", 1);
    await cache.set("b", 2);
    await cache.clear();
    expect(await cache.get("a")).toBeNull();
    expect(await cache.get("b")).toBeNull();
  });
});
