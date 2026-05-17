# fNBA Plan 2 - Follow-ups

Captured 2026-05-16 at the end of the live-smoke session. Updated 2026-05-17 after the My Team smoke and v0.0.3 / v0.0.4 patch ships.

## State at pause (2026-05-17)

- Branch `main`, HEAD is the `v0.0.4` tag
- Releases shipped: `v0.0.1` (foundation), `v0.0.2` (content overlay), `v0.0.3` (viewport-scaled breathing room), `v0.0.4` (My Team page support + two-pass layout)
- `npm test`: 76 passing (one new test for numeric My Team URL detection)
- `npm run typecheck`, `npm run build` clean

## Confirmed working on live Yahoo (Players page and My Team page)

### Players page
- Filter bar mounts above the stats table with Window / Per-mode / Refresh / status
- Three new columns (eFG%, TS%, USG%) appended under a centered "Advanced" group header
- Yahoo's traditional stats (PTS, REB, AST, ST, BLK, 3PTM, FG%, FT%, TO) override with filter-aware values from nba.com
- L5 / L10 / Season window switching (player's last N appearances, NOT team-scope, semantic confirmed with user)
- Per Game / Per 36 / Per 100 swap on counting stats
- Refresh button forces a fresh fetch
- Sorted column updates correctly even when its header carries the sort-arrow PUA glyph
- Active sort direction preserved across filter changes (rows re-sort)
- Right-aligned cells matching Yahoo's `Ta-end` convention
- Breathing room scales with viewport: padding at the narrowing-point ancestor, `min(200px, 8vw)` left and `min(250px, 10vw)` right

### My Team page (smoked 2026-05-17)
- All eight Players-page items above, on the roster table
- URL pattern `/nba/<leagueId>/<numericTeamId>` now matched correctly
- Breathing room also correct on My Team (different ancestor structure, ratio 1.16 between .RailResponsive and .Rail; lowered `WIDER_BY` threshold to 1.05 to catch it)

## Resolved this session

### FG% / FT% / 3P% / eFG% / TS% / USG% do not change on Per36 / Per100 (Issue #2 from prior list)

By design. These are scale-invariant ratios; nba.com returns identical numbers regardless of PerMode. The window dimension (Season / L5 / L10) does change them because the game sample changes. Documented in `CLAUDE.md` under "Ratio stats are scale-invariant across PerMode".

### My Team page live smoke (Issue #5 from prior list)

Done. All checks pass.

### Yahoo native stat-range filter de-emphasis (Issue #3 from prior list)

Dropped. Yahoo's "Stats" dropdown is no longer a `<select>` element (it's now a custom `<div>`/`<button>` component), so our heuristic found nothing. Considered swapping to a custom-element selector or moving the hint into fNBA's own filter bar, but settled on removing the `labelYahooFilter` function entirely. The override behavior is self-evident from the changed numbers; we don't need to advertise it. Yahoo's dropdown stays fully functional; clicking it triggers a page reload after which fNBA re-applies its overrides on top.

### Combined FGM/A column not updating + A/T not updating (Issue #1 from prior list)

Fixed in v0.0.6.

Root cause was twofold:

1. Missing compound column type for Yahoo's `FGM/A` cell (single `<td>` rendering `made/attempted`) and no derived column type for A/T. Added `CompoundColumnDef` (with `makeKey` + `attemptKey` + `separator` + `yahooHeader`) and `DerivedColumnDef` (with `numeratorKey` + `denominatorKey`). Both are iterated alongside `BASE_OVERRIDE_COLUMNS` inside `renderColumns`.

2. **nba.com's Advanced MeasureType ignores PerMode for counting stats.** When we merged Advanced over Base, Advanced's season-totals FGM (e.g. 644) overwrote Base's per-game FGM (e.g. 9.9). FG% looked correct only because the ratio is the same in either basis. Extracted the merge into `src/background/mergeStats.ts` and reversed the order: Advanced seeds first, Base wins on overlap. Locked in with four new unit tests in `test/unit/mergeStats.test.ts`.

FTM and FTA are shown in separate cells on the views we inspected (not compound), so no compound entry for them yet. Easy to add later if a different Yahoo view turns out to combine them.

## Still open

### 1. Combined columns FGM/A and FTM/FTA do not update

Yahoo renders made-and-attempted in a single cell formatted `9.9/17.4`. Our `BASE_OVERRIDE_COLUMNS` has entries for FG% and FT% individually but no "compound" column shape.

Fix sketch: add a compound column descriptor to `src/shared/columns.ts`, e.g.

```ts
{ key: "FGM_FGA", makeKey: "FGM", attemptKey: "FGA", source: "Base",
  decimals: 1, yahooHeader: "FGM/A", separator: "/" }
```

Or skip the columns explicitly (leave at Yahoo's values, document in spec).

### 3. Sortable injected columns (deferred indefinitely)

eFG%, TS%, USG% have no click handler. User decided this isn't important right now; can revisit when a real use case appears. Design notes if/when we come back:

- Two-state cycle: first click desc, second click asc, repeat
- Visual: small arrow next to active header
- Persist sort across filter changes by capturing direction before `clearFnbaCells` and re-applying after re-render
- Null/dash values sort to the bottom regardless of direction
- Out of scope: removing Yahoo's `Selected` class on Yahoo columns when ours is active (cosmetic)

## Bigger questions to revisit later

- Spider chart tooltip view (deferred to v2 per spec)
- Injury alerts via FantasyLabs / NBA player-status field
- Per-category fantasy scoring weights
- Matchup and draft pages (different DOM, SPA routing)
- Custom column picker in the options page
- Options page itself (Plan 3 territory)

## Recommended next session bootstrap

1. Read `CLAUDE.md` (every Yahoo and Chrome MV3 gotcha we have hit).
2. Read this file.
3. Pick the next item. Issue #1 (combined FGM/A and FTM/FTA columns) is the most user-visible remaining gap.

When work resumes on a real design-level change, run the standard brainstorming -> writing-plans -> subagent-driven-development cycle.
