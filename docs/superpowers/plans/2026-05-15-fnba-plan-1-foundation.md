# fNBA Plan 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working MV3 service worker that exposes a typed `getPlayerStats` message API returning real nba.com/stats data, with header-spoofing, throttled queue, IndexedDB cache, and Yahoo→NBA player ID mapping.

**Architecture:** Vite + `@crxjs/vite-plugin` builds an MV3 extension. The service worker is the only component that talks to nba.com/stats. `declarativeNetRequest` rewrites outbound request headers. All public functionality is exposed as `chrome.runtime.onMessage` handlers consuming typed message contracts from `src/shared/`.

**Tech Stack:** TypeScript (strict), Vite 5, `@crxjs/vite-plugin` 2.x, Vitest 1.x, fake-indexeddb (test), GitHub Actions.

**Verifiable output of this plan:** You can load the unpacked extension in Chrome, open the service worker DevTools, run `await chrome.runtime.sendMessage({type: 'getPlayerStats', yahooIds: [<known yahooId>], window: 'Season', perMode: 'PerGame'})`, and receive a `{success: true, data: {...}}` response with real nba.com numbers for that player.

---

## File Structure (created by this plan)

```
fnba/
  .github/workflows/ci.yml
  manifest.json                    # MV3 manifest
  package.json
  tsconfig.json
  vite.config.ts
  rules/nba-headers.json           # declarativeNetRequest static rules
  src/
    background/
      index.ts                     # SW entry, message router
      nbaClient.ts                 # nba.com/stats HTTP wrapper
      cache.ts                     # IndexedDB cache layer
      throttle.ts                  # 1 req/sec queue + 429 cooldown
      playerMapping.ts             # Yahoo↔NBA ID mapping
      season.ts                    # season-string helpers
    shared/
      types.ts                     # domain types (PlayerStats, Window, PerMode, etc.)
      messages.ts                  # message contract types + type guards
      columns.ts                   # config: which adv columns to show
      windows.ts                   # config: time-window definitions
      perModes.ts                  # config: per-mode definitions
      logger.ts                    # tiny tagged console wrapper
  test/
    setup.ts                       # vitest setup (fake-indexeddb)
    unit/
      cache.test.ts
      throttle.test.ts
      playerMapping.test.ts
      nbaClient.test.ts
      messages.test.ts
      season.test.ts
  public/icons/                    # 16/32/48/128 png placeholders
```

Each file has one responsibility. The SW entry (`index.ts`) is the only place that wires things together; everything else is a pure-ish module that can be unit-tested in isolation.

---

## Task 1: Repo scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `manifest.json`
- Modify: `.gitignore` (add `dist/`, `node_modules/`, `.vite/`)
- Create: `public/icons/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png` (1×1 transparent PNG placeholders)

- [ ] **Step 1.1: Write `package.json`**

```json
{
  "name": "fnba",
  "version": "0.0.1",
  "description": "Yahoo Fantasy NBA advanced-stats overlay extension",
  "license": "MIT",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.27",
    "@types/chrome": "^0.0.260",
    "@types/node": "^20.11.0",
    "fake-indexeddb": "^5.0.2",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.4.0"
  }
}
```

- [ ] **Step 1.2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["chrome", "vitest/globals"]
  },
  "include": ["src", "test", "vite.config.ts"]
}
```

- [ ] **Step 1.3: Write `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "fNBA — Fantasy NBA Stats Overlay",
  "version": "0.0.1",
  "description": "Advanced stats overlay for Yahoo Fantasy Basketball.",
  "icons": {
    "16": "public/icons/icon-16.png",
    "32": "public/icons/icon-32.png",
    "48": "public/icons/icon-48.png",
    "128": "public/icons/icon-128.png"
  },
  "background": { "service_worker": "src/background/index.ts", "type": "module" },
  "permissions": ["storage", "declarativeNetRequest"],
  "host_permissions": [
    "https://stats.nba.com/*",
    "https://basketball.fantasysports.yahoo.com/*"
  ],
  "declarative_net_request": {
    "rule_resources": [
      { "id": "nba-headers", "enabled": true, "path": "rules/nba-headers.json" }
    ]
  }
}
```

- [ ] **Step 1.4: Write `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json" with { type: "json" };

export default defineConfig({
  plugins: [crx({ manifest })],
  build: { rollupOptions: { input: {} } },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
  },
});
```

- [ ] **Step 1.5: Update `.gitignore`**

Append:
```
dist/
node_modules/
.vite/
*.crx
*.zip
```

- [ ] **Step 1.6: Create placeholder icons**

```bash
# 1×1 transparent PNG, base64
ICON_B64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII="
mkdir -p public/icons
for s in 16 32 48 128; do
  echo "$ICON_B64" | base64 -d > "public/icons/icon-${s}.png"
done
```

- [ ] **Step 1.7: Install and verify**

Run:
```bash
npm install
npm run typecheck
```
Expected: install succeeds, typecheck passes with no errors (nothing to check yet).

- [ ] **Step 1.8: Commit**

```bash
git add package.json tsconfig.json vite.config.ts manifest.json .gitignore public/
git commit -m "chore: scaffold MV3 extension with Vite + crxjs"
```

---

## Task 2: Vitest setup + sanity test

**Files:**
- Create: `test/setup.ts`
- Create: `test/unit/sanity.test.ts`

- [ ] **Step 2.1: Write `test/setup.ts`**

```ts
import "fake-indexeddb/auto";

