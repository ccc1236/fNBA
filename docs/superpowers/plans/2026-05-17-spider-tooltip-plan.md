# Spider tooltip implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the hover/click spider-radar tooltip described in `docs/superpowers/specs/2026-05-17-spider-tooltip-design.md`. A 9-axis radar overlays Season/L10/L5 polygons on league-percentile scale; raw stat values stack next to each axis.

**Architecture:** SW adds a new `getSpiderData` message handler that lazily ensures league responses for all three windows at the active per-mode, computes a percentile rank table per (window, perMode), and returns a SpiderData payload. The content script mounts a single tooltip controller per page that delegates hover and click events on player anchors, fetches data on demand, and renders a pure-SVG radar chart inside a shadow-DOM card.

**Tech Stack:** TypeScript strict + noUncheckedIndexedAccess, Vite + @crxjs/vite-plugin, Vanilla shadow-DOM components, Vitest with jsdom + fake-indexeddb.

---

## File map

New:
- `src/shared/spider.ts` — types and type guards
- `src/shared/spiderAxes.ts` — 9-axis config (ordering, labels, inversion, formatters)
- `src/background/percentiles.ts` — rank-table builder, league-wide percentile per stat
- `src/background/spiderService.ts` — SW handler that builds SpiderData
- `src/ui/spider-chart.ts` — pure SVG renderer (data in, SVG element out)
- `src/ui/spider-tooltip.ts` — controller: hover delegation, pin lifecycle, state machine
- `test/unit/spiderAxes.test.ts`
- `test/unit/percentiles.test.ts`
- `test/unit/spiderService.test.ts`
- `test/unit/spider-chart.test.ts`
- `test/unit/spider-tooltip.test.ts`

Modified:
- `src/shared/messages.ts` — add SpiderRequest / SpiderResponse to the union, add guard
- `src/background/index.ts` — wire the SW handler; expose on `globalThis.fnba`
- `src/pages/players.ts` — mount the tooltip controller, propagate per-mode changes
- `docs/SMOKE.md` — add tooltip checklist
- `test/unit/messages.test.ts` — cover the new guard

---

## Task 1: Spider stat-key types and axis config

**Files:**
- Create: `src/shared/spider.ts`
- Create: `src/shared/spiderAxes.ts`
- Create: `test/unit/spiderAxes.test.ts`

- [ ] **Step 1: Write the failing test**

`test/unit/spiderAxes.test.ts`:

```ts
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

  it("renders USG_PCT as a 1-decimal percentage (nba.com already returns it on the 0-100 scale)", () => {
    expect(formatAxisValue("USG_PCT", 28.4)).toBe("28.4");
  });

  it("renders null as a dash", () => {
    expect(formatAxisValue("PTS", null)).toBe("—");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- --run test/unit/spiderAxes.test.ts
```

Expected: module-not-found error.

- [ ] **Step 3: Write minimal implementation**

`src/shared/spider.ts`:

```ts
import type { PerModeKey, YahooPlayerId } from "./types.js";

export type SpiderStatKey =
  | "PTS"
  | "REB"
  | "AST"
  | "STL"
  | "BLK"
  | "FG3M"
  | "TOV"
  | "TS_PCT"
  | "USG_PCT";

/** League percentile (0..100) per stat key. */
export type PercentileRecord = Partial<Record<SpiderStatKey, number>>;

export interface WindowSlice {
  values: Partial<Record<SpiderStatKey, number>>;
  percentiles: PercentileRecord;
}

export interface SpiderData {
  name: string;
  team: string;
  position: string;
  perMode: PerModeKey;
  windows: {
    season: WindowSlice | null;
    L10: WindowSlice | null;
    L5: WindowSlice | null;
  };
}

export interface GetSpiderDataRequest {
  type: "getSpiderData";
  yahooId: YahooPlayerId;
  perMode: PerModeKey;
}

export type GetSpiderDataResponse =
  | { type: "getSpiderDataResponse"; ok: true; data: SpiderData }
  | { type: "getSpiderDataResponse"; ok: false; reason: "no-mapping" | "fetch-failed" };
```

`src/shared/spiderAxes.ts`:

```ts
import type { SpiderStatKey } from "./spider.js";

export interface SpiderAxisConfig {
  key: SpiderStatKey;
  label: string;
  /** If true, higher raw value = worse (e.g. TOV). Percentile is pre-inverted SW-side. */
  inverted: boolean;
}

/** Clockwise from 12 o'clock. Order is intentional; do not re-sort. */
export const SPIDER_AXES: readonly SpiderAxisConfig[] = [
  { key: "FG3M",    label: "3PM",  inverted: false },
  { key: "PTS",     label: "PTS",  inverted: false },
  { key: "REB",     label: "REB",  inverted: false },
  { key: "AST",     label: "AST",  inverted: false },
  { key: "STL",     label: "STL",  inverted: false },
  { key: "BLK",     label: "BLK",  inverted: false },
  { key: "TOV",     label: "TO↓",  inverted: true  },
  { key: "TS_PCT",  label: "TS%",  inverted: false },
  { key: "USG_PCT", label: "USG%", inverted: false },
];

/**
 * Format a raw stat for display next to an axis label.
 * - TS_PCT renders as `.XXX` (no leading zero).
 * - USG_PCT comes from nba.com already as a percentage number (e.g. 28.4), so render as-is with 1 decimal.
 * - Counting stats render with 1 decimal.
 * - Null renders as "—".
 */
export function formatAxisValue(key: SpiderStatKey, v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (key === "TS_PCT") {
    const s = v.toFixed(3);
    return s.startsWith("0") ? s.slice(1) : s;
  }
  return v.toFixed(1);
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npm test -- --run test/unit/spiderAxes.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/shared/spider.ts src/shared/spiderAxes.ts test/unit/spiderAxes.test.ts
git commit -m "spider: add stat-key types and 9-axis config"
```

---

## Task 2: League-percentile rank table

**Files:**
- Create: `src/background/percentiles.ts`
- Create: `test/unit/percentiles.test.ts`

- [ ] **Step 1: Write the failing test**

