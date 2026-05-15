# fNBA Plan 2 - Content Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inject a filter bar, three advanced columns (eFG%, TS%, USG%), and per-row stat overrides into Yahoo Fantasy Basketball's My Team and Players pages, driven by the SW from Plan 1.

**Architecture:** Content script (one entry, multiple page modules) detects the active Yahoo page, scrapes player anchors, sends a one-time `bootstrapPlayers` message so the SW can grow the Yahoo to NBA mapping, mounts the `<fnba-filter-bar>` Web Component above the stats table, requests stats via the existing `getPlayerStats` API, and patches the DOM. Yahoo's own stat-range selector is de-emphasized while the fNBA filter is active.

**Tech Stack:** TypeScript (strict + `noUncheckedIndexedAccess`), Vite + `@crxjs/vite-plugin`, vanilla Web Components with shadow DOM, Vitest + jsdom for DOM tests.

**Verifiable output of this plan:** After `npm run build` and reloading the unpacked extension, navigating to `basketball.fantasysports.yahoo.com/nba/<league>/team` or `.../players` shows a horizontal fNBA filter bar above the stats table, three new columns (eFG%, TS%, USG%) appended to the right of the existing columns, and the traditional stat cells (PTS, REB, AST, etc.) overridden with values matching the chosen window (Season / Last 5 GP / Last 10 GP) and per-mode (Per Game / Per 36 / Per 100). The refresh button forces a fresh fetch. Changing dropdowns re-paints the table within ~1s on cache hits.

---

## File Structure (created or modified by this plan)

```
fnba/
  manifest.json                                # modified: add content_scripts, action, options_page
  src/
    background/
      index.ts                                 # modified: add bootstrapPlayers + getFilterSettings handlers
      nbaPlayersList.ts                        # new: commonallplayers client
      mappingService.ts                        # new: bootstrap orchestration (uses playerMapping + nbaPlayersList)
    shared/
      messages.ts                              # modified: add BootstrapPlayersRequest/Response types + guards
      format.ts                                # new: stat formatters
      settings.ts                              # new: chrome.storage.sync wrapper for filter selection
    content/
      index.ts                                 # new: content script entry, page router, MutationObserver
      yahoo.ts                                 # new: Yahoo DOM scraping helpers (player rows, table, filter)
    pages/
      players.ts                               # new: Players-page module
      myTeam.ts                                # new: My-Team-page module
    ui/
      filter-bar.ts                            # new: <fnba-filter-bar> Web Component
      filter-bar.css.ts                        # new: tagged template literal styles for filter-bar
  test/
    fixtures/
      yahoo/
        players.html                           # new: saved snapshot of /players page
        myTeam.html                            # new: saved snapshot of /team page
    unit/
      pageDetect.test.ts                       # new: URL -> page-type classification
      nbaPlayersList.test.ts                   # new
      mappingService.test.ts                   # new
      messages.test.ts                         # modified: add bootstrap guard tests
      format.test.ts                           # new
      settings.test.ts                         # new
      yahooScrape.test.ts                      # new: DOM scraping against fixtures
      filterBar.test.ts                        # new: Web Component behavior
      pages.players.test.ts                    # new: end-to-end DOM patching against fixture
      pages.myTeam.test.ts                     # new
  docs/
    SMOKE.md                                   # modified: add Plan 2 manual-test steps
```

Each new file has one clear responsibility. The content script entry (`src/content/index.ts`) is the only file that wires page modules together; page modules consume the same shared helpers (`yahoo.ts`, `filter-bar.ts`, `format.ts`).

---

## Task 1: Page-detection helpers

**Files:**
- Create: `src/content/pageDetect.ts`
- Create: `test/unit/pageDetect.test.ts`

Pure URL classifier. No DOM access. Returns a typed `PageKind` so each page module can register itself cleanly.

- [ ] **Step 1.1: Write the failing test**

`test/unit/pageDetect.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { detectPage } from "../../src/content/pageDetect.js";

describe("detectPage", () => {
  it("identifies the My Team page", () => {
    expect(detectPage("https://basketball.fantasysports.yahoo.com/nba/123456/team"))
      .toEqual({ kind: "myTeam", leagueId: "123456" });
  });
  it("identifies the Players page", () => {
    expect(detectPage("https://basketball.fantasysports.yahoo.com/nba/123456/players"))
      .toEqual({ kind: "players", leagueId: "123456" });
  });
  it("identifies the Players page with query string", () => {
    expect(detectPage("https://basketball.fantasysports.yahoo.com/nba/123456/players?status=A&pos=PG"))
      .toEqual({ kind: "players", leagueId: "123456" });
  });
  it("returns unknown for unrelated routes", () => {
    expect(detectPage("https://basketball.fantasysports.yahoo.com/nba/123456/matchup"))
      .toEqual({ kind: "unknown" });
  });
  it("returns unknown for non-Yahoo URLs", () => {
    expect(detectPage("https://example.com/nba/123/team"))
      .toEqual({ kind: "unknown" });
  });
});
```

- [ ] **Step 1.2: Run, verify fail**

Run: `npm test -- pageDetect`
Expected: FAIL, module not found.

- [ ] **Step 1.3: Implement**

`src/content/pageDetect.ts`:
```ts
export type PageKind = "myTeam" | "players" | "unknown";

export interface PageInfo {
  kind: PageKind;
  leagueId?: string;
}

const HOST = "basketball.fantasysports.yahoo.com";
const ROUTE_RE = /^\/nba\/([^/]+)\/(team|players)\/?$/;

export function detectPage(href: string): PageInfo {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { kind: "unknown" };
  }
  if (url.host !== HOST) return { kind: "unknown" };
  const m = ROUTE_RE.exec(url.pathname);
  if (!m) return { kind: "unknown" };
  const leagueId = m[1]!;
  const route = m[2]!;
  if (route === "team") return { kind: "myTeam", leagueId };
  return { kind: "players", leagueId };
}
```

- [ ] **Step 1.4: Run, verify pass**

Run: `npm test -- pageDetect`
Expected: PASS, 5 tests.

- [ ] **Step 1.5: Commit**

```bash
git add src/content/pageDetect.ts test/unit/pageDetect.test.ts
git commit -m "feat(content): URL-based page detection"
```

---

## Task 2: nba.com commonallplayers client

**Files:**
- Create: `src/background/nbaPlayersList.ts`
- Create: `test/unit/nbaPlayersList.test.ts`

Separate from `nbaClient.ts` because it hits a different endpoint with a different response shape. Same throttle and header rules apply at runtime.

- [ ] **Step 2.1: Write the failing test**

`test/unit/nbaPlayersList.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCommonAllPlayers } from "../../src/background/nbaPlayersList.js";

const SAMPLE = {
  resultSets: [
    {
      headers: ["PERSON_ID", "DISPLAY_FIRST_LAST", "TEAM_ABBREVIATION", "ROSTERSTATUS", "TO_YEAR"],
      rowSet: [
        [203999, "Nikola Jokic", "DEN", 1, "2026"],
        [1629029, "Luka Doncic", "LAL", 1, "2026"],
        [201939, "Stephen Curry", "GSW", 1, "2026"],
        [977, "Retired Guy", "", 0, "2010"],
      ],
    },
  ],
};

describe("fetchCommonAllPlayers", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("returns active players only (ROSTERSTATUS=1)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<[string], Promise<Response>>(async () =>
        new Response(JSON.stringify(SAMPLE), { status: 200, headers: { "content-type": "application/json" } }),
      ),
    );
    const players = await fetchCommonAllPlayers("2025-26");
    expect(players).toHaveLength(3);
    expect(players[0]).toEqual({ nbaId: 203999, name: "Nikola Jokic", team: "DEN" });
    expect(players.find((p) => p.name === "Retired Guy")).toBeUndefined();
  });

  it("includes the Season param in the URL", async () => {
    const fetchMock = vi.fn<[string], Promise<Response>>(async () =>
      new Response(JSON.stringify(SAMPLE), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await fetchCommonAllPlayers("2025-26");
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain("stats.nba.com/stats/commonallplayers");
    expect(url).toContain("Season=2025-26");
    expect(url).toContain("IsOnlyCurrentSeason=1");
  });

  it("throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    await expect(fetchCommonAllPlayers("2025-26")).rejects.toThrow(/upstream/i);
  });
});
```

- [ ] **Step 2.2: Run, verify fail**

Run: `npm test -- nbaPlayersList`
Expected: FAIL, module not found.

- [ ] **Step 2.3: Implement**