// Minimal chrome.* stubs for unit tests. Add to as needed per test.
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: (() => {
      const store: Record<string, unknown> = {};
      return {
        get: async (keys?: string | string[]) => {
          if (!keys) return { ...store };
          const arr = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(arr.map((k) => [k, store[k]]));
        },
        set: async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        },
        remove: async (key: string) => {
          delete store[key];
        },
        clear: async () => {
          for (const k of Object.keys(store)) delete store[k];
        },
      };
    })(),
  },
} as unknown;
```

- [ ] **Step 2.2: Write sanity test**

`test/unit/sanity.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("sanity", () => {
  it("vitest runs", () => {
    expect(1 + 1).toBe(2);
  });
  it("fake-indexeddb is available", () => {
    expect(typeof indexedDB).toBe("object");
  });
});
```

- [ ] **Step 2.3: Run tests**

Run: `npm test`
Expected: PASS — 2 tests pass.

- [ ] **Step 2.4: Commit**

```bash
git add test/
git commit -m "test: vitest setup with fake-indexeddb"
```

---

## Task 3: Shared config — columns, windows, perModes

**Files:**
- Create: `src/shared/columns.ts`
- Create: `src/shared/windows.ts`
- Create: `src/shared/perModes.ts`
- Create: `src/shared/types.ts`

- [ ] **Step 3.1: Write `src/shared/types.ts`**

```ts
export type WindowKey = "Season" | "Last5" | "Last10";
export type PerModeKey = "PerGame" | "Per36" | "Per100Possessions";
export type MeasureType = "Base" | "Advanced";

export type NbaPlayerId = number;
export type YahooPlayerId = string;
export type SeasonString = string; // e.g. "2025-26"

export interface PlayerStatRow {
  nbaId: NbaPlayerId;
  name: string;
  teamAbbr: string;
  position: string | null;
  // All stats as a flat record so adding columns doesn't require a type change.
  stats: Record<string, number | null>;
}

export interface PlayerMappingEntry {
  yahooId: YahooPlayerId;
  nbaId: NbaPlayerId;
  name: string;
  matchedBy: "exact" | "fuzzy" | "manual";
}
```

- [ ] **Step 3.2: Write `src/shared/columns.ts`**

```ts
import type { MeasureType } from "./types.js";

export interface ColumnDef {
  /** key as returned by leaguedashplayerstats (uppercase) */
  key: string;
  /** UI label */
  label: string;
  /** which MeasureType call this column comes from */
  source: MeasureType;
  /** number of decimal places for display */
  decimals: number;
}

export const ADVANCED_COLUMNS: ColumnDef[] = [
  { key: "EFG_PCT", label: "eFG%", source: "Advanced", decimals: 3 },
  { key: "TS_PCT", label: "TS%", source: "Advanced", decimals: 3 },
  { key: "USG_PCT", label: "USG%", source: "Advanced", decimals: 1 },
];

/** Columns the override layer needs from MeasureType=Base. Used by content
 *  script to know which Yahoo cells it should replace. */
export const BASE_OVERRIDE_COLUMNS: ColumnDef[] = [
  { key: "PTS", label: "PTS", source: "Base", decimals: 1 },
  { key: "REB", label: "REB", source: "Base", decimals: 1 },
  { key: "AST", label: "AST", source: "Base", decimals: 1 },
  { key: "STL", label: "STL", source: "Base", decimals: 1 },
  { key: "BLK", label: "BLK", source: "Base", decimals: 1 },
  { key: "FG3M", label: "3PM", source: "Base", decimals: 1 },
  { key: "FG_PCT", label: "FG%", source: "Base", decimals: 3 },
  { key: "FT_PCT", label: "FT%", source: "Base", decimals: 3 },
  { key: "TOV", label: "TO", source: "Base", decimals: 1 },
];
```

- [ ] **Step 3.3: Write `src/shared/windows.ts`**

```ts
import type { WindowKey } from "./types.js";

export interface WindowDef {
  key: WindowKey;
  label: string;
  /** nba.com `LastNGames` param. 0 = season-long. */
  lastNGames: number;
}

export const WINDOWS: WindowDef[] = [
  { key: "Season", label: "Season", lastNGames: 0 },
  { key: "Last5", label: "L5", lastNGames: 5 },
  { key: "Last10", label: "L10", lastNGames: 10 },
];

export function windowByKey(key: WindowKey): WindowDef {
  const w = WINDOWS.find((w) => w.key === key);
  if (!w) throw new Error(`unknown window ${key}`);
  return w;
}
```

- [ ] **Step 3.4: Write `src/shared/perModes.ts`**

```ts
import type { PerModeKey } from "./types.js";

export interface PerModeDef {
  key: PerModeKey;
  label: string;
  /** value to send to nba.com `PerMode` param */
  apiValue: string;
}

export const PER_MODES: PerModeDef[] = [
  { key: "PerGame", label: "Per Game", apiValue: "PerGame" },
  { key: "Per36", label: "Per 36", apiValue: "Per36" },
  { key: "Per100Possessions", label: "Per 100", apiValue: "Per100Possessions" },
];