`test/unit/percentiles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPercentileTable } from "../../src/background/percentiles.js";
import type { PlayerStatRow } from "../../src/shared/types.js";

function row(nbaId: number, stats: Record<string, number>): PlayerStatRow {
  return { nbaId, name: `p${nbaId}`, teamAbbr: "XXX", position: null, stats };
}

describe("buildPercentileTable", () => {
  it("scores each player by their league rank per stat, 0..100", () => {
    const rows = [
      row(1, { PTS: 10, REB: 5 }),
      row(2, { PTS: 20, REB: 4 }),
      row(3, { PTS: 30, REB: 3 }),
      row(4, { PTS: 40, REB: 2 }),
    ];
    const table = buildPercentileTable(rows, ["PTS", "REB"], new Set());
    expect(table.get(1)?.PTS).toBe(25);
    expect(table.get(2)?.PTS).toBe(50);
    expect(table.get(3)?.PTS).toBe(75);
    expect(table.get(4)?.PTS).toBe(100);
  });

  it("inverts the rank for stats listed as inverted (lower raw = higher percentile)", () => {
    const rows = [
      row(1, { TOV: 1.0 }),
      row(2, { TOV: 2.0 }),
      row(3, { TOV: 3.0 }),
      row(4, { TOV: 4.0 }),
    ];
    const table = buildPercentileTable(rows, ["TOV"], new Set(["TOV"]));
    // 4.0 TOV is worst, so percentile = 25 (bottom)
    expect(table.get(4)?.TOV).toBe(25);
    expect(table.get(1)?.TOV).toBe(100);
  });

  it("gives tied players the same percentile (average rank rule)", () => {
    const rows = [row(1, { PTS: 10 }), row(2, { PTS: 20 }), row(3, { PTS: 20 }), row(4, { PTS: 30 })];
    const table = buildPercentileTable(rows, ["PTS"], new Set());
    // Tied rank_asc = (2 + 3) / 2 = 2.5. Non-inverted percentile = 100 * 2.5 / 4 = 62.5.
    expect(table.get(2)?.PTS).toBe(62.5);
    expect(table.get(3)?.PTS).toBe(62.5);
  });

  it("returns null when a player's stat is missing or NaN", () => {
    const rows = [row(1, { PTS: 10 }), row(2, { PTS: NaN }), row(3, {})];
    const table = buildPercentileTable(rows, ["PTS"], new Set());
    expect(table.get(2)?.PTS).toBeUndefined();
    expect(table.get(3)?.PTS).toBeUndefined();
  });

  it("returns an empty table for an empty roster", () => {
    expect(buildPercentileTable([], ["PTS"], new Set()).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- --run test/unit/percentiles.test.ts
```

Expected: module-not-found error.

- [ ] **Step 3: Write minimal implementation**

`src/background/percentiles.ts`:

```ts
import type { NbaPlayerId, PlayerStatRow } from "../shared/types.js";
import type { PercentileRecord, SpiderStatKey } from "../shared/spider.js";

/**
 * Build a per-player percentile table for each requested stat key.
 *
 * For each stat, players are ranked using the average-rank method for ties:
 *   averageRank = mean of the 1-indexed ranks the tied group occupies after
 *   sorting raw values ascending.
 *
 * Non-inverted stats (higher raw = better): percentile = 100 * avgRank / n
 *   The player with the highest raw value lands at percentile 100.
 *
 * Inverted stats (lower raw = better, e.g. TOV):
 *   percentile = 100 * (n + 1 - avgRank) / n
 *   The player with the lowest raw value lands at percentile 100.
 *
 * Players with a missing or NaN value for a stat are excluded from the
 * ranking and get `undefined` for that stat in the result.
 */
export function buildPercentileTable(
  rows: readonly PlayerStatRow[],
  keys: readonly SpiderStatKey[],
  invertedKeys: ReadonlySet<SpiderStatKey>,
): Map<NbaPlayerId, PercentileRecord> {
  const table = new Map<NbaPlayerId, PercentileRecord>();
  for (const r of rows) table.set(r.nbaId, {});

  for (const key of keys) {
    const inverted = invertedKeys.has(key);
    const valid: Array<{ id: NbaPlayerId; v: number }> = [];
    for (const r of rows) {
      const raw = r.stats[key];
      if (typeof raw === "number" && Number.isFinite(raw)) {
        valid.push({ id: r.nbaId, v: raw });
      }
    }
    if (valid.length === 0) continue;
    valid.sort((a, b) => a.v - b.v);

    const n = valid.length;
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && valid[j + 1]!.v === valid[i]!.v) j++;
      const avg = (i + 1 + j + 1) / 2;
      const pct = inverted
        ? Math.round(((100 * (n + 1 - avg)) / n) * 10) / 10
        : Math.round(((100 * avg) / n) * 10) / 10;
      for (let k = i; k <= j; k++) {
        table.get(valid[k]!.id)![key] = pct;
      }
      i = j + 1;
    }
  }

  return table;
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npm test -- --run test/unit/percentiles.test.ts
```

Expected: 5 tests pass. The tied-PTS test expects 62.5 because for n=4, the tied pair at raw 20 holds ranks 2 and 3 ascending, average 2.5; non-inverted percentile = 100*(4+1-2.5)/4 = 62.5.

- [ ] **Step 5: Commit**

```bash
git add src/background/percentiles.ts test/unit/percentiles.test.ts
git commit -m "spider: add league-percentile rank-table builder"
```

---

## Task 3: getSpiderData message contract

**Files:**
- Modify: `src/shared/messages.ts`
- Modify: `test/unit/messages.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/unit/messages.test.ts`:

```ts
import { isGetSpiderDataRequest } from "../../src/shared/messages.js";

describe("isGetSpiderDataRequest", () => {
  it("accepts a well-formed request", () => {
    expect(
      isGetSpiderDataRequest({
        type: "getSpiderData",
        yahooId: "5583",
        perMode: "PerGame",
      }),
    ).toBe(true);
  });

  it("rejects requests with the wrong type", () => {
    expect(isGetSpiderDataRequest({ type: "other", yahooId: "1", perMode: "PerGame" })).toBe(false);
  });

  it("rejects requests with a missing or non-string yahooId", () => {
    expect(isGetSpiderDataRequest({ type: "getSpiderData", perMode: "PerGame" })).toBe(false);
    expect(isGetSpiderDataRequest({ type: "getSpiderData", yahooId: 1, perMode: "PerGame" })).toBe(false);
  });

  it("rejects requests with an unknown perMode", () => {
    expect(
      isGetSpiderDataRequest({ type: "getSpiderData", yahooId: "1", perMode: "Bogus" }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- --run test/unit/messages.test.ts
```