`src/background/nbaPlayersList.ts`:
```ts
import type { NbaPlayer } from "./playerMapping.js";
import type { SeasonString } from "../shared/types.js";
import { UpstreamUnavailableError, RateLimitedError } from "./nbaClient.js";
import { log } from "../shared/logger.js";

const BASE_URL = "https://stats.nba.com/stats/commonallplayers";

function buildUrl(season: SeasonString): string {
  const q = new URLSearchParams({
    LeagueID: "00",
    Season: season,
    IsOnlyCurrentSeason: "1",
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

function parse(raw: RawResponse): NbaPlayer[] {
  const rs = raw.resultSets[0];
  if (!rs) return [];
  const iId = rs.headers.indexOf("PERSON_ID");
  const iName = rs.headers.indexOf("DISPLAY_FIRST_LAST");
  const iTeam = rs.headers.indexOf("TEAM_ABBREVIATION");
  const iRoster = rs.headers.indexOf("ROSTERSTATUS");
  const out: NbaPlayer[] = [];
  for (const row of rs.rowSet) {
    if (row[iRoster] !== 1) continue;
    out.push({
      nbaId: row[iId] as number,
      name: (row[iName] ?? "") as string,
      team: (row[iTeam] ?? "") as string,
    });
  }
  return out;
}

export async function fetchCommonAllPlayers(season: SeasonString): Promise<NbaPlayer[]> {
  const url = buildUrl(season);
  log.debug("fetch commonallplayers", url);
  const res = await fetch(url, { method: "GET" });
  if (res.status === 429) throw new RateLimitedError();
  if (!res.ok) throw new UpstreamUnavailableError(res.status);
  const json = (await res.json()) as RawResponse;
  return parse(json);
}
```

- [ ] **Step 2.4: Run, verify pass**

Run: `npm test -- nbaPlayersList`
Expected: PASS, 3 tests.

- [ ] **Step 2.5: Commit**

```bash
git add src/background/nbaPlayersList.ts test/unit/nbaPlayersList.test.ts
git commit -m "feat(bg): commonallplayers client (active players only)"
```

---

## Task 3: Mapping bootstrap service

**Files:**
- Create: `src/background/mappingService.ts`
- Create: `test/unit/mappingService.test.ts`

Orchestrates: ensure NBA list cached, merge incoming Yahoo players into the existing mapping, persist. Idempotent: called every time a Yahoo page loads.

- [ ] **Step 3.1: Write the failing test**

`test/unit/mappingService.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapPlayers } from "../../src/background/mappingService.js";
import * as nbaList from "../../src/background/nbaPlayersList.js";
import { loadMapping } from "../../src/background/playerMapping.js";

describe("bootstrapPlayers", () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
    vi.restoreAllMocks();
  });

  it("merges new Yahoo entries into the season mapping", async () => {
    vi.spyOn(nbaList, "fetchCommonAllPlayers").mockResolvedValue([
      { nbaId: 1629029, name: "Luka Doncic", team: "LAL" },
      { nbaId: 203999, name: "Nikola Jokic", team: "DEN" },
    ]);

    const r1 = await bootstrapPlayers("2025-26", [
      { yahooId: "y1", name: "Luka Dončić", team: "LAL" },
    ]);
    expect(r1.added).toBe(1);
    expect(r1.unmapped).toEqual([]);

    const stored = await loadMapping("2025-26");
    expect(stored).toHaveLength(1);
    expect(stored[0]!.yahooId).toBe("y1");
    expect(stored[0]!.nbaId).toBe(1629029);
  });

  it("does not call the NBA list twice in one session if already cached in storage", async () => {
    const spy = vi
      .spyOn(nbaList, "fetchCommonAllPlayers")
      .mockResolvedValue([{ nbaId: 203999, name: "Nikola Jokic", team: "DEN" }]);

    await bootstrapPlayers("2025-26", [{ yahooId: "y1", name: "Nikola Jokić", team: "DEN" }]);
    await bootstrapPlayers("2025-26", [{ yahooId: "y2", name: "Someone Else", team: "DEN" }]);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("reports unmapped Yahoo players", async () => {
    vi.spyOn(nbaList, "fetchCommonAllPlayers").mockResolvedValue([
      { nbaId: 1, name: "Some Guy", team: "DEN" },
    ]);
    const r = await bootstrapPlayers("2025-26", [
      { yahooId: "yX", name: "Made Up", team: "ZZZ" },
    ]);
    expect(r.added).toBe(0);
    expect(r.unmapped).toEqual(["yX"]);
  });

  it("preserves existing mapping entries on re-bootstrap", async () => {
    vi.spyOn(nbaList, "fetchCommonAllPlayers").mockResolvedValue([
      { nbaId: 1629029, name: "Luka Doncic", team: "LAL" },
      { nbaId: 203999, name: "Nikola Jokic", team: "DEN" },
    ]);
    await bootstrapPlayers("2025-26", [{ yahooId: "y1", name: "Luka Dončić", team: "LAL" }]);
    await bootstrapPlayers("2025-26", [{ yahooId: "y2", name: "Nikola Jokić", team: "DEN" }]);
    const stored = await loadMapping("2025-26");
    expect(stored.map((m) => m.yahooId).sort()).toEqual(["y1", "y2"]);
  });
});
```

- [ ] **Step 3.2: Run, verify fail**

Run: `npm test -- mappingService`
Expected: FAIL, module not found.

- [ ] **Step 3.3: Implement**

`src/background/mappingService.ts`:
```ts
import {
  buildMapping,
  loadMapping,
  saveMapping,
  type NbaPlayer,
  type YahooPlayer,
} from "./playerMapping.js";
import { fetchCommonAllPlayers } from "./nbaPlayersList.js";
import type { SeasonString, YahooPlayerId } from "../shared/types.js";

export interface BootstrapResult {
  added: number;
  unmapped: YahooPlayerId[];
}

const NBA_LIST_KEY = (season: SeasonString) => `fnba.nbaList.${season}`;

async function loadNbaList(season: SeasonString): Promise<NbaPlayer[] | null> {
  const r = await chrome.storage.local.get(NBA_LIST_KEY(season));
  const v = r[NBA_LIST_KEY(season)];
  return Array.isArray(v) ? (v as NbaPlayer[]) : null;
}

async function saveNbaList(season: SeasonString, list: NbaPlayer[]): Promise<void> {
  await chrome.storage.local.set({ [NBA_LIST_KEY(season)]: list });
}

export async function bootstrapPlayers(
  season: SeasonString,
  yahooPlayers: YahooPlayer[],
): Promise<BootstrapResult> {
  let nbaList = await loadNbaList(season);
  if (!nbaList) {
    nbaList = await fetchCommonAllPlayers(season);
    await saveNbaList(season, nbaList);
  }

  const existing = await loadMapping(season);
  const existingIds = new Set(existing.map((m) => m.yahooId));
  const toMatch = yahooPlayers.filter((p) => !existingIds.has(p.yahooId));

  const newEntries = buildMapping(toMatch, nbaList);
  const newIds = new Set(newEntries.map((e) => e.yahooId));
  const unmapped = toMatch.filter((p) => !newIds.has(p.yahooId)).map((p) => p.yahooId);

  if (newEntries.length > 0) {
    await saveMapping(season, [...existing, ...newEntries]);
  }
  return { added: newEntries.length, unmapped };
}
```

- [ ] **Step 3.4: Run, verify pass**

Run: `npm test -- mappingService`
Expected: PASS, 4 tests.

- [ ] **Step 3.5: Commit**

```bash
git add src/background/mappingService.ts test/unit/mappingService.test.ts
git commit -m "feat(bg): incremental mapping bootstrap service"
```

---

## Task 4: Bootstrap message contract

**Files:**
- Modify: `src/shared/messages.ts`
- Modify: `test/unit/messages.test.ts`

- [ ] **Step 4.1: Add failing tests**

Append to `test/unit/messages.test.ts`:
```ts
import { isBootstrapPlayersRequest } from "../../src/shared/messages.js";

describe("isBootstrapPlayersRequest", () => {
  it("accepts a well-formed request", () => {
    const msg = {
      type: "bootstrapPlayers",
      season: "2025-26",
      players: [{ yahooId: "y1", name: "Luka Dončić", team: "LAL" }],
    };
    expect(isBootstrapPlayersRequest(msg)).toBe(true);
  });
  it("rejects wrong type", () => {
    expect(isBootstrapPlayersRequest({ type: "other", season: "2025-26", players: [] })).toBe(false);
  });
  it("rejects non-array players", () => {
    expect(isBootstrapPlayersRequest({ type: "bootstrapPlayers", season: "2025-26", players: "x" }))
      .toBe(false);
  });
  it("rejects malformed player entries", () => {
    expect(isBootstrapPlayersRequest({
      type: "bootstrapPlayers", season: "2025-26", players: [{ yahooId: 1, name: "x", team: "y" }],
    })).toBe(false);
  });
});
```

- [ ] **Step 4.2: Run, verify fail**

Run: `npm test -- messages`
Expected: FAIL, `isBootstrapPlayersRequest is not a function`.