export function perModeByKey(key: PerModeKey): PerModeDef {
  const m = PER_MODES.find((m) => m.key === key);
  if (!m) throw new Error(`unknown per-mode ${key}`);
  return m;
}
```

- [ ] **Step 3.5: Typecheck and commit**

Run: `npm run typecheck`
Expected: pass.

```bash
git add src/shared/
git commit -m "feat(shared): column/window/per-mode config + core types"
```

---

## Task 4: Message contracts

**Files:**
- Create: `src/shared/messages.ts`
- Create: `test/unit/messages.test.ts`

- [ ] **Step 4.1: Write the failing test**

`test/unit/messages.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isGetPlayerStatsRequest } from "../../src/shared/messages.js";

describe("message guards", () => {
  it("accepts a well-formed getPlayerStats request", () => {
    const msg = {
      type: "getPlayerStats",
      yahooIds: ["6015", "5007"],
      window: "Last5",
      perMode: "Per36",
    };
    expect(isGetPlayerStatsRequest(msg)).toBe(true);
  });

  it("rejects missing type", () => {
    expect(isGetPlayerStatsRequest({ yahooIds: [], window: "Season", perMode: "PerGame" })).toBe(false);
  });

  it("rejects wrong window value", () => {
    const msg = { type: "getPlayerStats", yahooIds: [], window: "Last20", perMode: "PerGame" };
    expect(isGetPlayerStatsRequest(msg)).toBe(false);
  });

  it("rejects non-array yahooIds", () => {
    const msg = { type: "getPlayerStats", yahooIds: "5007", window: "Season", perMode: "PerGame" };
    expect(isGetPlayerStatsRequest(msg)).toBe(false);
  });
});
```

- [ ] **Step 4.2: Run test to verify failure**

Run: `npm test -- messages`
Expected: FAIL — `isGetPlayerStatsRequest is not a function`.

- [ ] **Step 4.3: Implement `src/shared/messages.ts`**

```ts
import type { PerModeKey, PlayerStatRow, WindowKey, YahooPlayerId } from "./types.js";

export const WINDOW_KEYS: readonly WindowKey[] = ["Season", "Last5", "Last10"];
export const PER_MODE_KEYS: readonly PerModeKey[] = ["PerGame", "Per36", "Per100Possessions"];

export interface GetPlayerStatsRequest {
  type: "getPlayerStats";
  yahooIds: YahooPlayerId[];
  window: WindowKey;
  perMode: PerModeKey;
  /** if true, bypass cache and refetch */
  forceFresh?: boolean;
}

export interface GetPlayerStatsResponse {
  type: "getPlayerStatsResponse";
  byYahooId: Record<YahooPlayerId, PlayerStatRow | null>;
  fetchedAt: number;
}

export interface ErrorResponse {
  type: "error";
  code: "RATE_LIMITED" | "UPSTREAM_UNAVAILABLE" | "BAD_REQUEST" | "UNKNOWN";
  message: string;
}

export type Request = GetPlayerStatsRequest;
export type Response = GetPlayerStatsResponse | ErrorResponse;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isGetPlayerStatsRequest(v: unknown): v is GetPlayerStatsRequest {
  if (!isObject(v)) return false;
  if (v.type !== "getPlayerStats") return false;
  if (!Array.isArray(v.yahooIds)) return false;
  if (!v.yahooIds.every((id) => typeof id === "string")) return false;
  if (typeof v.window !== "string" || !WINDOW_KEYS.includes(v.window as WindowKey)) return false;
  if (typeof v.perMode !== "string" || !PER_MODE_KEYS.includes(v.perMode as PerModeKey)) return false;
  if (v.forceFresh !== undefined && typeof v.forceFresh !== "boolean") return false;
  return true;
}
```

- [ ] **Step 4.4: Run test to verify pass**

Run: `npm test -- messages`
Expected: PASS — 4 tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add src/shared/messages.ts test/unit/messages.test.ts
git commit -m "feat(shared): message contract types + type guards"
```

---

## Task 5: Season helpers

**Files:**
- Create: `src/background/season.ts`
- Create: `test/unit/season.test.ts`

NBA seasons span calendar years. nba.com expects `"2025-26"`. We derive the active season from the current date — NBA seasons run roughly Oct→Jun, so we say a season *N-(N+1)* covers Jul N through Jun (N+1).

- [ ] **Step 5.1: Write failing test**

`test/unit/season.test.ts`:
```ts
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
```

- [ ] **Step 5.2: Run test, verify failure**

Run: `npm test -- season`
Expected: FAIL — `currentSeason is not a function`.

- [ ] **Step 5.3: Implement**

