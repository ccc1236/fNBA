# fNBA — Yahoo Fantasy NBA Advanced-Stats Overlay

**Status:** Design approved 2026-05-15
**Target:** Chromium MV3 extension, MIT-licensed, public GitHub repo

## Goal

Yahoo Fantasy Basketball only exposes traditional box-score stats and day-based time windows (Last 7/14/30, Season, Today). fNBA overlays:

1. **Advanced metrics** (eFG%, TS%, USG%) sourced from nba.com/stats, sortable, injected as new columns into Yahoo's player tables.
2. **Game-based time windows** (Last 5 GP, Last 10 GP) in addition to Yahoo's native day-based windows.
3. **Per-mode toggle** (Per Game, Per 36 minutes, Per 100 possessions) — Yahoo only shows Per Game.
4. **Hover/click tooltip** on player names showing a Season vs L5 vs L10 comparison table for fast add/drop decisions.

When the fNBA filter is active, *all* stat columns in the table — including Yahoo's traditional columns — are overridden with nba.com data for the chosen window, so the row is internally consistent.

## Non-goals (v1)

- Spider/radar chart tooltip view (deferred to v2)
- Matchup, draft, and live-stat-tracker pages (deferred — those use React/SPA routing)
- Injury alerts from @fantasylabsnba / Twitter (deferred to v2; see Future Work)
- Mobile, multi-sport, league-format-specific scoring overlays
- Settings sync conflict resolution beyond what `chrome.storage.sync` gives for free

## Supported pages (v1)

- `basketball.fantasysports.yahoo.com/nba/*/team` (My Team)
- `basketball.fantasysports.yahoo.com/nba/*/players` (Players / Free Agents / Research)

Page detection is href-based, not class-based — Yahoo renames CSS classes periodically; hrefs are stable.

## Architecture

Three MV3 components:

### Service worker (`src/background/`)
Single owner of all nba.com/stats access. Responsibilities:

- HTTP client for nba.com/stats with header spoofing applied via `declarativeNetRequest` modify-headers rules (User-Agent, Referer, x-nba-stats-origin, x-nba-stats-token, Accept-Language).
- In-memory + IndexedDB cache, keyed by `(endpoint, window, perMode, season)`. Default TTL 6h; refresh button bypasses cache.
- Yahoo → NBA player ID mapping table, persisted in `chrome.storage.local`, keyed by season.
- ~1 req/sec throttled queue; 60s cooldown on 429.
- Typed message router; only public API to content scripts.

### Content script (`src/content/`)
Runs on Yahoo Fantasy basketball pages. Responsibilities:

- Page detection via URL.
- Per-page modules (`src/pages/myTeam.ts`, `src/pages/players.ts`) detect the player table, scrape Yahoo player IDs from `a[href*="/nba/players/"]`, request stats from the SW, inject columns and override traditional stat cells.
- Attaches hover/click handlers to player anchors that mount the tooltip component.
- Mounts the `<fnba-filter-bar>` above the player table.