- [ ] **Step 4.3: Implement**

Append to `src/shared/messages.ts`:
```ts
import type { YahooPlayer } from "../background/playerMapping.js";
import type { SeasonString, YahooPlayerId } from "./types.js";

export interface BootstrapPlayersRequest {
  type: "bootstrapPlayers";
  season: SeasonString;
  players: YahooPlayer[];
}

export interface BootstrapPlayersResponse {
  type: "bootstrapPlayersResponse";
  added: number;
  unmapped: YahooPlayerId[];
}

export function isBootstrapPlayersRequest(v: unknown): v is BootstrapPlayersRequest {
  if (!isObject(v)) return false;
  if (v.type !== "bootstrapPlayers") return false;
  if (typeof v.season !== "string") return false;
  if (!Array.isArray(v.players)) return false;
  for (const p of v.players) {
    if (!isObject(p)) return false;
    if (typeof p.yahooId !== "string") return false;
    if (typeof p.name !== "string") return false;
    if (typeof p.team !== "string") return false;
  }
  return true;
}
```

Also extend the union type at the top:
```ts
export type AnyRequest = GetPlayerStatsRequest | BootstrapPlayersRequest;
export type AnyResponse = GetPlayerStatsResponse | BootstrapPlayersResponse | ErrorResponse;
```

Note: Plan 1 already defines `MessageRequest`/`MessageResponse` aliases that point at the single-request shape. Leave those for now (they are only used by the SW entry as a return-type alias), and use the new `AnyRequest`/`AnyResponse` from this task forward.

- [ ] **Step 4.4: Run, verify pass**

Run: `npm test -- messages`
Expected: PASS, 8 tests (4 prior + 4 new).

- [ ] **Step 4.5: Commit**

```bash
git add src/shared/messages.ts test/unit/messages.test.ts
git commit -m "feat(shared): bootstrapPlayers message contract"
```

---

## Task 5: SW handler for bootstrapPlayers

**Files:**
- Modify: `src/background/index.ts`

The new handler is integration glue; verified via the next batch of DOM tests and a smoke step. No new unit test for `index.ts` itself per the Plan 1 convention.

- [ ] **Step 5.1: Wire the handler**

In `src/background/index.ts`, alongside the existing `handleGetPlayerStats`, add a sibling handler and route it from the listener.

Edit the imports section to add:
```ts
import { bootstrapPlayers } from "./mappingService.js";
import {
  isGetPlayerStatsRequest,
  isBootstrapPlayersRequest,
  type BootstrapPlayersResponse,
  type ErrorResponse,
  type GetPlayerStatsRequest,
  type GetPlayerStatsResponse,
  type MessageResponse as MsgResponse,
  type BootstrapPlayersRequest,
} from "../shared/messages.js";
```

Add a new handler:
```ts
async function handleBootstrapPlayers(
  req: BootstrapPlayersRequest,
): Promise<BootstrapPlayersResponse | ErrorResponse> {
  try {
    const { added, unmapped } = await bootstrapPlayers(req.season, req.players);
    return { type: "bootstrapPlayersResponse", added, unmapped };
  } catch (e) {
    if (e instanceof RateLimitedError || e instanceof ThrottledError) {
      throttle.triggerCooldown();
      return { type: "error", code: "RATE_LIMITED", message: String(e) };
    }
    if (e instanceof UpstreamUnavailableError) {
      return { type: "error", code: "UPSTREAM_UNAVAILABLE", message: String(e) };
    }
    log.error("handleBootstrapPlayers", e);
    return { type: "error", code: "UNKNOWN", message: String(e) };
  }
}
```

Extend the listener:
```ts
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (isGetPlayerStatsRequest(msg)) {
    void handleGetPlayerStats(msg).then(sendResponse);
    return true;
  }
  if (isBootstrapPlayersRequest(msg)) {
    void handleBootstrapPlayers(msg).then(sendResponse);
    return true;
  }
  sendResponse({ type: "error", code: "BAD_REQUEST", message: "unknown message" });
  return false;
});
```

Expose on the smoke-test surface:
```ts
(globalThis as unknown as Record<string, unknown>).fnba = {
  ADVANCED_COLUMNS,
  BASE_OVERRIDE_COLUMNS,
  cache,
  getPlayerStats: handleGetPlayerStats,
  bootstrapPlayers: handleBootstrapPlayers,
  saveMapping,
  loadMapping,
};
```

- [ ] **Step 5.2: Verify typecheck and build**

```bash
npm run typecheck
npm run build
```
Expected: both pass.

- [ ] **Step 5.3: Commit**

```bash
git add src/background/index.ts
git commit -m "feat(bg): route bootstrapPlayers messages to mappingService"
```

---

## Task 6: Yahoo DOM fixtures

**Files:**
- Create: `test/fixtures/yahoo/players.html`
- Create: `test/fixtures/yahoo/myTeam.html`
- Create: `test/fixtures/yahoo/README.md`

These are real saved HTML snapshots from your logged-in Yahoo session. They are large and noisy by design; the scraper tests assert against stable hooks (anchor hrefs, ARIA roles) so the noise does not matter.

- [ ] **Step 6.1: Capture the Players-page fixture manually**

1. In Chrome, sign in to Yahoo Fantasy Basketball.
2. Navigate to your league's Players page (URL pattern: `https://basketball.fantasysports.yahoo.com/nba/<leagueId>/players`).
3. Wait for the player table to fully render (you should see anchors like `<a href="/nba/players/6015">Luka Dončić</a>`).
4. Right-click the page, choose **View page source**. Select all, copy.
5. Save into `test/fixtures/yahoo/players.html`. Strip out any tokens or PII you do not want in the repo: search for `crumb=`, `oauth`, `_cookie`, your league name, and your own team name; replace with `REDACTED`.

- [ ] **Step 6.2: Capture the My Team fixture**

Repeat for `https://basketball.fantasysports.yahoo.com/nba/<leagueId>/team` into `test/fixtures/yahoo/myTeam.html`. Same PII sweep.

- [ ] **Step 6.3: Document the capture process**

Write `test/fixtures/yahoo/README.md`:
```markdown
# Yahoo fixtures

Saved HTML snapshots used by DOM-scraping and page-module tests. Not auto-refreshed.

## How to refresh
1. Open the page in Chrome while signed in.
2. View page source.
3. Save into the matching fixture file in this directory.
4. Sweep for PII (search and replace `crumb=`, `oauth`, your league name, team names you do not want public).
5. Run `npm test` to confirm scrapers still pass.

## Why we capture HTML, not e2e against live Yahoo
Live Yahoo requires auth and rate-limits scrapers. Fixtures are deterministic and version-controlled. We refresh them on intent (Yahoo redesign, new feature), not on schedule.
```

- [ ] **Step 6.4: Commit**

```bash
git add test/fixtures/yahoo/
git commit -m "test(fixtures): saved Yahoo Players + My Team page snapshots"
```

---

## Task 7: Yahoo DOM scraper

**Files:**
- Create: `src/content/yahoo.ts`
- Create: `test/unit/yahooScrape.test.ts`

Scrapes the stats table and per-row anchors. Selectors are href-based (player anchors match `a[href*="/nba/players/"]`); team abbreviations come from the row's `data-` attributes or a sibling cell. Defensive: returns `null` (not throws) if expected shape is missing, so a Yahoo redesign disables the overlay rather than crashes the page.

- [ ] **Step 7.1: Install jsdom for DOM testing**

```bash
npm install --save-dev jsdom @types/jsdom
```

- [ ] **Step 7.2: Configure vitest to use jsdom for DOM tests**

Modify `vite.config.ts` so the test runner can switch environments per file. Replace the `test` block with:
```ts
test: {
  globals: true,
  environment: "node",
  setupFiles: ["./test/setup.ts"],
  environmentMatchGlobs: [
    ["test/unit/yahooScrape.test.ts", "jsdom"],
    ["test/unit/pages.*.test.ts", "jsdom"],
    ["test/unit/filterBar.test.ts", "jsdom"],
  ],
},
```

- [ ] **Step 7.3: Write the failing test**

`test/unit/yahooScrape.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findStatsTable, scrapePlayers } from "../../src/content/yahoo.js";

const FIXTURE_DIR = resolve(__dirname, "../fixtures/yahoo");

describe("yahoo scraper - Players page", () => {
  beforeAll(() => {
    document.documentElement.innerHTML = readFileSync(
      resolve(FIXTURE_DIR, "players.html"),
      "utf8",
    );
  });

  it("finds the stats table", () => {
    const table = findStatsTable();
    expect(table).not.toBeNull();
    expect(table?.tagName).toBe("TABLE");
  });

  it("scrapes at least one player with id, name, team", () => {
    const players = scrapePlayers();
    expect(players.length).toBeGreaterThan(0);
    const p = players[0]!;
    expect(p.yahooId).toMatch(/^\d+$/);
    expect(p.name.length).toBeGreaterThan(0);
    expect(p.team).toMatch(/^[A-Z]{2,4}$/);
  });

  it("each player row links to /nba/players/<id>", () => {
    const players = scrapePlayers();
    expect(players.every((p) => /^\d+$/.test(p.yahooId))).toBe(true);
  });
});
```

