# fNBA Plan 2 - Follow-ups

Originally captured 2026-05-16 at the end of the first live-smoke session. Updated 2026-05-18 after the spider tooltip work landed.

## State at pause (2026-05-18)

- Branch `main`, HEAD is the `v0.0.11` tag
- Releases shipped:
  - `v0.0.1` foundation
  - `v0.0.2` content overlay
  - `v0.0.3` viewport-scaled breathing room
  - `v0.0.4` My Team page support + two-pass layout
  - `v0.0.5` smoke fixes
  - `v0.0.6` compound FGM/A + derived FG%/FT% columns
  - `v0.0.7` no-table log demoted
  - `v0.0.8` primary logo + brand color
  - `v0.0.9` filter bar wordmark in brand blue
  - `v0.0.10` spider tooltip
  - `v0.0.11` spider tooltip fixes (per-mode click, USG% formatting, softened no-mapping message, ROSTERSTATUS fix)
- `npm test`: 124 passing
- `npm run typecheck`, `npm run build` clean

## Confirmed working on live Yahoo

Players page and My Team page, on the live site, against the current build:

- Filter bar mounts above the stats table with Window / Per-mode / Refresh / status
- Three new columns (eFG%, TS%, USG%) appended under a centered "Advanced" group header
- Yahoo's traditional stats (PTS, REB, AST, ST, BLK, 3PTM, FG%, FT%, TO, FGM/A, FTM, FTA) override with filter-aware values from nba.com
- L5 / L10 / Season window switching (player's last N appearances, not team scope)
- Per Game / Per 36 / Per 100 swap on counting stats
- Refresh button forces a fresh fetch of both the league cache and the NBA player list
- Sorted column updates correctly even when its header carries the sort-arrow PUA glyph
- Active sort direction preserved across filter changes (rows re-sort)
- Right-aligned cells matching Yahoo's `Ta-end` convention
- Breathing room scales with viewport: padding at the narrowing-point ancestor, `min(200px, 8vw)` left and `min(250px, 10vw)` right
- Spider tooltip: hover any player for 300 ms to preview, click to pin. Three polygons (Season gray, L10 teal, L5 gold) on 9 axes (3PM, PTS, REB, AST, STL, BLK, TO inverted, TS%, USG%) on league-percentile scale, with raw values stacked next to each axis label. ESC, click outside, the X button, and clicking another player all dismiss the pin. Per-mode changes while pinned refresh the polygons in place.
- Brand: blue moon icon set (16/32/48/128) plus filter bar wordmark in `#2D4A5B`

## Resolved

### Combined FGM/A and FTM/FTA columns (originally Issue #1 from prior list)

Fixed in v0.0.6. Root cause was twofold:

1. Missing compound column type for Yahoo's `FGM/A` cell and no derived column type for A/T. Added `CompoundColumnDef` (with `makeKey` + `attemptKey` + `separator` + `yahooHeader`) and `DerivedColumnDef` (with `numeratorKey` + `denominatorKey`). Both are iterated alongside `BASE_OVERRIDE_COLUMNS` inside `renderColumns`.
2. nba.com's Advanced MeasureType ignores PerMode for counting stats. When we merged Advanced over Base, Advanced's season-totals FGM overwrote Base's per-game FGM. Extracted the merge into `src/background/mergeStats.ts` and reversed the order: Advanced seeds first, Base wins on overlap. Locked in with four unit tests in `test/unit/mergeStats.test.ts`.

FTM and FTA shipped as separate columns (not compound) and FT% is now derived from displayed FTM/FTA in the same v0.0.6 work.

### FG% / FT% / 3P% / eFG% / TS% / USG% do not change on Per36 / Per100 (originally Issue #2)

By design. These are scale-invariant ratios; nba.com returns identical numbers regardless of PerMode. The window dimension (Season / L5 / L10) does change them because the game sample changes. Documented in `CLAUDE.md` under "Ratio stats are scale-invariant across PerMode".

### Yahoo native stat-range filter de-emphasis (originally Issue #3)

Dropped. Yahoo's "Stats" dropdown is no longer a `<select>` element (it's now a custom div/button component), so our heuristic found nothing. Considered swapping to a custom-element selector or moving the hint into fNBA's own filter bar, but settled on removing the `labelYahooFilter` function entirely. The override behavior is self-evident from the changed numbers; we don't need to advertise it. Yahoo's dropdown stays fully functional; clicking it triggers a page reload after which fNBA re-applies its overrides on top.

### My Team page live smoke (originally Issue #5)

Done in the v0.0.4 work. URL pattern `/nba/<leagueId>/<numericTeamId>` matched correctly; breathing room verified on My Team's different ancestor structure; same eight Players-page items confirmed on the roster table.

### Spider/radar tooltip (originally listed under "Bigger questions to revisit later")

Shipped in v0.0.10. Hover/click radar overlay on player names showing Season vs L10 vs L5 polygons on league-percentile scale. Plan: `docs/superpowers/plans/2026-05-17-spider-tooltip-plan.md`, spec: `docs/superpowers/specs/2026-05-17-spider-tooltip-design.md`.

Follow-up fixes in v0.0.11:

- Pinned card stays alive while the user interacts with the filter bar (`safeAreas` dep on the tooltip controller).
- USG% in the tooltip is multiplied by 100 to match the injected USG% column convention.
- "No NBA mapping" message softened to drop the dead-end "Fix in Options" reference.
- Refresh button now invalidates the NBA player list cache too, so players who joined or returned from injury mid-season can be re-mapped; `ROSTERSTATUS === 1` filter on `commonallplayers` dropped so injured / two-way / G-League-assigned players are eligible for mapping as long as they have a `TEAM_ABBREVIATION`.

## Still open

### Sortable injected columns (deferred indefinitely)

eFG%, TS%, USG% have no click handler. User decision: not important right now; revisit when a real use case appears. Design notes if/when we come back:

- Two-state cycle: first click desc, second click asc, repeat
- Visual: small arrow next to active header
- Persist sort across filter changes by capturing direction before `clearFnbaCells` and re-applying after re-render
- Null/dash values sort to the bottom regardless of direction
- Out of scope: removing Yahoo's `Selected` class on Yahoo columns when ours is active (cosmetic)

## Bigger questions to revisit later

- **Options page** (Plan 3 territory). The single biggest unblocker. Would host:
  - Manual-pick dropdown for unmapped Yahoo players (the spider tooltip's no-mapping branch would point here)
  - Custom column picker
  - Per-category fantasy scoring weights
  - Refresh-cadence override (currently hardcoded 6 h)
  - API health / cache size / "Clear cache" + "Export logs" diagnostics
- Spider tooltip table-view toggle. Parked per the spider spec; revisit only if the radar proves insufficient (it has not so far).
- Injury alerts via FantasyLabs / NBA player-status field (source TBD; scraping the public Twitter is fragile, the X API is paywalled).
- Matchup and draft pages. Different DOM and SPA routing; needs its own design pass.

## Recommended next session bootstrap

1. Read `CLAUDE.md` for every Yahoo and Chrome MV3 gotcha we have hit.
2. Read this file.
3. Pick the next item from "Bigger questions to revisit later". The Options page is the natural next big project because it unblocks several smaller items in turn.

When work resumes on a real design-level change, run the standard brainstorming -> writing-plans -> subagent-driven-development cycle.