`src/background/season.ts`:
```ts
import type { SeasonString } from "../shared/types.js";

/** NBA season cycle: July of year N through June of year (N+1) belongs to "N-(N+1)". */
export function currentSeason(now: Date = new Date()): SeasonString {
  const month = now.getUTCMonth(); // 0-11
  const year = now.getUTCFullYear();
  const startYear = month >= 6 ? year : year - 1; // July (6) onward → new season
  const endTwo = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endTwo}`;
}
```

- [ ] **Step 5.4: Run test, verify pass**

Run: `npm test -- season`
Expected: PASS — 4 tests pass.

- [ ] **Step 5.5: Commit**

```bash
git add src/background/season.ts test/unit/season.test.ts
git commit -m "feat(bg): currentSeason helper"
```

---

## Task 6: declarativeNetRequest header rules

**Files:**
- Create: `rules/nba-headers.json`

This is static JSON loaded by Chrome at extension install. It rewrites outbound request headers for requests to `stats.nba.com` so the API accepts them.

- [ ] **Step 6.1: Write `rules/nba-headers.json`**

```json
[
  {
    "id": 1,
    "priority": 1,
    "action": {
      "type": "modifyHeaders",
      "requestHeaders": [
        { "header": "Referer", "operation": "set", "value": "https://www.nba.com/" },
        { "header": "Origin", "operation": "set", "value": "https://www.nba.com" },
        { "header": "x-nba-stats-origin", "operation": "set", "value": "stats" },
        { "header": "x-nba-stats-token", "operation": "set", "value": "true" },
        { "header": "Accept-Language", "operation": "set", "value": "en-US,en;q=0.9" },
        { "header": "User-Agent", "operation": "set", "value": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
      ]
    },
    "condition": {
      "urlFilter": "||stats.nba.com/",
      "resourceTypes": ["xmlhttprequest"]
    }
  }
]
```

- [ ] **Step 6.2: Verify manifest still references this file (Task 1 already did this — confirm)**

Open `manifest.json`, ensure:
```json
"declarative_net_request": {
  "rule_resources": [
    { "id": "nba-headers", "enabled": true, "path": "rules/nba-headers.json" }
  ]
}
```
Already present.

- [ ] **Step 6.3: Commit**

```bash
git add rules/
git commit -m "feat(bg): declarativeNetRequest rules for nba.com header spoofing"
```

---

## Task 7: Throttle queue

**Files:**
- Create: `src/background/throttle.ts`
- Create: `test/unit/throttle.test.ts`

Goal: at most 1 request per `intervalMs`. On 429 (rate-limit signaled by caller), enter a `cooldownMs` window during which `run()` rejects fast with a typed error.

- [ ] **Step 7.1: Write failing test**

`test/unit/throttle.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Throttle, ThrottledError } from "../../src/background/throttle.js";