A separate suite for the My Team fixture is in Task 16; this one validates the Players capture.

- [ ] **Step 7.4: Run, verify fail**

Run: `npm test -- yahooScrape`
Expected: FAIL, module not found.

- [ ] **Step 7.5: Implement**

`src/content/yahoo.ts`:
```ts
import type { YahooPlayer } from "../background/playerMapping.js";

const PLAYER_HREF_RE = /\/nba\/players\/(\d+)/;

/**
 * Find the main stats table on a Yahoo Fantasy page. Strategy: pick the table
 * that contains the most anchors matching the player-href pattern. Robust to
 * Yahoo class renames; only assumes the player-anchor URL shape.
 */
export function findStatsTable(): HTMLTableElement | null {
  const tables = Array.from(document.querySelectorAll<HTMLTableElement>("table"));
  let best: { table: HTMLTableElement; count: number } | null = null;
  for (const t of tables) {
    const count = t.querySelectorAll('a[href*="/nba/players/"]').length;
    if (count >= 2 && (best === null || count > best.count)) {
      best = { table: t, count };
    }
  }
  return best?.table ?? null;
}

/**
 * Scrape a player from a row. Skips rows that do not look like a player row
 * (no player anchor, or unparseable href).
 */
function scrapeRow(row: HTMLTableRowElement): YahooPlayer | null {
  const anchor = row.querySelector<HTMLAnchorElement>('a[href*="/nba/players/"]');
  if (!anchor) return null;
  const m = PLAYER_HREF_RE.exec(anchor.getAttribute("href") ?? "");
  if (!m) return null;
  const yahooId = m[1]!;
  const name = anchor.textContent?.trim() ?? "";
  if (!name) return null;

  // Team abbreviation: first 2-4 uppercase letter span/cell that is a sibling
  // of the player anchor and looks like a team code. Yahoo conventions vary;
  // try a few signals.
  let team = "";
  const teamEl =
    row.querySelector<HTMLElement>("[data-team]") ??
    row.querySelector<HTMLElement>("abbr[title*='/']");
  if (teamEl) {
    team = (teamEl.getAttribute("data-team") ?? teamEl.textContent ?? "").trim().toUpperCase();
  } else {
    // Fallback: scan small spans / cells for a 2-4 uppercase token.
    for (const cell of Array.from(row.querySelectorAll<HTMLElement>("span,abbr,td"))) {
      const text = (cell.textContent ?? "").trim();
      if (/^[A-Z]{2,4}$/.test(text)) {
        team = text;
        break;
      }
    }
  }
  if (!team) return null;
  return { yahooId, name, team };
}

export function scrapePlayers(): YahooPlayer[] {
  const table = findStatsTable();
  if (!table) return [];
  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"));
  const out: YahooPlayer[] = [];
  for (const row of rows) {
    const p = scrapeRow(row);
    if (p) out.push(p);
  }
  return out;
}

export function findRowByYahooId(table: HTMLTableElement, yahooId: string): HTMLTableRowElement | null {
  return table.querySelector<HTMLTableRowElement>(
    `tbody tr:has(a[href*="/nba/players/${yahooId}"])`,
  );
}
```

If the fixture's actual DOM has team data in a different shape, the engineer updates the `team` extraction strategy here while keeping the same function signature. If neither `[data-team]` nor a sibling token match, the row is skipped (returns `null` from `scrapeRow`); this is acceptable because the bootstrap is incremental and skipped rows simply do not get mapped.

- [ ] **Step 7.6: Run, verify pass**

Run: `npm test -- yahooScrape`
Expected: PASS, 3 tests. If team extraction fails for your fixture, adjust the strategy in `scrapeRow` until the third assertion (`team` matches `^[A-Z]{2,4}$`) passes, then re-run.

- [ ] **Step 7.7: Commit**

```bash
git add src/content/yahoo.ts test/unit/yahooScrape.test.ts vite.config.ts package.json package-lock.json
git commit -m "feat(content): href-based Yahoo DOM scraper"
```

---

## Task 8: Stat-format helpers

**Files:**
- Create: `src/shared/format.ts`
- Create: `test/unit/format.test.ts`

- [ ] **Step 8.1: Write the failing test**

`test/unit/format.test.ts`:
```ts
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
```

- [ ] **Step 8.2: Run, verify fail**

Run: `npm test -- format`
Expected: FAIL, module not found.

- [ ] **Step 8.3: Implement**

`src/shared/format.ts`:
```ts
/**
 * Format a stat value for display. Numbers in [0, 1) for fractional columns
 * (FG_PCT, EFG_PCT, TS_PCT) render with no leading zero, NBA-broadcast style.
 * null/undefined render as a dash placeholder.
 */
export function formatStat(v: number | null | undefined, decimals: number): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  const fixed = v.toFixed(decimals);
  if (decimals >= 3 && v >= 0 && v < 1) return fixed.replace(/^0\./, ".");
  return fixed;
}
```

- [ ] **Step 8.4: Run, verify pass**

Run: `npm test -- format`
Expected: PASS, 4 tests.

- [ ] **Step 8.5: Commit**

```bash
git add src/shared/format.ts test/unit/format.test.ts
git commit -m "feat(shared): stat formatter (NBA-broadcast style percentages)"
```

---

## Task 9: Filter settings persistence

**Files:**
- Create: `src/shared/settings.ts`
- Create: `test/unit/settings.test.ts`

- [ ] **Step 9.1: Extend the chrome stub for `chrome.storage.sync`**

Modify `test/setup.ts`. After the existing `local` block, add a `sync` block with the same shape:
```ts
import "fake-indexeddb/auto";

const makeStore = () => {
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
};

(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: { local: makeStore(), sync: makeStore() },
} as unknown;
```

- [ ] **Step 9.2: Write the failing test**

`test/unit/settings.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from "../../src/shared/settings.js";

describe("filter settings", () => {
  beforeEach(async () => {
    await chrome.storage.sync.clear();
  });

  it("returns defaults when nothing is saved", async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips saved settings", async () => {
    await saveSettings({ window: "Last5", perMode: "Per36" });
    expect(await loadSettings()).toEqual({ window: "Last5", perMode: "Per36" });
  });

  it("merges partial saves with defaults", async () => {
    await saveSettings({ window: "Last10" });
    const s = await loadSettings();
    expect(s.window).toBe("Last10");
    expect(s.perMode).toBe(DEFAULT_SETTINGS.perMode);
  });
});
```

- [ ] **Step 9.3: Run, verify fail**

Run: `npm test -- settings`
Expected: FAIL, module not found.

- [ ] **Step 9.4: Implement**

`src/shared/settings.ts`:
```ts
import type { PerModeKey, WindowKey } from "./types.js";

export interface FilterSettings {
  window: WindowKey;
  perMode: PerModeKey;
}

export const DEFAULT_SETTINGS: FilterSettings = {
  window: "Season",
  perMode: "PerGame",
};

const KEY = "fnba.filterSettings";

export async function loadSettings(): Promise<FilterSettings> {
  const r = await chrome.storage.sync.get(KEY);
  const saved = r[KEY];
  if (!saved || typeof saved !== "object") return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...(saved as Partial<FilterSettings>) };
}

export async function saveSettings(patch: Partial<FilterSettings>): Promise<void> {
  const current = await loadSettings();
  await chrome.storage.sync.set({ [KEY]: { ...current, ...patch } });
}
```

- [ ] **Step 9.5: Run, verify pass**

Run: `npm test -- settings`
Expected: PASS, 3 tests.

- [ ] **Step 9.6: Commit**

```bash
git add src/shared/settings.ts test/unit/settings.test.ts test/setup.ts
git commit -m "feat(shared): filter settings persisted to chrome.storage.sync"
```

---

## Task 10: Filter bar Web Component

**Files:**
- Create: `src/ui/filter-bar.ts`
- Create: `test/unit/filterBar.test.ts`

Custom element `<fnba-filter-bar>` with shadow DOM. Two dropdowns (window, per-mode) driven by `WINDOWS` and `PER_MODES`. Refresh button. Status pill. Emits a `fnba-filter-change` `CustomEvent` with the new settings.

- [ ] **Step 10.1: Write the failing test**