### UI surface (`src/ui/`)
Web Components with shadow DOM (isolates from Yahoo's CSS and vice-versa):

- `<fnba-filter-bar>` — *Window* dropdown, *Per mode* dropdown, refresh ⟳ button, status pill.
- `<fnba-tooltip>` — hover preview + click-to-pin tooltip rendering the Season/L5/L10 comparison table.
- `<fnba-options>` — full-page options UI, opened via the toolbar action.

## Data flow

1. Content script mounts → detects page → scrapes Yahoo player IDs visible on screen.
2. Sends `getPlayerStats({yahooIds, window, perMode})` to the service worker.
3. Service worker checks cache:
   - Hit → return mapped-by-Yahoo-ID.
   - Miss → calls `leaguedashplayerstats` twice (once with `MeasureType=Advanced` for adv columns, once with `MeasureType=Base` for the override numbers), with the chosen `LastNGames` (0 for Season, 5 for L5, 10 for L10) and `PerMode`. Caches both responses.
4. Content script rewrites the table: appends adv columns, overrides existing stat cells with returned values, sets sort handlers.
5. On hover of a player anchor, content script asks SW for that one player's full `{Season, L5, L10}` triplet at the current per-mode. Tooltip mounts.

### Player ID mapping

Yahoo IDs ≠ NBA IDs. First run per season:

1. SW fetches NBA's `commonallplayers` endpoint.
2. SW scrapes Yahoo's own player search results to get the full Yahoo player list for the active league.
3. Matches by `(normalized_name, team_abbr)` with Levenshtein fallback for name spelling variants.
4. Unmatched players surface in the options page for one-time manual correction.

Mapping is persisted in `chrome.storage.local`, keyed by season string (e.g. `2025-26`). Stale entries are invalidated when a new season is detected.

## Configurability

Both column sets and time windows are config-driven, not hard-coded, so they're extensible without architectural changes:

- `src/shared/columns.ts` — array of `{key, label, source, format}`. Adding NETRTG = one entry.
- `src/shared/windows.ts` — array of `{key, label, lastNGames}`. Adding L7 = one entry; the nba.com endpoint accepts any integer N.
- Per-mode options live in `src/shared/perModes.ts`.

Filter bar dropdowns, cache keys, table columns, and tooltip rows all read from these configs.

## UI specifications

### Filter bar (above each supported page's player table)

Thin horizontal bar, custom element with shadow DOM, ~36px tall. Left to right:

- "fNBA" wordmark / icon (visual anchor; clicking opens options page)
- *Window* dropdown: Season · Last 5 GP · Last 10 GP
- *Per mode* dropdown: Per Game · Per 36 · Per 100 poss
- Refresh ⟳ button — invalidates current cache key, refetches, shows "Updated · just now" pill for 4s
- Status pill (right-aligned): shows last-update timestamp, or `⚠ stats unavailable` on error

While fNBA filter is active, Yahoo's own stat-range selector is visually de-emphasized (greyed) with a small "← fNBA active" note next to it.

### Injected columns

Three columns appended to the right of Yahoo's existing stat columns:

- **eFG%** — Effective Field Goal Percentage
- **TS%** — True Shooting Percentage
- **USG%** — Usage Rate

Sortable via the same click pattern Yahoo uses. If Yahoo's native sort can't be hooked, the content script implements its own click-to-sort that reorders rows in place.

A 14×14px slot is reserved at the right edge of each row for a future status icon (injury, GTD, etc.) — not wired in v1.

### Tooltip

Web Component (`<fnba-tooltip>`). Behavior:

- **Hover** any player anchor for 300ms → preview tooltip appears below the anchor.
- **Click** the player name → tooltip "pins" with a close ✕ in the top-right corner. ESC, click-outside, or opening another pinned tooltip dismisses it.
- Only one pinned tooltip exists at a time.
- Content: dark card, ~340px wide. Header shows `Name · Team · Position · current per-mode`. Body is a three-column table: rows for PTS, REB, AST, STL, BLK, 3PM, FG%, FT%, eFG%, TS%, USG%. Columns: Season · L5 · L10. L5 column visually emphasized (gold accent) because it's the "what have you done lately" signal.

### Options page

Opened by clicking the Chrome toolbar icon. Sections:

- **API health** — green/red dot, last successful fetch timestamp, manual test button.
- **Cache** — current size, "Clear cache" button.
- **Unmapped players** — list of Yahoo players the mapping couldn't auto-resolve; dropdown next to each to manually assign an NBA player.
- **Preferences** — tooltip trigger mode override (hover-pin / hover-only / click-only), refresh cadence override (default 6h, can set to 1h / 12h / 24h / off).
- **Diagnostics** — "Export logs" button (downloads JSON of recent SW requests for issue reports).

## Error handling

| Condition | Behavior |
|-----------|----------|
| nba.com 403 or timeout | Filter bar status pill turns red `⚠ stats unavailable, retrying in 30s`. Advanced columns show `—`. Traditional columns fall back to Yahoo's native rendering (override is skipped). |
| Player not in mapping table | That player's row shows `—` in adv columns; cell hover-title says "No mapping — fix in Options." |
| Rate limit (429) | SW enters 60s cooldown. Status pill: `⚠ rate-limited, cooldown 60s`. UI continues showing cached data. |
| Yahoo DOM unrecognized | Content script logs a one-time console warning with the page URL and exits cleanly. No UI is injected. (Self-disabling so a Yahoo redesign doesn't break the user's normal Yahoo experience.) |

## Repo layout

```
fnba/
  manifest.json
  vite.config.ts
  package.json
  tsconfig.json
  src/
    background/         # service worker entry, nba.com client, cache, mapping, message router
    content/            # content script entry, page-router
    pages/              # myTeam.ts, players.ts (per-page DOM hooks)
    ui/                 # filter-bar.ts, tooltip.ts, options.ts (Web Components)
    shared/             # types, message contracts, columns/windows/perModes config, constants
  public/
    icons/              # 16/32/48/128 PNGs
  test/
    unit/               # vitest: cache, mapping algorithm, header rules, message contracts
    fixtures/           # saved HTML snapshots of Yahoo pages
    dom/                # tests that run content script against fixtures
    e2e/                # Playwright smoke test (optional, behind a flag)
  docs/
    README.md           # what it is, install, screenshots
    PRIVACY.md          # required for Chrome Web Store
    CONTRIBUTING.md
    SMOKE.md            # manual pre-release checklist
    superpowers/specs/  # design docs (this file)
  .github/
    workflows/ci.yml    # typecheck + test + build + zip artifact
```

## Tech stack

- **TypeScript** (strict mode)
- **Vite** + **`@crxjs/vite-plugin`** — standard MV3 build chain, hot-reloads content scripts during dev
- **Vanilla Web Components** for UI — zero framework bundle in injected code
- **Vitest** for unit tests
- **Playwright** for optional e2e
- **ESLint + Prettier**
- No runtime UI dependencies (no React, no chart library — spider chart deferred)

## Testing strategy

- **Unit:** cache, mapping algorithm, header-rewriter rule construction, message contract serialization.
- **DOM fixtures:** saved HTML snapshots of My Team + Players pages live in `test/fixtures/`. Tests load each fixture into JSDOM, run the relevant page module, and assert that adv columns inject, stat cells override, and the filter bar mounts.
- **Manual:** `docs/SMOKE.md` checklist (5 minutes) run before tagging any release: load against live Yahoo, test each page, test refresh, test tooltip, test the unmapped-player options flow.

## CI

GitHub Actions workflow on push/PR to `main`:

1. Typecheck
2. Lint
3. Unit + DOM fixture tests
4. Build production bundle
5. On tag push: package `.zip` and attach to GitHub Release

## Future work (not v1)

- **Spider/radar tooltip view** — toggle button in tooltip header switches between table and spider chart. Hand-rolled SVG (no chart library) to keep bundle small.
- **Injury / status alerts** — small icon in the reserved 14×14 column slot. Source TBD: NBA.com's `commonallplayers` player-status field is the most stable; @fantasylabsnba Twitter scraping is fragile and the X API is paywalled.
- **Matchup page support** — different DOM, separate page module.
- **Draft room support** — React-heavy SPA; needs route-change listener and more careful injection.
- **Custom column picker** — let user choose which adv columns appear (the config is already there; just needs UI).
- **Per-category fantasy scoring weights** — weight each column by the user's league scoring settings to produce a per-player "fNBA score."

## Open questions for implementation phase

- Exact NBA season-string format Yahoo uses vs nba.com — verify when building the mapping.
- Whether Yahoo's sort handler can be hijacked or we always re-sort manually.
- IndexedDB vs `chrome.storage.local` for the cache — IndexedDB scales better but adds boilerplate; revisit if cache stays under 1MB.