describe("Throttle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

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
```

- [ ] **Step 7.2: Run test, verify failure**

Run: `npm test -- throttle`
Expected: FAIL — module not found.

- [ ] **Step 7.3: Implement**

`src/background/throttle.ts`:
```ts
export class ThrottledError extends Error {
  constructor(public retryAfterMs: number) {
    super(`rate limited; retry in ${retryAfterMs}ms`);
    this.name = "ThrottledError";
  }
}

export interface ThrottleOptions {
  intervalMs: number;
  cooldownMs: number;
}

interface Task<T> {
  fn: () => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}

export class Throttle {
  private queue: Task<unknown>[] = [];
  private running = false;
  private lastRunAt = 0;
  private cooldownUntil = 0;

  constructor(private opts: ThrottleOptions) {}

  triggerCooldown(): void {
    this.cooldownUntil = Date.now() + this.opts.cooldownMs;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    if (now < this.cooldownUntil) {
      throw new ThrottledError(this.cooldownUntil - now);
    }
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve: resolve as (v: unknown) => void, reject } as Task<unknown>);
      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const wait = Math.max(0, this.lastRunAt + this.opts.intervalMs - Date.now());
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        const task = this.queue.shift()!;
        this.lastRunAt = Date.now();
        try {
          const v = await task.fn();
          task.resolve(v);
        } catch (e) {
          task.reject(e);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
```

- [ ] **Step 7.4: Run test, verify pass**

Run: `npm test -- throttle`
Expected: PASS — 2 tests pass.

- [ ] **Step 7.5: Commit**

```bash
git add src/background/throttle.ts test/unit/throttle.test.ts
git commit -m "feat(bg): throttle queue with cooldown"
```

---

## Task 8: IndexedDB cache

**Files:**
- Create: `src/background/cache.ts`
- Create: `test/unit/cache.test.ts`

Single object store, keyed by string. Each entry: `{ key, value, expiresAt }`.

- [ ] **Step 8.1: Write failing test**

`test/unit/cache.test.ts`:
```ts
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
```

- [ ] **Step 8.2: Run, verify failure**

Run: `npm test -- cache`
Expected: FAIL — module not found.

- [ ] **Step 8.3: Implement**

`src/background/cache.ts`:
```ts
interface Entry<T> {
  key: string;
  value: T;
  expiresAt: number;
}

export interface CacheOptions {
  dbName: string;
  storeName?: string;
  defaultTtlMs?: number;
}

export class Cache {
  private db: IDBDatabase | null = null;
  private readonly storeName: string;
  private readonly defaultTtl: number;

  constructor(private opts: CacheOptions) {
    this.storeName = opts.storeName ?? "entries";
    this.defaultTtl = opts.defaultTtlMs ?? 6 * 60 * 60 * 1000; // 6h
  }

  async open(): Promise<void> {
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(this.opts.dbName, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(this.storeName, { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private tx(mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) throw new Error("cache not opened");
    return this.db.transaction(this.storeName, mode).objectStore(this.storeName);
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = await new Promise<Entry<T> | undefined>((resolve, reject) => {
      const req = this.tx("readonly").get(key);
      req.onsuccess = () => resolve(req.result as Entry<T> | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      await this.invalidate(key);
      return null;
    }
    return entry.value;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const entry: Entry<T> = { key, value, expiresAt: Date.now() + (ttlMs ?? this.defaultTtl) };
    await new Promise<void>((resolve, reject) => {
      const req = this.tx("readwrite").put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async invalidate(key: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const req = this.tx("readwrite").delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async clear(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const req = this.tx("readwrite").clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
```

- [ ] **Step 8.4: Run, verify pass**

Run: `npm test -- cache`
Expected: PASS — 5 tests pass.

- [ ] **Step 8.5: Commit**

```bash
git add src/background/cache.ts test/unit/cache.test.ts
git commit -m "feat(bg): IndexedDB-backed cache with TTL"
```

---

## Task 9: nba.com HTTP client

**Files:**
- Create: `src/shared/logger.ts`
- Create: `src/background/nbaClient.ts`
- Create: `test/unit/nbaClient.test.ts`

The leaguedashplayerstats response shape is `{resultSets: [{headers: string[], rowSet: any[][]}]}`. The client parses it into `PlayerStatRow[]`.

- [ ] **Step 9.1: Write `src/shared/logger.ts`**

```ts
const TAG = "[fNBA]";
export const log = {
  debug: (...a: unknown[]) => console.debug(TAG, ...a),
  info: (...a: unknown[]) => console.info(TAG, ...a),
  warn: (...a: unknown[]) => console.warn(TAG, ...a),
  error: (...a: unknown[]) => console.error(TAG, ...a),
};
```

- [ ] **Step 9.2: Write failing test**

`test/unit/nbaClient.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLeagueDashPlayerStats } from "../../src/background/nbaClient.js";

const SAMPLE = {
  resultSets: [
    {
      headers: ["PLAYER_ID", "PLAYER_NAME", "TEAM_ABBREVIATION", "PTS", "EFG_PCT"],
      rowSet: [
        [203999, "Nikola Jokic", "DEN", 26.4, 0.624],
        [1629029, "Luka Doncic", "DAL", 33.9, 0.586],
      ],
    },
  ],
};

describe("fetchLeagueDashPlayerStats", () => {
  afterEach(() => vi.restoreAllMocks());

  it("parses the response into PlayerStatRow[]", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(SAMPLE), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const rows = await fetchLeagueDashPlayerStats({
      season: "2025-26",
      measureType: "Advanced",
      perMode: "PerGame",
      lastNGames: 0,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ nbaId: 203999, name: "Nikola Jokic", teamAbbr: "DEN" });
    expect(rows[0]!.stats.PTS).toBe(26.4);
    expect(rows[0]!.stats.EFG_PCT).toBe(0.624);

    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain("stats.nba.com/stats/leaguedashplayerstats");
    expect(url).toContain("Season=2025-26");
    expect(url).toContain("MeasureType=Advanced");
    expect(url).toContain("PerMode=PerGame");
    expect(url).toContain("LastNGames=0");
  });

  it("throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    await expect(
      fetchLeagueDashPlayerStats({ season: "2025-26", measureType: "Base", perMode: "PerGame", lastNGames: 5 }),
    ).rejects.toThrow(/upstream/i);
  });

  it("throws RateLimitedError on 429", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("slow down", { status: 429 })));
    const { RateLimitedError } = await import("../../src/background/nbaClient.js");
    await expect(
      fetchLeagueDashPlayerStats({ season: "2025-26", measureType: "Base", perMode: "PerGame", lastNGames: 5 }),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });
});
```

- [ ] **Step 9.3: Run, verify failure**

Run: `npm test -- nbaClient`
Expected: FAIL — module not found.

- [ ] **Step 9.4: Implement `src/background/nbaClient.ts`**

```ts
import type { MeasureType, PerModeKey, PlayerStatRow, SeasonString } from "../shared/types.js";
import { log } from "../shared/logger.js";

export class RateLimitedError extends Error {
  constructor() {
    super("nba.com rate-limited (429)");
    this.name = "RateLimitedError";
  }
}

export class UpstreamUnavailableError extends Error {
  constructor(public status: number) {
    super(`nba.com upstream returned ${status}`);
    this.name = "UpstreamUnavailableError";
  }
}

export interface LeagueDashParams {
  season: SeasonString;
  measureType: MeasureType;
  perMode: PerModeKey;
  lastNGames: number;
}

const BASE_URL = "https://stats.nba.com/stats/leaguedashplayerstats";

/** Hardcoded params that don't vary per call. Mirrors swar/nba_api defaults. */
const STATIC_PARAMS: Record<string, string> = {
  College: "",
  Conference: "",
  Country: "",
  DateFrom: "",
  DateTo: "",
  Division: "",
  DraftPick: "",
  DraftYear: "",
  GameScope: "",
  GameSegment: "",
  Height: "",
  LeagueID: "00",
  Location: "",
  Month: "0",
  OpponentTeamID: "0",
  Outcome: "",
  PORound: "0",
  PaceAdjust: "N",
  Period: "0",
  PlayerExperience: "",
  PlayerPosition: "",
  PlusMinus: "N",
  Rank: "N",
  SeasonSegment: "",
  SeasonType: "Regular Season",
  ShotClockRange: "",
  StarterBench: "",
  TeamID: "0",
  TwoWay: "0",
  VsConference: "",
  VsDivision: "",
  Weight: "",
};

function buildUrl(p: LeagueDashParams): string {
  const q = new URLSearchParams({
    ...STATIC_PARAMS,
    Season: p.season,
    MeasureType: p.measureType,
    PerMode: p.perMode,
    LastNGames: String(p.lastNGames),
  });
  return `${BASE_URL}?${q.toString()}`;
}

interface RawResultSet {
  headers: string[];
  rowSet: (string | number | null)[][];
}
interface RawResponse {
  resultSets: RawResultSet[];
}

const HEADER_INDEX_FALLBACK = -1;

function parse(raw: RawResponse): PlayerStatRow[] {
  const rs = raw.resultSets?.[0];
  if (!rs) return [];
  const idx = (h: string): number => {
    const i = rs.headers.indexOf(h);
    return i === -1 ? HEADER_INDEX_FALLBACK : i;
  };
  const iId = idx("PLAYER_ID");
  const iName = idx("PLAYER_NAME");
  const iTeam = idx("TEAM_ABBREVIATION");

  return rs.rowSet.map((row) => {
    const stats: Record<string, number | null> = {};
    rs.headers.forEach((h, i) => {
      const v = row[i];
      if (typeof v === "number" || v === null) stats[h] = v as number | null;
    });
    return {
      nbaId: row[iId] as number,
      name: (row[iName] ?? "") as string,
      teamAbbr: (row[iTeam] ?? "") as string,
      position: null,
      stats,
    };
  });
}

export async function fetchLeagueDashPlayerStats(p: LeagueDashParams): Promise<PlayerStatRow[]> {
  const url = buildUrl(p);
  log.debug("fetch", url);
  const res = await fetch(url, { method: "GET" });
  if (res.status === 429) throw new RateLimitedError();
  if (!res.ok) throw new UpstreamUnavailableError(res.status);
  const json = (await res.json()) as RawResponse;
  return parse(json);
}
```

- [ ] **Step 9.5: Run, verify pass**

Run: `npm test -- nbaClient`
Expected: PASS — 3 tests pass.

- [ ] **Step 9.6: Commit**

```bash
git add src/shared/logger.ts src/background/nbaClient.ts test/unit/nbaClient.test.ts
git commit -m "feat(bg): nba.com leaguedashplayerstats client"
```

---

## Task 10: Player ID mapping

**Files:**
- Create: `src/background/playerMapping.ts`
- Create: `test/unit/playerMapping.test.ts`

The mapping logic is the algorithm only — fetching the Yahoo player list is out of scope for Plan 1 (it requires DOM scraping against a logged-in session; we'll do it in Plan 2). Plan 1 ships the *matcher* (`buildMapping(yahooList, nbaList)`) and an in-memory + `chrome.storage.local` persistence layer keyed by season. Bootstrapping is deferred — the SW just returns "no mapping yet" for unknown Yahoo IDs.

- [ ] **Step 10.1: Write failing test**

`test/unit/playerMapping.test.ts`:
```ts
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
```

- [ ] **Step 10.2: Run, verify failure**

Run: `npm test -- playerMapping`
Expected: FAIL — module not found.

- [ ] **Step 10.3: Implement**

`src/background/playerMapping.ts`:
```ts
import type {
  NbaPlayerId,
  PlayerMappingEntry,
  SeasonString,
  YahooPlayerId,
} from "../shared/types.js";

export interface YahooPlayer {
  yahooId: YahooPlayerId;
  name: string;
  team: string;
}
export interface NbaPlayer {
  nbaId: NbaPlayerId;
  name: string;
  team: string;
}

export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Damerau-Levenshtein distance (small inputs only — names are short). */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i]![j] = Math.min(dp[i]![j]!, dp[i - 2]![j - 2]! + 1);
      }
    }
  }
  return dp[m]![n]!;
}

const FUZZY_MAX_DISTANCE = 2;

export function buildMapping(yahoo: YahooPlayer[], nba: NbaPlayer[]): PlayerMappingEntry[] {
  const byKey = new Map<string, NbaPlayer>();
  for (const p of nba) byKey.set(`${normalizeName(p.name)}|${p.team}`, p);

  const out: PlayerMappingEntry[] = [];
  for (const y of yahoo) {
    const yn = normalizeName(y.name);
    const exact = byKey.get(`${yn}|${y.team}`);
    if (exact) {
      out.push({ yahooId: y.yahooId, nbaId: exact.nbaId, name: y.name, matchedBy: "exact" });
      continue;
    }
    // Fuzzy: same team, name within FUZZY_MAX_DISTANCE.
    let best: { p: NbaPlayer; d: number } | null = null;
    for (const p of nba) {
      if (p.team !== y.team) continue;
      const d = editDistance(yn, normalizeName(p.name));
      if (d <= FUZZY_MAX_DISTANCE && (best === null || d < best.d)) best = { p, d };
    }
    if (best) {
      out.push({ yahooId: y.yahooId, nbaId: best.p.nbaId, name: y.name, matchedBy: "fuzzy" });
    }
  }
  return out;
}

const STORAGE_KEY = (season: SeasonString) => `fnba.mapping.${season}`;

export async function saveMapping(season: SeasonString, entries: PlayerMappingEntry[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY(season)]: entries });
}