`test/unit/filterBar.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../src/ui/filter-bar.js";

describe("<fnba-filter-bar>", () => {
  let bar: HTMLElement;
  beforeEach(async () => {
    await chrome.storage.sync.clear();
    document.body.innerHTML = "";
    bar = document.createElement("fnba-filter-bar");
    document.body.appendChild(bar);
    await new Promise((r) => setTimeout(r, 0)); // wait for connectedCallback's async init
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders both dropdowns and a refresh button", () => {
    const sr = (bar as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot;
    expect(sr.querySelector('select[data-role="window"]')).not.toBeNull();
    expect(sr.querySelector('select[data-role="perMode"]')).not.toBeNull();
    expect(sr.querySelector('button[data-role="refresh"]')).not.toBeNull();
  });

  it("emits fnba-filter-change with the new selection on window change", async () => {
    const sr = (bar as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot;
    const sel = sr.querySelector<HTMLSelectElement>('select[data-role="window"]')!;
    const events: CustomEvent[] = [];
    bar.addEventListener("fnba-filter-change", (e) => events.push(e as CustomEvent));

    sel.value = "Last5";
    sel.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 0));

    expect(events).toHaveLength(1);
    expect(events[0]!.detail).toEqual({ window: "Last5", perMode: "PerGame" });
  });

  it("emits fnba-filter-refresh on refresh-button click", () => {
    const sr = (bar as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot;
    const btn = sr.querySelector<HTMLButtonElement>('button[data-role="refresh"]')!;
    const events: Event[] = [];
    bar.addEventListener("fnba-filter-refresh", (e) => events.push(e));
    btn.click();
    expect(events).toHaveLength(1);
  });

  it("setStatus() updates the status pill", () => {
    (bar as HTMLElement & { setStatus: (s: string) => void }).setStatus("Updated just now");
    const sr = (bar as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot;
    expect(sr.querySelector('[data-role="status"]')!.textContent).toBe("Updated just now");
  });
});
```

- [ ] **Step 10.2: Run, verify fail**

Run: `npm test -- filterBar`
Expected: FAIL, module not found.

- [ ] **Step 10.3: Implement**

`src/ui/filter-bar.ts`:
```ts
import { WINDOWS } from "../shared/windows.js";
import { PER_MODES } from "../shared/perModes.js";
import { loadSettings, saveSettings, type FilterSettings } from "../shared/settings.js";
import type { PerModeKey, WindowKey } from "../shared/types.js";

const STYLES = `
  :host {
    display: block;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #1a1a2e;
    box-sizing: border-box;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: #f5f5f7;
    border: 1px solid #d8d8de;
    border-radius: 6px;
    font-size: 12px;
  }
  .brand {
    font-weight: 700;
    color: #5f01d1;
    letter-spacing: 0.02em;
  }
  select, button {
    font: inherit;
    color: inherit;
    background: #fff;
    border: 1px solid #c4c4cc;
    border-radius: 4px;
    padding: 3px 8px;
    cursor: pointer;
  }
  button[data-role="refresh"] {
    padding: 3px 10px;
  }
  .status {
    margin-left: auto;
    font-size: 11px;
    opacity: 0.7;
  }
  .status[data-state="error"] {
    color: #b00020;
    opacity: 1;
  }
`;

export class FilterBar extends HTMLElement {
  private settings: FilterSettings = { window: "Season", perMode: "PerGame" };

  connectedCallback(): void {
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${STYLES}</style>
      <div class="bar">
        <span class="brand">fNBA</span>
        <select data-role="window">
          ${WINDOWS.map((w) => `<option value="${w.key}">${w.label}</option>`).join("")}
        </select>
        <select data-role="perMode">
          ${PER_MODES.map((m) => `<option value="${m.key}">${m.label}</option>`).join("")}
        </select>
        <button data-role="refresh" title="Refetch from nba.com">⟳ Refresh</button>
        <span class="status" data-role="status"></span>
      </div>
    `;
    void this.init();
    this.wireEvents();
  }

  private async init(): Promise<void> {
    this.settings = await loadSettings();
    const root = this.shadowRoot!;
    (root.querySelector('select[data-role="window"]') as HTMLSelectElement).value = this.settings.window;
    (root.querySelector('select[data-role="perMode"]') as HTMLSelectElement).value = this.settings.perMode;
  }

  private wireEvents(): void {
    const root = this.shadowRoot!;
    const winSel = root.querySelector('select[data-role="window"]') as HTMLSelectElement;
    const modeSel = root.querySelector('select[data-role="perMode"]') as HTMLSelectElement;
    const refresh = root.querySelector('button[data-role="refresh"]') as HTMLButtonElement;
    winSel.addEventListener("change", () => {
      this.settings = { ...this.settings, window: winSel.value as WindowKey };
      void saveSettings({ window: this.settings.window });
      this.dispatchEvent(new CustomEvent("fnba-filter-change", { detail: { ...this.settings } }));
    });
    modeSel.addEventListener("change", () => {
      this.settings = { ...this.settings, perMode: modeSel.value as PerModeKey };
      void saveSettings({ perMode: this.settings.perMode });
      this.dispatchEvent(new CustomEvent("fnba-filter-change", { detail: { ...this.settings } }));
    });
    refresh.addEventListener("click", () => {
      this.dispatchEvent(new Event("fnba-filter-refresh"));
    });
  }

  getSettings(): FilterSettings {
    return { ...this.settings };
  }

  setStatus(text: string, state: "ok" | "error" = "ok"): void {
    const el = this.shadowRoot!.querySelector('[data-role="status"]') as HTMLElement;
    el.textContent = text;
    el.dataset.state = state;
  }
}

if (!customElements.get("fnba-filter-bar")) {
  customElements.define("fnba-filter-bar", FilterBar);
}
```

- [ ] **Step 10.4: Run, verify pass**

Run: `npm test -- filterBar`
Expected: PASS, 4 tests.

- [ ] **Step 10.5: Commit**

```bash
git add src/ui/filter-bar.ts test/unit/filterBar.test.ts
git commit -m "feat(ui): <fnba-filter-bar> Web Component"
```

---

## Task 11: Column injection module

**Files:**
- Create: `src/content/injectColumns.ts`
- Create: `test/unit/injectColumns.test.ts`

Idempotent: calling twice does not duplicate headers or cells. Marks injected nodes with `data-fnba` so they can be removed and re-rendered on filter change.

- [ ] **Step 11.1: Write the failing test**

`test/unit/injectColumns.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { renderColumns, clearFnbaCells } from "../../src/content/injectColumns.js";
import type { PlayerStatRow } from "../../src/shared/types.js";

const SAMPLE: Record<string, PlayerStatRow | null> = {
  "6015": {
    nbaId: 1629029, name: "Luka", teamAbbr: "LAL", position: null,
    stats: { PTS: 33.5, REB: 7.7, AST: 8.3, EFG_PCT: 0.563, TS_PCT: 0.617, USG_PCT: 36.8 },
  },
  "404": null,
};