Expected: `isGetSpiderDataRequest is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/shared/messages.ts`:

```ts
import type {
  GetSpiderDataRequest,
  GetSpiderDataResponse,
} from "./spider.js";

export type { GetSpiderDataRequest, GetSpiderDataResponse } from "./spider.js";

export function isGetSpiderDataRequest(v: unknown): v is GetSpiderDataRequest {
  if (!isObject(v)) return false;
  if (v.type !== "getSpiderData") return false;
  if (typeof v.yahooId !== "string") return false;
  if (typeof v.perMode !== "string" || !(PER_MODE_KEYS as readonly string[]).includes(v.perMode)) {
    return false;
  }
  return true;
}
```

Update the `AnyRequest` and `AnyResponse` aliases at the bottom of the file:

```ts
export type AnyRequest = GetPlayerStatsRequest | BootstrapPlayersRequest | GetSpiderDataRequest;
export type AnyResponse =
  | GetPlayerStatsResponse
  | BootstrapPlayersResponse
  | GetSpiderDataResponse
  | ErrorResponse;
```

- [ ] **Step 4: Run test to verify it passes**

```
npm test -- --run test/unit/messages.test.ts
```

Expected: 4 new tests pass; existing tests remain green.

- [ ] **Step 5: Commit**

```bash
git add src/shared/messages.ts test/unit/messages.test.ts
git commit -m "spider: add getSpiderData message contract and guard"
```

---

## Task 4: SW spider service

**Files:**
- Create: `src/background/spiderService.ts`
- Create: `test/unit/spiderService.test.ts`

This task implements the orchestrator. It depends on:
- a Yahoo→NBA mapping lookup (existing)
- a way to fetch the merged Base+Advanced league rows for a (window, perMode) combo (factored out from `index.ts`)
- the percentile builder (Task 2)

Refactor the per-window fetch out of `index.ts` so the service can call it directly. Then build SpiderData from the three windows.

- [ ] **Step 1: Write the failing test**

`test/unit/spiderService.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildSpiderData } from "../../src/background/spiderService.js";
import type { PlayerStatRow } from "../../src/shared/types.js";

function row(nbaId: number, name: string, team: string, stats: Record<string, number>): PlayerStatRow {
  return { nbaId, name, teamAbbr: team, position: "SG", stats };
}

describe("buildSpiderData", () => {
  it("returns no-mapping when the Yahoo id is unknown", async () => {
    const out = await buildSpiderData({
      yahooId: "999",
      perMode: "PerGame",
      mapping: new Map(),
      fetchMergedForWindow: vi.fn(),
    });
    expect(out).toEqual({ ok: false, reason: "no-mapping" });
  });

  it("returns fetch-failed when any of the 3 windows throws", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce([row(1, "x", "XXX", { PTS: 20 })])
      .mockRejectedValueOnce(new Error("nba 503"));
    const out = await buildSpiderData({
      yahooId: "5",
      perMode: "PerGame",
      mapping: new Map([["5", 1]]),
      fetchMergedForWindow: fetcher,
    });
    expect(out).toEqual({ ok: false, reason: "fetch-failed" });
  });

  it("returns ok=true with all three slices when fetches succeed", async () => {
    const player = (pts: number) =>
      row(1, "A. Player", "PHX", {
        PTS: pts,
        REB: 5, AST: 5, STL: 1, BLK: 0.5, FG3M: 2, TOV: 2, TS_PCT: 0.58, USG_PCT: 25,
      });
    const opp = (pts: number) =>
      row(2, "B. Other", "LAL", {
        PTS: pts,
        REB: 4, AST: 4, STL: 1, BLK: 0.5, FG3M: 1, TOV: 2, TS_PCT: 0.55, USG_PCT: 22,
      });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce([player(20), opp(10)]) // Season
      .mockResolvedValueOnce([player(24), opp(10)]) // L10
      .mockResolvedValueOnce([player(28), opp(10)]); // L5

    const out = await buildSpiderData({
      yahooId: "5",
      perMode: "PerGame",
      mapping: new Map([["5", 1]]),
      fetchMergedForWindow: fetcher,
    });

    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("unreachable");
    expect(out.data.name).toBe("A. Player");
    expect(out.data.team).toBe("PHX");
    expect(out.data.perMode).toBe("PerGame");
    expect(out.data.windows.season?.values.PTS).toBe(20);
    expect(out.data.windows.L10?.values.PTS).toBe(24);
    expect(out.data.windows.L5?.values.PTS).toBe(28);
    // 2 players, "A. Player" leads in PTS in all windows → 100th percentile
    expect(out.data.windows.season?.percentiles.PTS).toBe(100);
    expect(out.data.windows.L5?.percentiles.PTS).toBe(100);
  });

  it("returns null for a window when the player isn't in that window's rows", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce([row(1, "A", "PHX", { PTS: 20 })]) // Season
      .mockResolvedValueOnce([row(1, "A", "PHX", { PTS: 24 })]) // L10
      .mockResolvedValueOnce([row(2, "B", "LAL", { PTS: 10 })]); // L5 (player absent)
    const out = await buildSpiderData({
      yahooId: "5",
      perMode: "PerGame",
      mapping: new Map([["5", 1]]),
      fetchMergedForWindow: fetcher,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("unreachable");
    expect(out.data.windows.L5).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- --run test/unit/spiderService.test.ts
```

Expected: module-not-found error.

- [ ] **Step 3: Write minimal implementation**

`src/background/spiderService.ts`:

```ts
import type { NbaPlayerId, PerModeKey, PlayerStatRow, WindowKey, YahooPlayerId } from "../shared/types.js";
import type { GetSpiderDataResponse, SpiderData, SpiderStatKey, WindowSlice } from "../shared/spider.js";
import { buildPercentileTable } from "./percentiles.js";

const SPIDER_KEYS: readonly SpiderStatKey[] = [
  "PTS", "REB", "AST", "STL", "BLK", "FG3M", "TOV", "TS_PCT", "USG_PCT",
];
const INVERTED: ReadonlySet<SpiderStatKey> = new Set(["TOV"]);

const WINDOW_TRIPLE: ReadonlyArray<{ slot: keyof SpiderData["windows"]; window: WindowKey }> = [
  { slot: "season", window: "Season" },
  { slot: "L10", window: "Last10" },
  { slot: "L5", window: "Last5" },
];

export interface BuildSpiderDataArgs {
  yahooId: YahooPlayerId;
  perMode: PerModeKey;
  mapping: ReadonlyMap<YahooPlayerId, NbaPlayerId>;
  fetchMergedForWindow: (window: WindowKey, perMode: PerModeKey) => Promise<readonly PlayerStatRow[]>;
}

export async function buildSpiderData(args: BuildSpiderDataArgs): Promise<GetSpiderDataResponse> {
  const nbaId = args.mapping.get(args.yahooId);
  if (nbaId === undefined) {
    return { type: "getSpiderDataResponse", ok: false, reason: "no-mapping" };
  }

  let meta: { name: string; team: string; position: string } | null = null;
  const windows: SpiderData["windows"] = { season: null, L10: null, L5: null };

  try {
    for (const { slot, window } of WINDOW_TRIPLE) {
      const rows = await args.fetchMergedForWindow(window, args.perMode);
      const me = rows.find((r) => r.nbaId === nbaId);
      if (!me) {
        windows[slot] = null;
        continue;
      }
      if (!meta) {
        meta = { name: me.name, team: me.teamAbbr, position: me.position ?? "" };
      }
      const ranks = buildPercentileTable(rows, SPIDER_KEYS, INVERTED);
      windows[slot] = sliceFor(me, ranks.get(me.nbaId) ?? {});
    }
  } catch {
    return { type: "getSpiderDataResponse", ok: false, reason: "fetch-failed" };
  }

  if (!meta) {
    // Player was in the mapping but absent from all three windows. Treat as
    // a fetch failure rather than partial success.
    return { type: "getSpiderDataResponse", ok: false, reason: "fetch-failed" };
  }

  const data: SpiderData = {
    name: meta.name,
    team: meta.team,
    position: meta.position,
    perMode: args.perMode,
    windows,
  };
  return { type: "getSpiderDataResponse", ok: true, data };
}

function sliceFor(row: PlayerStatRow, pct: Partial<Record<SpiderStatKey, number>>): WindowSlice {
  const values: WindowSlice["values"] = {};
  for (const k of SPIDER_KEYS) {
    const v = row.stats[k];
    if (typeof v === "number" && Number.isFinite(v)) values[k] = v;
  }
  return { values, percentiles: pct };
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npm test -- --run test/unit/spiderService.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/background/spiderService.ts test/unit/spiderService.test.ts
git commit -m "spider: add SW service that orchestrates 3-window fetch and percentiles"
```

---

## Task 5: Wire SW handler

**Files:**
- Modify: `src/background/index.ts`

This task connects the existing per-window fetch path to `buildSpiderData` and registers the `getSpiderData` handler with `chrome.runtime.onMessage`. No new unit tests; covered by SMOKE.

- [ ] **Step 1: Refactor the existing fetch to be reusable**

In `src/background/index.ts`, extract a `fetchMergedForWindow(window, perMode)` helper that calls `fetchWithCache` for Base and Advanced and runs them through `mergeBaseAndAdvanced`. Both `handleGetPlayerStats` and the new spider handler will use it.

Replace the relevant section so it reads:

```ts
async function fetchMergedForWindow(
  window: WindowKey,
  perMode: PerModeKey,
): Promise<PlayerStatRow[]> {
  const season = currentSeason();
  const req: GetPlayerStatsRequest = {
    type: "getPlayerStats",
    yahooIds: [],
    window,
    perMode,
  };
  const [base, adv] = await Promise.all([
    fetchWithCache(req, "Base", season),
    fetchWithCache(req, "Advanced", season),
  ]);
  return Array.from(mergeBaseAndAdvanced(base, adv).values());
}
```

Add `WindowKey` and `PerModeKey` to the imports from `../shared/types.js`. Update `handleGetPlayerStats` to call `fetchMergedForWindow(req.window, req.perMode)` and then build the `byYahooId` map from the result (drop the inlined Promise.all + merge).

- [ ] **Step 2: Add the spider handler**

In `src/background/index.ts`:

```ts
import { buildSpiderData } from "./spiderService.js";
import {
  isGetSpiderDataRequest,
  type GetSpiderDataRequest,
  type GetSpiderDataResponse,
} from "../shared/messages.js";

async function handleGetSpiderData(
  req: GetSpiderDataRequest,
): Promise<GetSpiderDataResponse | ErrorResponse> {
  try {
    const season = currentSeason();
    const mapping = await loadMapping(season);
    const map = new Map(mapping.map((m) => [m.yahooId, m.nbaId]));
    return await buildSpiderData({
      yahooId: req.yahooId,
      perMode: req.perMode,
      mapping: map,
      fetchMergedForWindow,
    });
  } catch (e) {
    if (e instanceof RateLimitedError || e instanceof ThrottledError) {
      throttle.triggerCooldown();
      return { type: "error", code: "RATE_LIMITED", message: String(e) };
    }
    if (e instanceof UpstreamUnavailableError) {
      return { type: "error", code: "UPSTREAM_UNAVAILABLE", message: String(e) };
    }
    log.error("handleGetSpiderData", e);
    return { type: "error", code: "UNKNOWN", message: String(e) };
  }
}
```

Register it in the message dispatcher:

```ts
if (isGetSpiderDataRequest(msg)) {
  void handleGetSpiderData(msg).then(sendResponse);
  return true;
}
```

Expose it for SW DevTools smoke testing:

```ts
(globalThis as unknown as Record<string, unknown>).fnba = {
  // ...existing fields...
  getSpiderData: handleGetSpiderData,
};
```

- [ ] **Step 3: Verify typecheck and existing tests pass**

```
npm run typecheck
npm test -- --run
```

Expected: typecheck clean, all existing tests still green.

- [ ] **Step 4: Commit**

```bash
git add src/background/index.ts
git commit -m "spider: register SW handler for getSpiderData"
```

---

## Task 6: Spider chart renderer

**Files:**
- Create: `src/ui/spider-chart.ts`
- Create: `test/unit/spider-chart.test.ts`

This is a pure function: takes a `SpiderData` (or null for loading state) and returns an `SVGSVGElement` rendered per the v6 mockup geometry.

- [ ] **Step 1: Write the failing test**

