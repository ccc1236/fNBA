# fNBA Plan 2 - Follow-ups

Captured 2026-05-16 at the end of the live-smoke session. Plan 2's implementation (Batches A-G) plus all interactive smoke fixes are committed on branch `plan-2-content-overlay`. The Players page works end-to-end. The items below are known limitations and deferred polish.

## State at pause

- Branch `plan-2-content-overlay`, HEAD `8e5d5f0` ("re-sort tbody by the active-sort column")
- Main is still at `v0.0.1`
- `npm test` shows 75 passing
- `npm run typecheck`, `npm run build` clean

## Confirmed working on live Yahoo (Players page)

- Filter bar mounts above the stats table with Window / Per-mode / Refresh / status
- Three new columns (eFG%, TS%, USG%) appended under a centered "Advanced" group header
- Yahoo's traditional stats (PTS, REB, AST, ST, BLK, 3PTM, FG%, FT%, TO) override with filter-aware values from nba.com
- L5 / L10 / Season window switching (player's last N appearances, NOT team-scope - semantic confirmed with user)
- Per Game / Per 36 / Per 100 swap (numeric counting stats react; see open issue below on percentages)
- Refresh button forces a fresh fetch
- Mapping bootstrap persists across pages (`fnba.mapping.<season>` in chrome.storage.local)
- Settings persist via SW relay (chrome.storage.sync isn't reachable from content scripts in this Chrome build)
- Sorted column updates correctly even when its header carries the sort-arrow PUA glyph
- Active sort direction preserved across filter changes (rows re-sort)
- 200 px breathing room on each side, 2400 px ultra-wide cap
- Right-aligned cells matching Yahoo's `Ta-end` convention
- No horizontal scrollbar on standard viewports

## Open issues for v0.0.3 (next plan or hotfix batch)

### 1. Combined columns FGM/A and FTM/FTA don't update

Yahoo renders made-and-attempted in a single cell formatted `9.9/17.4`. Our `BASE_OVERRIDE_COLUMNS` has entries for FG% and FT% individually but no "compound" column shape.

**Fix sketch:** add a compound column descriptor to `src/shared/columns.ts`, e.g.

```ts
{ key: "FGM_FGA", makeKey: "FGM", attemptKey: "FGA", source: "Base",
  decimals: 1, yahooHeader: "FGM/A", separator: "/" }
```

Or skip the columns explicitly (leave at Yahoo's values, document in spec).

### 2. FG% and FT% don't change on Per36 / Per100 swap

Probably correct. Shooting percentages are scale-invariant by definition (made / attempted is the same whether per game or per 36). nba.com's `leaguedashplayerstats` returns identical FG_PCT for all `PerMode` values, so our override writes the same number twice.

**Action:** verify the API does return identical values, then close as "by design". If desired, add a small note/tooltip in the filter bar explaining that shooting percentages don't vary with per-mode.

### 3. Yahoo native stat-range filter de-emphasis unverified

`applyYahooFilterFade` in `src/pages/players.ts` looks for a `<select>` with options matching `/season|last\s*\d/i`. The Stats dropdown on the live page shows "Season (avg)"; the heuristic may not match. Verify on the live DOM, adjust the option-text regex if needed.

### 4. Sortable injected columns

eFG%, TS%, USG% have no click handler. Yahoo's native sort triggers a full page navigation, so we cannot reuse it. Plan: attach a click handler that calls the same `reSortBy(table, {columnIndex, direction})` we already use after filter changes. Toggle direction on repeat click; clear other columns' "Selected" class if practical.

### 5. My Team page not smoke-tested on live Yahoo

The DOM scraper and page module passed against the saved fixture (`test/fixtures/yahoo/myTeam.html`). Live verification still pending. The My Team page may have starters / bench split rows and a different filter widget; check that the scraper picks up the correct stats table (the one with the most player anchors) and that overrides target the right cells.

## Bigger questions to revisit later

- Spider chart tooltip view (deferred to v2 per spec)
- Injury alerts via FantasyLabs / NBA player-status field
- Per-category fantasy scoring weights
- Matchup and draft pages (different DOM, SPA routing)
- Custom column picker in the options page
- Options page itself (Plan 3 territory)

## Recommended next session bootstrap

1. Read `CLAUDE.md` (now contains every Yahoo gotcha we've discovered).
2. Read this file.
3. Read the original Plan 2 doc plus its "Post-fixture revisions" addendum.
4. Pick from the open issues. Issue 1 (combined columns) is the most user-visible and a good warm-up; Issue 4 (sortable injected columns) is the most natural extension of the current sort logic.

When work resumes, the standard cycle still applies: brainstorming for any design-level item, then writing-plans for a fresh plan, then subagent-driven-development to execute.