function mkTable(): HTMLTableElement {
  document.body.innerHTML = `
    <table>
      <thead><tr><th>Player</th><th data-stat="PTS">PTS</th></tr></thead>
      <tbody>
        <tr><td><a href="/nba/players/6015">Luka</a></td><td data-stat="PTS">99.9</td></tr>
        <tr><td><a href="/nba/players/404">Missing</a></td><td data-stat="PTS">99.9</td></tr>
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
    const lukaRow = t.querySelector('tr:has(a[href*="/nba/players/6015"])')!;
    const advCells = Array.from(lukaRow.querySelectorAll("td[data-fnba]"));
    expect(advCells.map((c) => c.textContent)).toEqual([".563", ".617", "36.8"]);
  });

  it("shows dash for unmapped players", () => {
    const t = mkTable();
    renderColumns(t, SAMPLE);
    const missingRow = t.querySelector('tr:has(a[href*="/nba/players/404"])')!;
    const advCells = Array.from(missingRow.querySelectorAll("td[data-fnba]"));
    expect(advCells.map((c) => c.textContent)).toEqual(["-", "-", "-"]);
  });

  it("is idempotent (calling twice does not duplicate)", () => {
    const t = mkTable();
    renderColumns(t, SAMPLE);
    renderColumns(t, SAMPLE);
    expect(t.querySelectorAll("th[data-fnba]")).toHaveLength(3);
    const lukaRow = t.querySelector('tr:has(a[href*="/nba/players/6015"])')!;
    expect(lukaRow.querySelectorAll("td[data-fnba]")).toHaveLength(3);
  });

  it("overrides Base stats when matching data-stat attribute exists", () => {
    const t = mkTable();
    renderColumns(t, SAMPLE);
    const lukaRow = t.querySelector('tr:has(a[href*="/nba/players/6015"])')!;
    const ptsCell = lukaRow.querySelector('td[data-stat="PTS"]')!;
    expect(ptsCell.textContent).toBe("33.5");
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
```

- [ ] **Step 11.2: Run, verify fail**

Run: `npm test -- injectColumns`
Expected: FAIL, module not found.

- [ ] **Step 11.3: Add this test file to the jsdom environment matcher**

Modify `vite.config.ts` `environmentMatchGlobs` to add `["test/unit/injectColumns.test.ts", "jsdom"]`.

- [ ] **Step 11.4: Implement**

`src/content/injectColumns.ts`:
```ts
import { ADVANCED_COLUMNS, BASE_OVERRIDE_COLUMNS } from "../shared/columns.js";
import { formatStat } from "../shared/format.js";
import type { PlayerStatRow, YahooPlayerId } from "../shared/types.js";

const PLAYER_HREF_RE = /\/nba\/players\/(\d+)/;

function getYahooIdFromRow(row: HTMLTableRowElement): YahooPlayerId | null {
  const a = row.querySelector<HTMLAnchorElement>('a[href*="/nba/players/"]');
  if (!a) return null;
  const m = PLAYER_HREF_RE.exec(a.getAttribute("href") ?? "");
  return m ? m[1]! : null;
}

/**
 * Idempotent: removes prior fNBA columns and override marks before rendering.
 */
export function renderColumns(
  table: HTMLTableElement,
  data: Record<YahooPlayerId, PlayerStatRow | null>,
): void {
  clearFnbaCells(table);

  // Add header cells
  const headerRow = table.querySelector("thead tr");
  if (headerRow) {
    for (const col of ADVANCED_COLUMNS) {
      const th = document.createElement("th");
      th.dataset.fnba = col.key;
      th.textContent = col.label;
      headerRow.appendChild(th);
    }
  }

  // Per-row injection + override
  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"));
  for (const row of rows) {
    const yahooId = getYahooIdFromRow(row);
    const stats = yahooId ? data[yahooId]?.stats ?? null : null;

    // Append adv cells
    for (const col of ADVANCED_COLUMNS) {
      const td = document.createElement("td");
      td.dataset.fnba = col.key;
      td.textContent = formatStat(stats?.[col.key] ?? null, col.decimals);
      row.appendChild(td);
    }

    // Override Base cells with matching data-stat
    if (stats) {
      for (const col of BASE_OVERRIDE_COLUMNS) {
        const cell = row.querySelector<HTMLElement>(`td[data-stat="${col.key}"]`);
        if (!cell) continue;
        cell.textContent = formatStat(stats[col.key] ?? null, col.decimals);
        cell.dataset.fnbaOverride = "1";
      }
    }
  }
}

export function clearFnbaCells(table: HTMLTableElement): void {
  for (const el of Array.from(table.querySelectorAll("[data-fnba]"))) {
    el.remove();
  }
  for (const el of Array.from(table.querySelectorAll<HTMLElement>("[data-fnba-override]"))) {
    delete el.dataset.fnbaOverride;
  }
}
```

Note: this implementation uses `td[data-stat="<KEY>"]` to find Yahoo's stat cells. Yahoo's actual markup may or may not match this. If your fixture uses a different attribute (e.g. `data-col` or a class containing the stat name), patch `renderColumns`'s override loop. The override is best-effort: missing cells are silently skipped, advanced columns still render.

- [ ] **Step 11.5: Run, verify pass**

Run: `npm test -- injectColumns`
Expected: PASS, 6 tests.

- [ ] **Step 11.6: Commit**

```bash
git add src/content/injectColumns.ts test/unit/injectColumns.test.ts vite.config.ts
git commit -m "feat(content): idempotent column injection + Base stat override"
```

---

## Task 12: Content script entry + page router

**Files:**
- Create: `src/content/index.ts`

The content script entry. Responsibilities:
1. Detect page on load and on history navigation (Yahoo classic is mostly server-rendered but the players page has pagination via pushState).
2. Pick the right page module.
3. The page module wires the filter bar, performs the initial paint, and handles filter changes.

Page modules in Tasks 13 and 14; this task scaffolds the entry.

- [ ] **Step 12.1: Implement**

`src/content/index.ts`:
```ts
import { detectPage, type PageInfo } from "./pageDetect.js";
import { log } from "../shared/logger.js";

type PageModule = (info: PageInfo) => Promise<{ teardown: () => void }>;

const modules: Partial<Record<PageInfo["kind"], () => Promise<PageModule>>> = {
  players: () => import("../pages/players.js").then((m) => m.run),
  myTeam: () => import("../pages/myTeam.js").then((m) => m.run),
};

let activeTeardown: (() => void) | null = null;

async function activate(info: PageInfo): Promise<void> {
  if (info.kind === "unknown") return;
  const loader = modules[info.kind];
  if (!loader) return;
  try {
    const run = await loader();
    const handle = await run(info);
    activeTeardown = handle.teardown;
    log.info("page module active:", info.kind);
  } catch (e) {
    log.error("page module failed:", info.kind, e);
  }
}

function deactivate(): void {
  if (activeTeardown) {
    try {
      activeTeardown();
    } catch (e) {
      log.warn("teardown error", e);
    }
    activeTeardown = null;
  }
}

async function refresh(): Promise<void> {
  deactivate();
  await activate(detectPage(location.href));
}

void refresh();

// Yahoo uses both full navigations and occasional pushState (e.g. pagination).
let lastHref = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    void refresh();
  }
});
observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener("popstate", () => void refresh());

log.info("fNBA content script booted");
```

Note: Page modules are loaded via dynamic `import()`. This is allowed in content scripts (unlike service workers). For crxjs to bundle them correctly, the page module files must be referenced statically somewhere; the `modules` map references them by string but Vite will resolve via the static `import("../pages/...")` calls at build.

- [ ] **Step 12.2: Update manifest for the content script**

Modify `manifest.json` to add a `content_scripts` section. Replace the existing object's body with:
```json
{
  "manifest_version": 3,
  "name": "fNBA - Fantasy NBA Stats Overlay",
  "version": "0.0.1",
  "description": "Advanced stats overlay for Yahoo Fantasy Basketball.",
  "icons": {
    "16": "public/icons/icon-16.png",
    "32": "public/icons/icon-32.png",
    "48": "public/icons/icon-48.png",
    "128": "public/icons/icon-128.png"
  },
  "background": { "service_worker": "src/background/index.ts", "type": "module" },
  "content_scripts": [
    {
      "matches": [
        "https://basketball.fantasysports.yahoo.com/nba/*/team",
        "https://basketball.fantasysports.yahoo.com/nba/*/players*"
      ],
      "js": ["src/content/index.ts"],
      "run_at": "document_idle"
    }
  ],
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

- [ ] **Step 12.3: Build and verify**

```bash
npm run typecheck
npm run build
```
Expected: both pass. `dist/` now contains a content script bundle.

- [ ] **Step 12.4: Commit**

```bash
git add src/content/index.ts manifest.json
git commit -m "feat(content): content script entry + page router with pushState detection"
```

---

## Task 13: Players page module

**Files:**
- Create: `src/pages/players.ts`
- Create: `test/unit/pages.players.test.ts`

End-to-end DOM patching against the Players fixture. The test loads the fixture, runs the page module with a mocked `chrome.runtime.sendMessage`, and asserts the table now shows fNBA columns + overrides.

- [ ] **Step 13.1: Write the failing test**

`test/unit/pages.players.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { run } from "../../src/pages/players.js";
import "../../src/ui/filter-bar.js";
import type { GetPlayerStatsResponse } from "../../src/shared/messages.js";

const FIXTURE = readFileSync(resolve(__dirname, "../fixtures/yahoo/players.html"), "utf8");

function mockSendMessage(playerCount: number): void {
  const sendMessage = vi.fn(async (msg: { type: string; yahooIds?: string[] }) => {
    if (msg.type === "getPlayerStats") {
      const ids = msg.yahooIds ?? [];
      const byYahooId: Record<string, unknown> = {};
      for (const id of ids) {
        byYahooId[id] = {
          nbaId: Number(id), name: `Player ${id}`, teamAbbr: "DEN", position: null,
          stats: { PTS: 25.5, REB: 8.0, EFG_PCT: 0.55, TS_PCT: 0.6, USG_PCT: 28.0 },
        };
      }
      const r: GetPlayerStatsResponse = {
        type: "getPlayerStatsResponse",
        byYahooId: byYahooId as GetPlayerStatsResponse["byYahooId"],
        fetchedAt: Date.now(),
      };
      return r;
    }
    if (msg.type === "bootstrapPlayers") {
      return { type: "bootstrapPlayersResponse", added: playerCount, unmapped: [] };
    }
    return { type: "error", code: "BAD_REQUEST", message: "" };
  });
  (chrome as unknown as { runtime: { sendMessage: typeof sendMessage } }).runtime = {
    sendMessage,
  };
}

describe("players page module", () => {
  beforeEach(() => {
    document.documentElement.innerHTML = FIXTURE;
    mockSendMessage(50);
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("mounts a filter bar above the stats table", async () => {
    await run({ kind: "players", leagueId: "123456" });
    expect(document.querySelector("fnba-filter-bar")).not.toBeNull();
  });

  it("injects three new column headers (eFG%, TS%, USG%)", async () => {
    await run({ kind: "players", leagueId: "123456" });
    const headers = Array.from(document.querySelectorAll("th[data-fnba]")).map((h) => h.textContent);
    expect(headers).toEqual(["eFG%", "TS%", "USG%"]);
  });

  it("populates adv cells in player rows", async () => {
    await run({ kind: "players", leagueId: "123456" });
    const advCells = document.querySelectorAll("td[data-fnba]");
    expect(advCells.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 13.2: Run, verify fail**

Run: `npm test -- pages.players`
Expected: FAIL, module not found.

- [ ] **Step 13.3: Implement**

`src/pages/players.ts`:
```ts
import { scrapePlayers, findStatsTable } from "../content/yahoo.js";
import { renderColumns, clearFnbaCells } from "../content/injectColumns.js";
import "../ui/filter-bar.js";
import type { FilterBar } from "../ui/filter-bar.js";
import { loadSettings } from "../shared/settings.js";
import type { PageInfo } from "../content/pageDetect.js";
import type {
  BootstrapPlayersRequest,
  BootstrapPlayersResponse,
  GetPlayerStatsRequest,
  GetPlayerStatsResponse,
  ErrorResponse,
} from "../shared/messages.js";
import type { FilterSettings } from "../shared/settings.js";
import { log } from "../shared/logger.js";

function currentSeasonString(now: Date = new Date()): string {
  const m = now.getUTCMonth();
  const y = now.getUTCFullYear();
  const start = m >= 6 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

async function send<T>(req: unknown): Promise<T> {
  return (await chrome.runtime.sendMessage(req)) as T;
}

async function paint(table: HTMLTableElement, bar: FilterBar, settings: FilterSettings): Promise<void> {
  bar.setStatus("Loading...");
  const players = scrapePlayers();
  if (players.length === 0) {
    bar.setStatus("No players found on this page", "error");
    return;
  }
  const season = currentSeasonString();

  const bootReq: BootstrapPlayersRequest = { type: "bootstrapPlayers", season, players };
  await send<BootstrapPlayersResponse | ErrorResponse>(bootReq);

  const yahooIds = players.map((p) => p.yahooId);
  const statsReq: GetPlayerStatsRequest = {
    type: "getPlayerStats",
    yahooIds,
    window: settings.window,
    perMode: settings.perMode,
  };
  const resp = await send<GetPlayerStatsResponse | ErrorResponse>(statsReq);
  if (resp.type === "error") {
    bar.setStatus(`${resp.code}`, "error");
    return;
  }
  renderColumns(table, resp.byYahooId);
  bar.setStatus(`Updated ${new Date().toLocaleTimeString()}`);
}

export async function run(_info: PageInfo): Promise<{ teardown: () => void }> {
  const table = findStatsTable();
  if (!table) {
    log.warn("no stats table found; content script idle");
    return { teardown: () => {} };
  }

  // Mount filter bar above the table.
  const bar = document.createElement("fnba-filter-bar") as FilterBar;
  table.parentElement?.insertBefore(bar, table);

  // Wait for the bar to async-init its settings.
  await new Promise((r) => setTimeout(r, 0));
  let settings = await loadSettings();

  await paint(table, bar, settings);

  const onChange = async (e: Event): Promise<void> => {
    const ce = e as CustomEvent<FilterSettings>;
    settings = ce.detail;
    await paint(table, bar, settings);
  };
  const onRefresh = async (): Promise<void> => {
    // Force-fresh: same flow with forceFresh hint passed down. The simplest
    // path is to do a getPlayerStats with forceFresh=true.
    bar.setStatus("Refreshing...");
    const yahooIds = scrapePlayers().map((p) => p.yahooId);
    const r = await send<GetPlayerStatsResponse | ErrorResponse>({
      type: "getPlayerStats",
      yahooIds,
      window: settings.window,
      perMode: settings.perMode,
      forceFresh: true,
    });
    if (r.type === "error") {
      bar.setStatus(`${r.code}`, "error");
      return;
    }
    renderColumns(table, r.byYahooId);
    bar.setStatus(`Updated ${new Date().toLocaleTimeString()}`);
  };

  bar.addEventListener("fnba-filter-change", onChange);
  bar.addEventListener("fnba-filter-refresh", onRefresh);

  return {
    teardown: () => {
      bar.removeEventListener("fnba-filter-change", onChange);
      bar.removeEventListener("fnba-filter-refresh", onRefresh);
      clearFnbaCells(table);
      bar.remove();
    },
  };
}
```

- [ ] **Step 13.4: Add the test to jsdom matcher**

Modify `vite.config.ts` `environmentMatchGlobs` to add `["test/unit/pages.players.test.ts", "jsdom"]`.

- [ ] **Step 13.5: Run, verify pass**

Run: `npm test -- pages.players`
Expected: PASS, 3 tests.

- [ ] **Step 13.6: Commit**

```bash
git add src/pages/players.ts test/unit/pages.players.test.ts vite.config.ts
git commit -m "feat(pages): Players page module - filter bar, bootstrap, paint"
```

---

## Task 14: My Team page module

**Files:**
- Create: `src/pages/myTeam.ts`
- Create: `test/unit/pages.myTeam.test.ts`

Structurally identical to Players. Sharing the body via a helper would tighten DRY, but the two pages will diverge in Plan 3 (Yahoo filter de-emphasis differs, plus the My Team page has bench / starters split rows). Keeping them as separate modules now avoids retrofitting later.

- [ ] **Step 14.1: Write the failing test**

`test/unit/pages.myTeam.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { run } from "../../src/pages/myTeam.js";
import "../../src/ui/filter-bar.js";

const FIXTURE = readFileSync(resolve(__dirname, "../fixtures/yahoo/myTeam.html"), "utf8");

beforeEach(() => {
  document.documentElement.innerHTML = FIXTURE;
  const sendMessage = vi.fn(async (msg: { type: string; yahooIds?: string[] }) => {
    if (msg.type === "getPlayerStats") {
      const ids = msg.yahooIds ?? [];
      const byYahooId: Record<string, unknown> = {};
      for (const id of ids) {
        byYahooId[id] = {
          nbaId: Number(id), name: `Player ${id}`, teamAbbr: "DEN", position: null,
          stats: { PTS: 25.5, EFG_PCT: 0.55, TS_PCT: 0.6, USG_PCT: 28.0 },
        };
      }
      return { type: "getPlayerStatsResponse", byYahooId, fetchedAt: Date.now() };
    }
    return { type: "bootstrapPlayersResponse", added: 0, unmapped: [] };
  });
  (chrome as unknown as { runtime: { sendMessage: typeof sendMessage } }).runtime = {
    sendMessage,
  };
});
afterEach(() => { document.body.innerHTML = ""; });

describe("myTeam page module", () => {
  it("mounts a filter bar and injects columns", async () => {
    await run({ kind: "myTeam", leagueId: "123456" });
    expect(document.querySelector("fnba-filter-bar")).not.toBeNull();
    expect(document.querySelectorAll("th[data-fnba]").length).toBe(3);
  });
});
```

- [ ] **Step 14.2: Run, verify fail**

Run: `npm test -- pages.myTeam`
Expected: FAIL, module not found.

- [ ] **Step 14.3: Implement**

`src/pages/myTeam.ts`: copy the entire body of `src/pages/players.ts` from Task 13.3, change the imports comment to read "// My Team page module" at the top, and leave the logic identical. Both `run` functions expose the same signature so the content router treats them uniformly.

```ts
// My Team page module. Identical scrape+inject flow as Players for v1.
// Diverges from Players in Plan 3 (Yahoo filter de-emphasis, starters/bench split).
export { run } from "./players.js";
```

This re-export pattern keeps a single source of truth until Plan 3 forces a split. Acceptable because both modules have the same v1 behavior and the test that exercises this file confirms the imported `run` works on the My Team fixture.

- [ ] **Step 14.4: Add the test to jsdom matcher**

Modify `vite.config.ts` `environmentMatchGlobs` to add `["test/unit/pages.myTeam.test.ts", "jsdom"]`.

- [ ] **Step 14.5: Run, verify pass**

Run: `npm test -- pages.myTeam`
Expected: PASS, 1 test.

- [ ] **Step 14.6: Commit**

```bash
git add src/pages/myTeam.ts test/unit/pages.myTeam.test.ts vite.config.ts
git commit -m "feat(pages): My Team module (re-exports Players flow for v1)"
```

---

## Task 15: Yahoo filter de-emphasis

**Files:**
- Modify: `src/pages/players.ts`
- Modify: `src/pages/myTeam.ts` (no further change needed; inherits via re-export)

When fNBA is active, find Yahoo's native stat-range filter widget and visually grey it out with a small "fNBA active" note. Idempotent. Restored in `teardown`.

- [ ] **Step 15.1: Add the helper and call it from `run`**

In `src/pages/players.ts`, add this function at module scope:
```ts
function applyYahooFilterFade(table: HTMLTableElement): () => void {
  // Yahoo's native stat-range selector typically sits in a form labeled
  // "Stats Range" or contains a select with options like "Season" / "Last 14".
  // We look in the table's ancestor chain for a candidate.
  const ancestor = table.closest("section, div, form") ?? document.body;
  const candidates = Array.from(
    ancestor.querySelectorAll<HTMLElement>("select"),
  ).filter((s) => {
    const opts = Array.from(s.options).map((o) => o.textContent?.trim() ?? "");
    return opts.some((o) => /season|last\s*\d/i.test(o));
  });

  const restorers: Array<() => void> = [];
  for (const sel of candidates) {
    const note = document.createElement("span");
    note.dataset.fnba = "yahoo-filter-note";
    note.textContent = " (fNBA active)";
    note.style.cssText = "font-size:11px;color:#5f01d1;margin-left:6px;";
    sel.parentElement?.appendChild(note);
    const prev = sel.style.cssText;
    sel.style.opacity = "0.5";
    sel.style.pointerEvents = "none";
    restorers.push(() => {
      sel.style.cssText = prev;
      note.remove();
    });
  }
  return () => restorers.forEach((r) => r());
}
```

In `run`, call it after the filter bar is mounted, and add the restorer to `teardown`:
```ts
const restoreYahoo = applyYahooFilterFade(table);
// ... existing code ...
return {
  teardown: () => {
    restoreYahoo();
    bar.removeEventListener("fnba-filter-change", onChange);
    bar.removeEventListener("fnba-filter-refresh", onRefresh);
    clearFnbaCells(table);
    bar.remove();
  },
};
```

- [ ] **Step 15.2: Verify existing tests still pass**

Run: `npm test`
Expected: PASS, all tests. (No new test for this; behavior is verified manually since it depends on Yahoo's specific filter widget, which the fixtures may or may not contain.)

- [ ] **Step 15.3: Commit**

```bash
git add src/pages/players.ts
git commit -m "feat(pages): de-emphasize Yahoo's native stat-range filter when fNBA is active"
```

---

## Task 16: Yahoo scraper test for My Team fixture

**Files:**
- Modify: `test/unit/yahooScrape.test.ts`

Add a second describe block that loads `myTeam.html` and asserts the scraper picks up at least one player. This catches the case where Yahoo's two pages have meaningfully different DOM structures.

- [ ] **Step 16.1: Extend the test file**

Append to `test/unit/yahooScrape.test.ts`:
```ts
describe("yahoo scraper - My Team page", () => {
  beforeAll(() => {
    document.documentElement.innerHTML = readFileSync(
      resolve(FIXTURE_DIR, "myTeam.html"),
      "utf8",
    );
  });

  it("scrapes at least one roster player", () => {
    const players = scrapePlayers();
    expect(players.length).toBeGreaterThan(0);
  });

  it("each scraped player has a numeric Yahoo id", () => {
    expect(scrapePlayers().every((p) => /^\d+$/.test(p.yahooId))).toBe(true);
  });
});
```

- [ ] **Step 16.2: Run, verify pass**

Run: `npm test -- yahooScrape`
Expected: PASS, 5 tests total (3 prior + 2 new). If the My Team fixture's row structure differs, adapt the scraper in `src/content/yahoo.ts` (Task 7) so both fixtures pass; do not split the scraper logic into per-page variants.

- [ ] **Step 16.3: Commit**

```bash
git add test/unit/yahooScrape.test.ts
git commit -m "test(scrape): My Team fixture coverage"
```

---

## Task 17: Update SMOKE.md for Plan 2

**Files:**
- Modify: `docs/SMOKE.md`

- [ ] **Step 17.1: Append Plan 2 smoke steps**

Append to `docs/SMOKE.md`:
```markdown
---

# Smoke Test - Plan 2

Run after `npm run build` and reloading the unpacked extension.

## 1. Navigate to your league's Players page

Visit `https://basketball.fantasysports.yahoo.com/nba/<leagueId>/players`.

Expected within ~2s of page load:
- A horizontal fNBA filter bar appears above the stats table.
- Three new column headers (eFG%, TS%, USG%) appear at the right edge of the table header.
- Each player row has three new cells with real values (e.g. `.563`, `.617`, `36.8`). Mapped players show numbers; unmapped show `-`.
- The traditional stat cells (PTS, REB, AST, etc.) match nba.com Season + Per Game numbers (since Season + PerGame is the default filter).
- Yahoo's native stat-range filter is greyed out with "(fNBA active)" appended.

## 2. Change the window dropdown to "L5"

Within ~1s:
- Every cell repaints with Last-5-games values.
- The status pill shows "Updated <time>".
- A new pair of nba.com requests fires (visible in DevTools Network if the page is open).

## 3. Switch per-mode to "Per 36"

Cells re-paint with per-36-minute values. Round-trip should be sub-second (cache hit).

## 4. Click the refresh button

Even though the cache is warm, a fresh network request fires. The cells re-paint (likely identical values, but a new `fetchedAt`).

## 5. Navigate to My Team

Same overlay applies. Bench and starter rows both get fNBA columns.

## 6. Reload the page

Filter selections persist (chrome.storage.sync). Last5/Per36 should be pre-selected.

## 7. Service worker debug

Open the SW DevTools. Run:
```js
await fnba.loadMapping("2025-26");
```
Expected: an array with one entry per Yahoo player you have viewed across My Team and Players. Length grows as you visit different pages and rosters.
```

- [ ] **Step 17.2: Commit**

```bash
git add docs/SMOKE.md
git commit -m "docs: Plan 2 smoke checklist"
```

---

## Verifiable output check

After Task 17, you should be able to:

1. `npm run build` succeeds.
2. Load `dist/` as unpacked extension (or reload existing install).
3. Navigate to your Yahoo Players page. See filter bar + 3 new columns + overridden traditional stats.
4. Change window and per-mode; numbers repaint.
5. Click refresh; new fetch fires.
6. My Team page works identically.
7. `npm test` total count: 27 (Plan 1) + ~30 new = ~57 passing tests.
8. CI green on push.

If any of those fail, fix before considering Plan 2 done. Plan 3 (tooltip + options page) starts after this is shipped and merged.

---

## Self-review notes (author)

- **Spec coverage:**
  - Filter bar with Window / Per-mode dropdowns + refresh + status pill: Tasks 9, 10.
  - Injected columns (eFG%, TS%, USG%): Task 11.
  - Base stat override when filter active: Task 11.
  - Yahoo native filter de-emphasis: Task 15.
  - Pages in v1 scope (My Team, Players): Tasks 13, 14.
  - Player mapping bootstrap (deferred from Plan 1): Tasks 2, 3, 4, 5.
  - Settings persistence in `chrome.storage.sync`: Task 9.
  - Configurability via columns/windows/perModes: inherited from Plan 1; consumed in Tasks 10, 11.
  - Refresh button forces fresh fetch (force-fresh path): Task 13's `onRefresh`.
  - Sortable columns (spec mention): NOT implemented in this plan. The spec said "sortable via the same click pattern Yahoo uses. If Yahoo's native sort can't be hooked, the content script implements its own click-to-sort." Plan 2 keeps the columns unsorted for v1 because (a) Yahoo's native sort almost certainly will not handle our injected cells, (b) implementing a click-to-sort is one more day's work, and (c) sorting was not load-bearing in the user's brainstorm answers. Flag as Plan 2 follow-up.

- **Placeholder scan:** No "TBD", "TODO", or "fill in details" in implementation steps. The two acknowledged "patch this for your fixture's shape" notes (Task 7 team extraction, Task 11 override cell selector) are unavoidable: the engineer must observe the actual fixture HTML the user captures.

- **Type consistency:** `YahooPlayer` (from Plan 1's `playerMapping.ts`) used uniformly. `FilterSettings` from Task 9 used identically in Task 10 and Task 13. `PageInfo.kind` consumed in Tasks 12, 13, 14. `BootstrapPlayersRequest` / `BootstrapPlayersResponse` defined in Task 4, consumed in Tasks 5, 13.

- **Sortable-columns gap** documented above. Adding it as a 21st task would inflate the plan; deferring matches the user's prior tendency to pick narrower MVPs (chose B in brainstorming question 1).