`test/unit/spider-chart.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderSpiderChart } from "../../src/ui/spider-chart.js";
import type { SpiderData } from "../../src/shared/spider.js";

const fullData: SpiderData = {
  name: "Test Player",
  team: "PHX",
  position: "SG",
  perMode: "PerGame",
  windows: {
    season: { values: { PTS: 20, REB: 5 }, percentiles: { PTS: 65, REB: 45 } },
    L10:    { values: { PTS: 24, REB: 5.5 }, percentiles: { PTS: 78, REB: 55 } },
    L5:     { values: { PTS: 28, REB: 6 }, percentiles: { PTS: 85, REB: 62 } },
  },
};

describe("renderSpiderChart", () => {
  it("returns an SVG element", () => {
    const svg = renderSpiderChart(fullData);
    expect(svg.tagName.toLowerCase()).toBe("svg");
  });

  it("draws 5 gridline polygons, 9 spokes, and 3 data polygons", () => {
    const svg = renderSpiderChart(fullData);
    expect(svg.querySelectorAll("polygon[data-role='gridline']").length).toBe(5);
    expect(svg.querySelectorAll("line[data-role='spoke']").length).toBe(9);
    expect(svg.querySelectorAll("polygon[data-role='window']").length).toBe(3);
  });

  it("renders 9 axis labels with the configured key text", () => {
    const svg = renderSpiderChart(fullData);
    const keys = Array.from(svg.querySelectorAll<SVGTextElement>("text[data-role='axis-key']"));
    expect(keys.map((k) => k.textContent)).toEqual([
      "3PM", "PTS", "REB", "AST", "STL", "BLK", "TO↓", "TS%", "USG%",
    ]);
  });

  it("omits a window's polygon when that slice is null", () => {
    const data = { ...fullData, windows: { ...fullData.windows, L5: null } };
    const svg = renderSpiderChart(data);
    const polys = svg.querySelectorAll("polygon[data-role='window']");
    expect(polys.length).toBe(2);
    // None should be tagged data-window="L5"
    expect(svg.querySelector('polygon[data-window="L5"]')).toBeNull();
  });

  it("renders a loading skeleton (no polygons, no value labels) when data is null", () => {
    const svg = renderSpiderChart(null);
    expect(svg.querySelectorAll("polygon[data-role='window']").length).toBe(0);
    expect(svg.querySelector("text[data-role='loading']")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- --run test/unit/spider-chart.test.ts
```

Expected: module-not-found error.

- [ ] **Step 3: Write minimal implementation**

`src/ui/spider-chart.ts`:

```ts
import { SPIDER_AXES, formatAxisValue } from "../shared/spiderAxes.js";
import type { SpiderData, WindowSlice, SpiderStatKey } from "../shared/spider.js";

const NS = "http://www.w3.org/2000/svg";

const WIDTH = 332;
const HEIGHT = 370;
const CX = 166;
const CY = 186;
const R = 100;

const COLORS = {
  season: { stroke: "#9CA3AF", fillOpacity: 0.18, strokeOpacity: 0.55 },
  L10:    { stroke: "#0ABAB5", fillOpacity: 0.22, strokeOpacity: 0.70 },
  L5:     { stroke: "#F59E0B", fillOpacity: 0.30, strokeOpacity: 0.90 },
} as const;

type WindowSlot = keyof SpiderData["windows"];
const SLOTS: readonly WindowSlot[] = ["season", "L10", "L5"];

function angle(i: number): number {
  return (-90 + (360 / SPIDER_AXES.length) * i) * Math.PI / 180;
}
function point(i: number, r: number): [number, number] {
  const a = angle(i);
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

export function renderSpiderChart(data: SpiderData | null): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", String(WIDTH));
  svg.setAttribute("height", String(HEIGHT));
  svg.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);

  // Gridlines
  for (const ring of [20, 40, 60, 80, 100]) {
    const pts: string[] = [];
    for (let i = 0; i < SPIDER_AXES.length; i++) {
      const [x, y] = point(i, R * ring / 100);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    const poly = document.createElementNS(NS, "polygon");
    poly.setAttribute("points", pts.join(" "));
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke", ring === 100 ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.08)");
    poly.setAttribute("stroke-width", "1");
    poly.setAttribute("data-role", "gridline");
    svg.appendChild(poly);
  }

  // Spokes
  for (let i = 0; i < SPIDER_AXES.length; i++) {
    const [x, y] = point(i, R);
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", String(CX));
    line.setAttribute("y1", String(CY));
    line.setAttribute("x2", x.toFixed(1));
    line.setAttribute("y2", y.toFixed(1));
    line.setAttribute("stroke", "rgba(255,255,255,.08)");
    line.setAttribute("stroke-width", "1");
    line.setAttribute("data-role", "spoke");
    svg.appendChild(line);
  }

  if (data === null) {
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", String(CX));
    t.setAttribute("y", String(CY));
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("fill", "#9CA3AF");
    t.setAttribute("font-size", "12");
    t.setAttribute("data-role", "loading");
    t.textContent = "loading...";
    svg.appendChild(t);
    return svg;
  }

  // Data polygons (Season under L10 under L5)
  for (const slot of SLOTS) {
    const slice = data.windows[slot];
    if (!slice) continue;
    const pts: string[] = [];
    for (let i = 0; i < SPIDER_AXES.length; i++) {
      const key = SPIDER_AXES[i]!.key;
      const pct = slice.percentiles[key];
      const r = R * ((typeof pct === "number" && Number.isFinite(pct)) ? pct : 0) / 100;
      const [x, y] = point(i, r);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    const poly = document.createElementNS(NS, "polygon");
    poly.setAttribute("points", pts.join(" "));
    const c = COLORS[slot];
    poly.setAttribute("fill", c.stroke);
    poly.setAttribute("fill-opacity", String(c.fillOpacity));
    poly.setAttribute("stroke", c.stroke);
    poly.setAttribute("stroke-opacity", String(c.strokeOpacity));
    poly.setAttribute("stroke-width", "1.5");
    poly.setAttribute("stroke-linejoin", "round");
    poly.setAttribute("data-role", "window");
    poly.setAttribute("data-window", slot);
    svg.appendChild(poly);
  }

  // Axis labels (key + 3 raw values stacked below)
  for (let i = 0; i < SPIDER_AXES.length; i++) {
    const a = angle(i);
    const sinA = Math.sin(a);
    const verticalBoost = sinA < 0 ? Math.abs(sinA) * 30 : 0;
    const labelRadius = R + 18 + verticalBoost;
    const labelX = CX + labelRadius * Math.cos(a);
    const labelY = CY + labelRadius * Math.sin(a);

    let anchor: "start" | "end" | "middle" = "middle";
    if (Math.cos(a) > 0.3) anchor = "start";
    else if (Math.cos(a) < -0.3) anchor = "end";

    const key = document.createElementNS(NS, "text");
    key.setAttribute("x", labelX.toFixed(1));
    key.setAttribute("y", labelY.toFixed(1));
    key.setAttribute("text-anchor", anchor);
    key.setAttribute("fill", "#E5E7EB");
    key.setAttribute("font-size", "11");
    key.setAttribute("font-weight", "600");
    key.setAttribute("data-role", "axis-key");
    key.textContent = SPIDER_AXES[i]!.label;
    svg.appendChild(key);

    const valueRows: Array<{ slot: WindowSlot; bold: boolean }> = [
      { slot: "season", bold: false },
      { slot: "L10", bold: false },
      { slot: "L5", bold: true },
    ];
    valueRows.forEach((vr, idx) => {
      const slice: WindowSlice | null = data.windows[vr.slot];
      const raw = slice?.values[SPIDER_AXES[i]!.key as SpiderStatKey];
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", labelX.toFixed(1));
      t.setAttribute("y", (labelY + 12 + idx * 11).toFixed(1));
      t.setAttribute("text-anchor", anchor);
      t.setAttribute("fill", COLORS[vr.slot].stroke);
      t.setAttribute("font-size", "10");
      t.setAttribute("font-weight", vr.bold ? "600" : "400");
      t.setAttribute("data-role", "axis-value");
      t.setAttribute("data-window", vr.slot);
      t.textContent = formatAxisValue(SPIDER_AXES[i]!.key as SpiderStatKey, raw ?? null);
      svg.appendChild(t);
    });
  }

  return svg;
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npm test -- --run test/unit/spider-chart.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/spider-chart.ts test/unit/spider-chart.test.ts
git commit -m "spider: add pure-SVG radar chart renderer"
```

