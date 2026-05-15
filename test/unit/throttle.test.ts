import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Throttle, ThrottledError } from "../../src/background/throttle.js";

describe("Throttle", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("runs tasks serially with intervalMs spacing", async () => {
    const t = new Throttle({ intervalMs: 1000, cooldownMs: 60_000 });
    const order: number[] = [];
    const p1 = t.run(async () => { order.push(1); return "a"; });
    const p2 = t.run(async () => { order.push(2); return "b"; });

    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual([1]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(order).toEqual([1, 2]);

    expect(await p1).toBe("a");
    expect(await p2).toBe("b");
  });

  it("enters cooldown after triggerCooldown() and rejects until expiry", async () => {
    const t = new Throttle({ intervalMs: 100, cooldownMs: 60_000 });
    t.triggerCooldown();

    await expect(t.run(async () => "x")).rejects.toBeInstanceOf(ThrottledError);

    await vi.advanceTimersByTimeAsync(60_000);
    // After cooldown, should run.
    const out = t.run(async () => "ok");
    await vi.advanceTimersByTimeAsync(100);
    expect(await out).toBe("ok");
  });
});