export async function loadMapping(season: SeasonString): Promise<PlayerMappingEntry[]> {
  const r = await chrome.storage.local.get(STORAGE_KEY(season));
  const v = r[STORAGE_KEY(season)];
  return Array.isArray(v) ? (v as PlayerMappingEntry[]) : [];
}
```

- [ ] **Step 10.4: Run, verify pass**

Run: `npm test -- playerMapping`
Expected: PASS — 7 tests pass.

- [ ] **Step 10.5: Commit**

```bash
git add src/background/playerMapping.ts test/unit/playerMapping.test.ts
git commit -m "feat(bg): player ID mapping matcher + persistence"
```

---

## Task 11: Service worker entry — wire it all together

**Files:**
- Create: `src/background/index.ts`

This is the only file in Plan 1 that doesn't have a unit test — it's wiring. Verification is the **manual smoke test** at the end of the plan.

- [ ] **Step 11.1: Write `src/background/index.ts`**

```ts
import { Cache } from "./cache.js";
import { Throttle, ThrottledError } from "./throttle.js";
import { fetchLeagueDashPlayerStats, RateLimitedError, UpstreamUnavailableError } from "./nbaClient.js";
import { loadMapping } from "./playerMapping.js";
import { currentSeason } from "./season.js";
import { perModeByKey } from "../shared/perModes.js";
import { windowByKey } from "../shared/windows.js";
import { ADVANCED_COLUMNS, BASE_OVERRIDE_COLUMNS } from "../shared/columns.js";
import {
  isGetPlayerStatsRequest,
  type ErrorResponse,
  type GetPlayerStatsRequest,
  type GetPlayerStatsResponse,
  type Response as MsgResponse,
} from "../shared/messages.js";
import type { PlayerStatRow, YahooPlayerId } from "../shared/types.js";
import { log } from "../shared/logger.js";