---

## Task 7: Spider tooltip controller

**Files:**
- Create: `src/ui/spider-tooltip.ts`
- Create: `test/unit/spider-tooltip.test.ts`

The controller owns the lifecycle: hover delegation with 300ms preview timer, click-to-pin, ESC and outside-click dismissal, single-pin invariant, refetch on per-mode change. It uses `chrome.runtime.sendMessage` to talk to the SW.

- [ ] **Step 1: Write the failing test**

`test/unit/spider-tooltip.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpiderTooltipController } from "../../src/ui/spider-tooltip.js";
import type { GetSpiderDataResponse, SpiderData } from "../../src/shared/spider.js";

function makeRow(yahooId: string): { table: HTMLTableElement; anchor: HTMLAnchorElement } {
  const table = document.createElement("table");
  const tbody = document.createElement("tbody");
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  const a = document.createElement("a");
  a.setAttribute("data-ys-playerid", yahooId);
  a.setAttribute("href", `/nba/players/${yahooId}/`);
  a.textContent = "Player Name";
  td.appendChild(a);
  tr.appendChild(td);
  tbody.appendChild(tr);
  table.appendChild(tbody);
  return { table, anchor: a };
}

const fullData: SpiderData = {
  name: "P", team: "PHX", position: "SG", perMode: "PerGame",
  windows: {
    season: { values: { PTS: 20 }, percentiles: { PTS: 65 } },
    L10:    { values: { PTS: 24 }, percentiles: { PTS: 78 } },
    L5:     { values: { PTS: 28 }, percentiles: { PTS: 85 } },
  },
};

describe("spider tooltip controller", () => {
  let send: ReturnType<typeof vi.fn>;
  let controller: ReturnType<typeof createSpiderTooltipController>;
  let row: ReturnType<typeof makeRow>;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    row = makeRow("5583");
    document.body.appendChild(row.table);
    send = vi.fn().mockResolvedValue({
      type: "getSpiderDataResponse",
      ok: true,
      data: fullData,
    } satisfies GetSpiderDataResponse);
    controller = createSpiderTooltipController({
      table: row.table,
      send,
      getPerMode: () => "PerGame",
    });
  });
  afterEach(() => {
    controller.teardown();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  function mouseover(): void {
    row.anchor.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  }
  function mouseout(): void {
    row.anchor.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
  }
  function click(target: HTMLElement = row.anchor): void {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }

  it("does not mount a card on bare mouseover before 300ms", () => {
    mouseover();
    vi.advanceTimersByTime(200);
    expect(document.querySelector(".fnba-spider-host")).toBeNull();
  });

  it("mounts the card after 300ms and dispatches a fetch", async () => {
    mouseover();
    vi.advanceTimersByTime(300);
    await Promise.resolve(); // allow the send promise to resolve
    expect(send).toHaveBeenCalledWith({
      type: "getSpiderData",
      yahooId: "5583",
      perMode: "PerGame",
    });
    expect(document.querySelector(".fnba-spider-host")).not.toBeNull();
  });

  it("cancels the mount when mouseout happens before 300ms", () => {
    mouseover();
    vi.advanceTimersByTime(100);
    mouseout();
    vi.advanceTimersByTime(300);
    expect(document.querySelector(".fnba-spider-host")).toBeNull();
  });

  it("pinning prevents default navigation on the anchor click", () => {
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    row.anchor.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("renders 3 data polygons after a successful fetch", async () => {
    click();
    await vi.waitFor(() => {
      const host = document.querySelector(".fnba-spider-host");
      expect(host?.shadowRoot?.querySelectorAll("polygon[data-role='window']").length).toBe(3);
    });
  });

  it("ESC dismisses a pinned card", async () => {
    click();
    await vi.waitFor(() => {
      expect(document.querySelector(".fnba-spider-host")).not.toBeNull();
    });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".fnba-spider-host")).toBeNull();
  });

  it("opening a second pin dismisses the first", async () => {
    const row2 = makeRow("9999");
    row.table.querySelector("tbody")!.appendChild(row2.anchor.closest("tr")!);
    click();
    await vi.waitFor(() => expect(document.querySelectorAll(".fnba-spider-host").length).toBe(1));
    click(row2.anchor);
    await vi.waitFor(() => expect(document.querySelectorAll(".fnba-spider-host").length).toBe(1));
  });

  it("shows a 'no mapping' message when the SW responds with reason=no-mapping", async () => {
    send.mockResolvedValueOnce({
      type: "getSpiderDataResponse",
      ok: false,
      reason: "no-mapping",
    } satisfies GetSpiderDataResponse);
    click();
    await vi.waitFor(() => {
      const host = document.querySelector(".fnba-spider-host");
      expect(host?.shadowRoot?.textContent ?? "").toContain("No NBA mapping");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- --run test/unit/spider-tooltip.test.ts
```