const cache = new Cache({ dbName: "fnba", defaultTtlMs: 6 * 60 * 60 * 1000 });
const throttle = new Throttle({ intervalMs: 1100, cooldownMs: 60_000 });

const cacheKey = (req: GetPlayerStatsRequest, measure: "Base" | "Advanced", season: string): string =>
  `lps:${season}:${measure}:${req.perMode}:${windowByKey(req.window).lastNGames}`;

async function fetchWithCache(
  req: GetPlayerStatsRequest,
  measure: "Base" | "Advanced",
  season: string,
): Promise<PlayerStatRow[]> {
  const key = cacheKey(req, measure, season);
  if (!req.forceFresh) {
    const hit = await cache.get<PlayerStatRow[]>(key);
    if (hit) return hit;
  }
  const rows = await throttle.run(() =>
    fetchLeagueDashPlayerStats({
      season,
      measureType: measure,
      perMode: perModeByKey(req.perMode).apiValue as GetPlayerStatsRequest["perMode"],
      lastNGames: windowByKey(req.window).lastNGames,
    }),
  );
  await cache.set(key, rows);
  return rows;
}

async function handleGetPlayerStats(req: GetPlayerStatsRequest): Promise<MsgResponse> {
  try {
    const season = currentSeason();
    const mapping = await loadMapping(season);
    const yahooToNba = new Map(mapping.map((m) => [m.yahooId, m.nbaId]));

    const [base, adv] = await Promise.all([
      fetchWithCache(req, "Base", season),
      fetchWithCache(req, "Advanced", season),
    ]);
    const byNbaId = new Map<number, PlayerStatRow>();
    for (const row of base) byNbaId.set(row.nbaId, { ...row, stats: { ...row.stats } });
    for (const row of adv) {
      const existing = byNbaId.get(row.nbaId);
      if (existing) Object.assign(existing.stats, row.stats);
      else byNbaId.set(row.nbaId, row);
    }

    const byYahooId: Record<YahooPlayerId, PlayerStatRow | null> = {};
    for (const yahooId of req.yahooIds) {
      const nbaId = yahooToNba.get(yahooId);
      byYahooId[yahooId] = nbaId ? byNbaId.get(nbaId) ?? null : null;
    }

    const response: GetPlayerStatsResponse = {
      type: "getPlayerStatsResponse",
      byYahooId,
      fetchedAt: Date.now(),
    };
    return response;
  } catch (e) {
    if (e instanceof RateLimitedError || e instanceof ThrottledError) {
      throttle.triggerCooldown();
      const r: ErrorResponse = { type: "error", code: "RATE_LIMITED", message: String(e) };
      return r;
    }
    if (e instanceof UpstreamUnavailableError) {
      return { type: "error", code: "UPSTREAM_UNAVAILABLE", message: String(e) };
    }
    log.error("handleGetPlayerStats", e);
    return { type: "error", code: "UNKNOWN", message: String(e) };
  }
}

// Eagerly open the cache so first request is fast.
void cache.open();

// Expose configs to the SW console for manual smoke-testing.
(globalThis as unknown as Record<string, unknown>).fnba = {
  ADVANCED_COLUMNS,
  BASE_OVERRIDE_COLUMNS,
  cache,
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (isGetPlayerStatsRequest(msg)) {
    void handleGetPlayerStats(msg).then(sendResponse);
    return true; // async response
  }
  sendResponse({ type: "error", code: "BAD_REQUEST", message: "unknown message" });
  return false;
});

log.info("service worker booted");
```

- [ ] **Step 11.2: Typecheck**

Run: `npm run typecheck`
Expected: pass.

- [ ] **Step 11.3: Build**

Run: `npm run build`
Expected: build succeeds, `dist/` populated.

- [ ] **Step 11.4: Commit**

```bash
git add src/background/index.ts
git commit -m "feat(bg): service worker entry — message router + handlers"
```

---

## Task 12: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 12.1: Write `.github/workflows/ci.yml`**

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: extension-dist
          path: dist/
```

- [ ] **Step 12.2: Commit**

```bash
git add .github/
git commit -m "ci: typecheck, test, build on push/PR"
```

---

## Task 13: README + manual smoke test

**Files:**
- Create: `README.md`
- Create: `docs/SMOKE.md`

- [ ] **Step 13.1: Write `README.md`**

```markdown
# fNBA

Yahoo Fantasy NBA advanced-stats overlay (Chromium MV3 extension).

Adds eFG%, TS%, USG% columns, Last 5/10 GP windows, and per-36/per-100 modes
to Yahoo Fantasy Basketball pages. Data sourced from nba.com/stats.

**Status:** Plan 1 (Foundation) complete — service worker only. UI ships in Plan 2.

## Development

```bash
npm install
npm test              # run unit tests
npm run typecheck
npm run build         # writes dist/
```

## Loading the unpacked extension

1. `npm run build`
2. Chrome → `chrome://extensions` → enable Developer mode
3. "Load unpacked" → select the `dist/` folder

## License

MIT.
```

- [ ] **Step 13.2: Write `docs/SMOKE.md`**

```markdown
# Smoke Test — Plan 1

Run this manually after a `npm run build` + load-unpacked, before tagging a Plan 1 release.

## 1. Service worker starts cleanly

- Open `chrome://extensions`, find fNBA, click "service worker" link.
- DevTools console: expect `[fNBA] service worker booted`.

## 2. nba.com/stats fetch succeeds (no mapping yet)

In the SW console:

```js
await chrome.runtime.sendMessage({
  type: "getPlayerStats",
  yahooIds: ["unknown"],
  window: "Season",
  perMode: "PerGame",
});
```

Expected:
- `{type: "getPlayerStatsResponse", byYahooId: {unknown: null}, fetchedAt: <ms>}`
- Network tab shows a 200 response from `stats.nba.com/stats/leaguedashplayerstats`.
- Repeating the call within 6h hits cache (no new network request).

## 3. Force-fresh bypasses cache

```js
await chrome.runtime.sendMessage({
  type: "getPlayerStats", yahooIds: [], window: "Last5", perMode: "Per36", forceFresh: true,
});
```

Expected: new network request even if the previous Last5+Per36 call was cached.

## 4. Bad request gracefully rejected

```js
await chrome.runtime.sendMessage({ type: "garbage" });
```

Expected: `{type: "error", code: "BAD_REQUEST", ...}`.

## 5. Manual mapping smoke

```js
const { saveMapping } = await import(chrome.runtime.getURL("assets/playerMapping.js"));
// Easier: open the SW source map, set a breakpoint, or copy from src.
// Goal: store one entry, then re-run the call from step 2 with the matching yahooId.
```

Expected: the previously-`null` entry now contains a populated `PlayerStatRow`.
```

- [ ] **Step 13.3: Commit**

```bash
git add README.md docs/SMOKE.md
git commit -m "docs: README + Plan 1 smoke test"
```

---

## Verifiable output check

After Task 13, you should be able to:

1. `npm run build` cleanly produces `dist/`.
2. Load `dist/` as an unpacked extension in Chrome with no manifest errors.
3. Open the service worker DevTools and see `[fNBA] service worker booted`.
4. Send a `getPlayerStats` message and get real nba.com numbers back.
5. `npm test` passes (the count should be ≥ 21 unit tests across cache, throttle, nbaClient, playerMapping, messages, season, sanity).
6. CI is green on push.

If any of those fail, fix before moving to Plan 2.

---

## Self-review notes (author)

- **Spec coverage:** SW + cache + mapping algorithm + nba.com client + header rules + message API + CI — all covered. Spec items NOT in this plan (intentionally deferred to Plan 2/3): Yahoo player-list bootstrap, content script, filter bar, column injection, tooltip, options page, refresh button UI, error toasts. The mapping bootstrap is the only piece some readers might expect here — confirmed deferred because it requires DOM scraping on a Yahoo page that only the content script can reach.
- **Placeholder scan:** no TODO/TBD strings in implementation steps. Future-work items live only in the spec, not here.
- **Type consistency:** `WindowKey`, `PerModeKey`, `PlayerStatRow`, `PlayerMappingEntry`, `YahooPlayerId`, `SeasonString` defined in Task 3 and used identically downstream. Message-contract names (`GetPlayerStatsRequest`, `getPlayerStats`) consistent across Tasks 4 and 11.