Expected: module-not-found error.

- [ ] **Step 3: Write minimal implementation**

`src/ui/spider-tooltip.ts`:

```ts
import { renderSpiderChart } from "./spider-chart.js";
import type {
  GetSpiderDataRequest,
  GetSpiderDataResponse,
  SpiderData,
} from "../shared/spider.js";
import type { PerModeKey } from "../shared/types.js";

const HOVER_DELAY_MS = 300;
const HOST_CLASS = "fnba-spider-host";

const STYLES = `
  :host { position: absolute; z-index: 2147483600; }
  .card {
    width: 340px;
    background: #1F3645;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,.25);
    color: #E5E7EB;
    font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
    overflow: hidden;
  }
  .header {
    display: flex; align-items: flex-start; justify-content: space-between;
    padding: 12px 14px 6px;
    border-bottom: 1px solid rgba(255,255,255,.08);
  }
  .name { font-weight: 600; font-size: 14px; }
  .sub  { color: #9CA3AF; font-size: 11px; margin-top: 1px; }
  .close {
    background: none; border: none; color: #9CA3AF;
    font-size: 18px; cursor: pointer; line-height: 1; padding: 0; margin-top: -2px;
  }
  .body { padding: 8px 4px 4px; }
  .legend {
    display: flex; justify-content: center; gap: 14px;
    padding: 0 14px 12px; font-size: 11px;
  }
  .legend span { display: flex; align-items: center; gap: 5px; }
  .legend i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  .legend .s { background: #9CA3AF; opacity: .5; }
  .legend .t { background: #0ABAB5; opacity: .7; }
  .legend .g { background: #F59E0B; }
  .legend [data-dim="1"] { opacity: 0.35; }
  .msg { padding: 30px 16px 26px; text-align: center; color: #E5E7EB; font-size: 12px; }
`;

export interface SpiderTooltipDeps {
  table: HTMLTableElement;
  send: (req: GetSpiderDataRequest) => Promise<GetSpiderDataResponse>;
  getPerMode: () => PerModeKey;
}

export interface SpiderTooltipHandle {
  teardown: () => void;
  /** Re-fetch and re-render the currently-open card at the new per-mode. */
  onPerModeChange: () => void;
}

interface OpenCard {
  host: HTMLDivElement;
  yahooId: string;
  pinned: boolean;
}

export function createSpiderTooltipController(deps: SpiderTooltipDeps): SpiderTooltipHandle {
  const { table } = deps;
  let openCard: OpenCard | null = null;
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  let hoveredAnchor: HTMLAnchorElement | null = null;

  function dismiss(): void {
    if (openCard) {
      openCard.host.remove();
      openCard = null;
    }
  }

  function anchorFromEvent(e: Event): HTMLAnchorElement | null {
    const t = e.target as Element | null;
    return t?.closest<HTMLAnchorElement>("a[data-ys-playerid]") ?? null;
  }

  function mount(anchor: HTMLAnchorElement, pinned: boolean): void {
    dismiss();
    const host = document.createElement("div");
    host.classList.add(HOST_CLASS);
    const r = anchor.getBoundingClientRect();
    host.style.left = `${window.scrollX + r.left}px`;
    host.style.top  = `${window.scrollY + r.bottom + 6}px`;
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${STYLES}</style>
      <div class="card">
        <div class="header">
          <div>
            <div class="name" data-role="name">${anchor.textContent?.trim() ?? ""}</div>
            <div class="sub"  data-role="sub"></div>
          </div>
          ${pinned ? '<button class="close" data-role="close">&times;</button>' : ""}
        </div>
        <div class="body" data-role="body"></div>
        <div class="legend">
          <span data-window="season"><i class="s"></i>Season</span>
          <span data-window="L10"><i class="t"></i>L10</span>
          <span data-window="L5"><i class="g"></i>L5</span>
        </div>
      </div>
    `;
    document.body.appendChild(host);

    // initial chart = loading skeleton
    const body = root.querySelector('[data-role="body"]') as HTMLElement;
    body.appendChild(renderSpiderChart(null));

    openCard = { host, yahooId: anchor.getAttribute("data-ys-playerid")!, pinned };
    if (pinned) {
      const close = root.querySelector<HTMLButtonElement>('[data-role="close"]');
      close?.addEventListener("click", dismiss);
    }
    void fetchAndRender();
  }

  async function fetchAndRender(): Promise<void> {
    if (!openCard) return;
    const yahooId = openCard.yahooId;
    let resp: GetSpiderDataResponse;
    try {
      resp = await deps.send({
        type: "getSpiderData",
        yahooId,
        perMode: deps.getPerMode(),
      });
    } catch {
      renderMessage("Stats unavailable. Retry from filter bar.");
      return;
    }
    if (!openCard || openCard.yahooId !== yahooId) return;
    if (resp.ok) renderReady(resp.data);
    else if (resp.reason === "no-mapping") renderMessage("No NBA mapping. Fix in Options.");
    else renderMessage("Stats unavailable. Retry from filter bar.");
  }

  function renderReady(data: SpiderData): void {
    if (!openCard) return;
    const root = openCard.host.shadowRoot!;
    const sub  = root.querySelector('[data-role="sub"]')  as HTMLElement;
    const name = root.querySelector('[data-role="name"]') as HTMLElement;
    name.textContent = data.name;
    sub.textContent  = `${data.team} · ${data.position} · ${perModeLabel(data.perMode)}`;
    const body = root.querySelector('[data-role="body"]') as HTMLElement;
    body.replaceChildren(renderSpiderChart(data));
    // dim legend entries for null windows
    for (const slot of ["season", "L10", "L5"] as const) {
      const el = root.querySelector(`.legend [data-window="${slot}"]`) as HTMLElement | null;
      if (el) el.dataset["dim"] = data.windows[slot] ? "0" : "1";
    }
  }

  function renderMessage(text: string): void {
    if (!openCard) return;
    const body = openCard.host.shadowRoot!.querySelector('[data-role="body"]') as HTMLElement;
    body.innerHTML = `<div class="msg">${text}</div>`;
  }

  function perModeLabel(p: PerModeKey): string {
    if (p === "PerGame") return "Per Game";
    if (p === "Per36") return "Per 36";
    return "Per 100";
  }

  // ------- Event handlers (delegated on the table) ----------

  function onMouseOver(e: Event): void {
    const a = anchorFromEvent(e);
    if (!a) return;
    if (openCard?.pinned) return;
    hoveredAnchor = a;
    if (hoverTimer !== null) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => mount(a, false), HOVER_DELAY_MS);
  }
  function onMouseOut(e: Event): void {
    const a = anchorFromEvent(e);
    if (!a) return;
    if (a !== hoveredAnchor) return;
    if (openCard?.pinned) return;
    if (hoverTimer !== null) { clearTimeout(hoverTimer); hoverTimer = null; }
    if (openCard && !openCard.pinned) dismiss();
  }
  function onClick(e: Event): void {
    const a = anchorFromEvent(e);
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    mount(a, true);
  }
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape" && openCard?.pinned) dismiss();
  }
  function onDocClick(e: Event): void {
    if (!openCard?.pinned) return;
    const t = e.target as Node;
    if (openCard.host.contains(t)) return;
    if (t instanceof Element && t.closest("a[data-ys-playerid]")) return; // re-pinning happens via onClick
    dismiss();
  }

  table.addEventListener("mouseover", onMouseOver);
  table.addEventListener("mouseout", onMouseOut);
  table.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("click", onDocClick);

  return {
    teardown: () => {
      dismiss();
      if (hoverTimer !== null) clearTimeout(hoverTimer);
      table.removeEventListener("mouseover", onMouseOver);
      table.removeEventListener("mouseout", onMouseOut);
      table.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onDocClick);
    },
    onPerModeChange: () => {
      if (openCard) void fetchAndRender();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npm test -- --run test/unit/spider-tooltip.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/spider-tooltip.ts test/unit/spider-tooltip.test.ts
git commit -m "spider: add hover/pin tooltip controller"
```

---

## Task 8: Wire the tooltip into the page module

**Files:**
- Modify: `src/pages/players.ts`

- [ ] **Step 1: Mount the controller on run, propagate per-mode changes, teardown on cleanup**

In `src/pages/players.ts`, add the import:

```ts
import { createSpiderTooltipController, type SpiderTooltipHandle } from "../ui/spider-tooltip.js";
```

Inside `run`, after the filter bar is mounted and the first paint completes, instantiate the controller:

```ts
const spider: SpiderTooltipHandle = createSpiderTooltipController({
  table,
  send: (req) => send(req),
  getPerMode: () => bar.getSettings().perMode,
});
```

Update the existing `onChange` handler to notify the controller when the per-mode (but not window) changes:

```ts
const onChange = async (e: Event): Promise<void> => {
  const ce = e as CustomEvent<FilterSettings>;
  const prev = settings;
  settings = ce.detail;
  await paint(table, bar, settings);
  if (prev.perMode !== settings.perMode) spider.onPerModeChange();
};
```

Add the controller's teardown to the returned `teardown`:

```ts
return {
  teardown: () => {
    spider.teardown();
    restoreScroll();
    // ...existing teardown body...
  },
};
```

- [ ] **Step 2: Run tests and typecheck**

```
npm run typecheck
npm test -- --run
```

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/pages/players.ts
git commit -m "spider: mount tooltip controller in page modules"
```

---

## Task 9: SMOKE.md updates

**Files:**
- Modify: `docs/SMOKE.md`

- [ ] **Step 1: Append a Spider tooltip section**

Add the following section to `docs/SMOKE.md` (after the existing Tooltip placeholder if any, otherwise as a new top-level section):

```markdown
## Spider tooltip

On any My Team or Players page, with the filter bar mounted:

1. Hover any player name for ~400ms. A spider tooltip card appears below the anchor.
2. The card shows three polygons (Season gray, L10 teal, L5 gold) with 9 axes and raw values stacked next to each label.
3. Move the cursor away from both the anchor and the card. Card disappears.
4. Click the player name. Card pins, ✕ appears at top-right.
5. Press ESC. Card disappears.
6. Click a different player name. Previous pin closes; new pin opens.
7. Click the ✕. Card disappears.
8. Click outside the card. Card disappears.
9. With a card pinned, change the per-mode in the filter bar. The polygons and raw values refresh.
10. Pick a player you know is rostered very lightly (low GP). One of L5/L10 should render with its legend entry dimmed.
11. If you have any "unmapped" players in Options, hover one. Card body reads "No NBA mapping. Fix in Options."

Smoke-passes if all 11 steps succeed.
```

- [ ] **Step 2: Commit**

```bash
git add docs/SMOKE.md
git commit -m "docs: add spider tooltip smoke checklist"
```

---

## Task 10: Final verify and release prep

- [ ] **Step 1: Run the full pre-commit chain**

```
npm run typecheck
npm test -- --run
npm run build
```

All three must pass.

- [ ] **Step 2: Manual smoke against live Yahoo**

Load the unpacked extension at `dist/` and walk through `docs/SMOKE.md` end-to-end, including the new Spider tooltip section.

- [ ] **Step 3: Bump version and tag**

Edit `manifest.json` to bump the version (next slot after the currently released one). Then:

```bash
npm run build
git add manifest.json
git commit -m "release: v<next>"
git tag v<next>
```

- [ ] **Step 4: Push commits + tag**

```bash
git push origin main
git push origin v<next>
```

- [ ] **Step 5: Build the release zip**

```
powershell -NoProfile -Command "Compress-Archive -Path 'dist/*' -DestinationPath 'fnba-v<next>.zip' -Force"
```

- [ ] **Step 6: Provide the publish package**

Hand the user:
- Release URL: `https://github.com/ccc1236/fNBA/releases/new?tag=v<next>`
- Title: `v<next> - Spider tooltip`
- Notes: brief summary + install steps
- Zip artifact at the repo root

- [ ] **Step 7: Verify and clean**

After the user confirms "published":

```
curl -sI https://github.com/ccc1236/fNBA/releases/tag/v<next> | head -1
rm fnba-v<next>.zip
```

Expected: `HTTP/1.1 200 OK`, then no such file.
