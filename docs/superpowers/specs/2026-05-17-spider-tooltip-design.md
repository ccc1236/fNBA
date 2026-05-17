# Spider tooltip design

Status: design, not yet implemented
Author: fNBA project
Date: 2026-05-17

## Motivation

The v1 spec called for a hover/click tooltip on player names that compared Season vs L5 vs L10 numbers, supporting fast add/drop and FA pickup decisions. That tooltip was scoped to a later plan and never built. The same spec also listed a "spider/radar view" as deferred Future Work, as a toggle alongside the original table view.

This design proposes shipping the spider view as the only tooltip form, replacing rather than supplementing the deferred table tooltip. If the spider proves insufficient in practice, the table view stays parked and can be added later behind a header toggle.

The animating question for the user is "is this player heating up or cooling off, and where does that put him league-wide right now?" — relevant for both rostered-player evaluation and FA streaming.

## In scope

- A web-component-style tooltip that mounts when a user hovers a player anchor on the Yahoo Fantasy My Team or Players page.
- A 9-axis radar chart with three overlapping polygons (Season, L10, L5) on league-percentile scale.
- Raw stat values rendered next to each axis, color-coded to their window.
- Hover-preview behavior with a 300ms delay, plus click-to-pin with a close affordance.
- League-percentile computation done in the service worker, cached alongside the existing league response.

## Out of scope

- Table view of the same data. Parked as Future Work in the v1 spec; revisit if the spider lacks something.
- Position-filtered or top-300-only percentile contexts. League-wide only.
- Comparing two players head-to-head. Pin-one-at-a-time only.
- Player photo, projection deltas, news headlines, injury icons. None of those exist anywhere else in the extension yet.
- Spider for draft and matchup pages. Those pages are deferred entirely.

## User flow

1. User hovers a player name anchor on `/team` or `/players`.
2. After 300ms a preview tooltip mounts below the anchor showing the spider chart for that player at the currently selected perMode.
3. User can move the cursor off the anchor to dismiss the preview, or click the player name to pin the tooltip.
4. A pinned tooltip persists until any of: pressing ESC, clicking outside the card, clicking the ✕, or opening another pin (only one pinned at a time).
5. Changing window or perMode in the filter bar while pinned re-fetches the underlying data and re-renders the polygons.

## Visual specification

The reference is `docs/logo-samples` and the v6 brainstorm mockup at `.superpowers/brainstorm/.../spider-mockup-v6.html`. Key numbers:

- Card width 340px, dark background `#1F3645` (blue moon darkest), 12px corner radius, soft drop shadow.
- Header strip: player name (14px, weight 600), then `TEAM · POS · perMode` (11px, `#9CA3AF`). Close ✕ at top-right (only when pinned).
- Body holds a 332x370 SVG with the chart centered at `(166, 186)` and chart radius 100.
- 9 axes spaced 40deg apart. Axis order clockwise from 12 o'clock: **3PM, PTS, REB, AST, STL, BLK, TO↓, TS%, USG%**. The downward arrow on TO indicates the axis is inverted (a longer spoke means fewer turnovers, so "longer = better" holds for every axis).
- 5 concentric polygonal gridlines at 20/40/60/80/100 percentile, faint white at 8% opacity, with the 100% ring at 18%.
- 3 player polygons drawn back-to-front so the most-recent window sits on top:
  - Season: stroke `#9CA3AF` at 55% opacity, fill at 18% opacity
  - L10: stroke `#0ABAB5` (mint) at 70% opacity, fill at 22% opacity
  - L5: stroke `#F59E0B` (gold) at 90% opacity, fill at 30% opacity
- Axis labels: key in 11px weight 600 white; raw values stacked below in 10px (Season gray, L10 teal, L5 gold bolded). Top-half axes get a vertical boost on label radius (`R + 18 + |sin(angle)| * 30`) so the downward value stack clears the polygon.
- Legend strip below the chart: three small color swatches with Season / L10 / L5 labels.

## Data model

Tooltip rendering needs, for one Yahoo player at the active perMode:

- Player meta: name, team, position
- Stat triplet across Season, L10, L5 for these 9 keys: `PTS`, `REB`, `AST`, `STL`, `BLK`, `FG3M`, `TOV`, `TS_PCT`, `USG_PCT`
- League percentile for each (key, window) tuple at the active perMode

A new message contract exposed by the service worker:

```ts
type SpiderRequest = {
  type: "getSpiderData";
  yahooId: string;
  perMode: PerMode;
};
type SpiderResponse =
  | { ok: true; data: SpiderData }
  | { ok: false; reason: "no-mapping" | "fetch-failed" };

interface SpiderData {
  name: string;
  team: string;
  position: string;
  perMode: PerMode;
  windows: {
    season: WindowSlice | null;
    L10: WindowSlice | null;
    L5: WindowSlice | null;
  };
}
interface WindowSlice {
  values: Record<SpiderStatKey, number>;     // raw stat values at this window
  percentiles: Record<SpiderStatKey, number>; // 0..100, league-wide
}
type SpiderStatKey = "PTS"|"REB"|"AST"|"STL"|"BLK"|"FG3M"|"TOV"|"TS_PCT"|"USG_PCT";
```

A `WindowSlice` is null when the player has insufficient games played for that window (e.g. a player with 3 GP has no L5 slice). The renderer omits that polygon and dims the legend entry.

The TOV percentile is computed as "percent of the league with a worse-or-equal TOV than this player" (i.e. inverted so higher percentile means fewer turnovers), so the renderer doesn't need to flip it.

## Architecture and data flow

```
content script (player anchor hover)
   |  sendMessage { type: "getSpiderData", yahooId, perMode }
   v
service worker handler
   |  resolves Yahoo -> NBA id via mapping
   |  ensures league response cached for (window, perMode) for each of Season, L10, L5
   |  computes percentiles per (window, perMode) on first need, caches alongside
   |  builds SpiderData with raw + percentile slices
   v
content script receives SpiderData
   |
   v
tooltip component renders the radar
```

The league response was already being fetched and cached for the active window only. The spider extends this: when a spider request arrives, the SW ensures the league responses for *all three* relevant windows at the active perMode are present in cache, fetching whatever is missing. This is the lazy fetch agreed in brainstorming.

Percentile computation is a one-time pass per (window, perMode) league response: for each of the 9 stat keys, sort the league's values for that key and produce a player-id-keyed rank table. Stored alongside the league response in the same cache entry. Subsequent spider requests at the same (window, perMode) reuse the cached rank table.

## States

The tooltip renders one of four states based on the response:

| State | When | Rendering |
|---|---|---|
| Loading | request in flight | header populated from Yahoo DOM if available, body shows axis spokes and a centered "loading..." label, no polygons |
| Ready | `ok: true` and at least Season slice non-null | full chart per visual spec; any null window slice omitted from polygons and dimmed in the legend |
| No mapping | `ok: false`, `reason: "no-mapping"` | header shows player name from Yahoo DOM; body shows centered text "No NBA mapping. Fix in Options." |
| Fetch failed | `ok: false`, `reason: "fetch-failed"` | header shows player name; body shows centered text "Stats unavailable. Retry from filter bar." |

## Trigger and lifecycle

A single `SpiderTooltipController` instance is mounted once per page (lazily, on first hover). It listens for `mouseover` and `click` events on player anchors via event delegation on the table body and manages a single shadow-DOM-bearing `<div>` for the card.

Hover behavior:

- `mouseover` on an anchor starts a 300ms timer
- `mouseout` before 300ms cancels the timer
- on timer fire, mount the card below the anchor and trigger the data fetch
- `mouseout` after mount cancels the request and unmounts the card *unless* the cursor moves into the card itself (the card is the cursor's continuation, so we allow a small relatedTarget check)

Pin behavior:

- `click` on an anchor: stop propagation, prevent default navigation, promote any existing preview to pinned. If no preview, mount + fetch and pin immediately.
- pinned cards show the ✕ button and persist beyond mouseout.
- One pinned card max: opening a new pin dismisses the previous one.

Dismissal of a pinned card:

- ESC key on document
- click outside the card boundary
- click on the ✕ in the card header

Filter-bar changes:

- The spider always shows Season, L10, and L5 together, so the filter-bar window selection does not affect it.
- If the per-mode changes while a card is pinned, the controller re-fetches via `getSpiderData` at the new per-mode and re-renders.
- Window changes are ignored by the tooltip.

## Files and modules

New:

```
src/ui/
  spider-tooltip.ts       # factory + controller; mounts shadow-DOM <div>, hover/click delegation
  spider-chart.ts         # pure SVG renderer; takes a SpiderData and returns/updates an <svg>
  spider-axes.ts          # config: the 9 axis keys, labels, raw-value formatters, ordering

src/background/
  percentiles.ts          # rank-table builder; one pass per (window, perMode)
  spiderService.ts        # SW-side handler for "getSpiderData"; orchestrates triple-window fetch + percentile lookup

src/shared/
  spider.ts               # SpiderRequest / SpiderResponse / SpiderData / SpiderStatKey types

test/unit/
  percentiles.test.ts
  spiderService.test.ts
  spider-axes.test.ts
  spider-chart.test.ts    # snapshot the generated SVG markup for fixed inputs
```

Touched:

- `src/shared/messages.ts` (add SpiderRequest / SpiderResponse to the union)
- `src/background/index.ts` (wire the SW handler; expose on `globalThis.fnba` for smoke testing)
- `src/pages/players.ts` and `src/pages/myTeam.ts` (instantiate the tooltip controller once per page)
- `docs/SMOKE.md` (add tooltip checklist)

The `spider-axes.ts` config follows the existing `columns.ts` / `windows.ts` pattern: adding or reordering axes is a one-line config change.

## Testing strategy

- **Unit (Vitest):**
  - `percentiles.test.ts`: rank-table correctness on small fixed datasets, including ties, missing players, TOV inversion. Edge cases: single-player league, all-equal values.
  - `spiderService.test.ts`: orchestration with mocked SW dependencies; covers cache hits, partial cache miss (Season cached but not L5), Yahoo mapping miss, fetch failure.
  - `spider-axes.test.ts`: formatter functions per axis (`.638` vs `0.638` for ratios, `5.5` vs `5` for counting stats), label ordering.
  - `spider-chart.test.ts`: given a fixed SpiderData, the rendered SVG has the right number of polygons, points are at the expected coordinates, and legend entries dim correctly for null windows.

- **Smoke (`docs/SMOKE.md`):**
  - Hover any player on `/players`: preview appears within ~400ms, polygons render.
  - Click the player: pin sticks, ✕ visible, ESC dismisses.
  - Open a second pin: first dismisses.
  - Change perMode while pinned: chart refreshes.
  - A player with low GP shows two polygons (Season + L10) with the L5 legend dimmed.

There are no DOM-fixture tests for the spider in this iteration. The existing DOM fixture set covers stat-cell overrides; the tooltip mounts via event delegation and is straightforward enough that unit + smoke is sufficient.

## Error handling

| Failure | Behavior |
|---|---|
| Yahoo anchor lacks an extractable player id | Hover does nothing. No mount. |
| Mapping lookup returns no NBA id | Tooltip shows "No mapping" state. |
| Any of the 3 league fetches fail | Tooltip shows "Fetch failed" state. Filter-bar status pill independently turns red per existing handling. |
| Player has 0 GP at the season scope | Tooltip shows "No data for this player" centered, no polygons. Treated as a degenerate Ready state. |
| Cache poisoning (a percentile field is NaN) | Renderer treats NaN as zero percentile (innermost point) and proceeds. Logged as a warning. |

## Future work, deferred

- Table view as a header toggle (the v1 spec's original two-view design). Reassess after living with the spider.
- Position-filtered percentile context as an Options preference.
- "Compare two players" mode via dual pin or a comparison drawer.
- Axis-hover detail popout showing rank, league average, and the player's recent game log for that stat.

## Open questions for implementation phase

- Exact behavior when a player has been traded mid-season. nba.com's response includes their post-trade team only; we may want to show the Yahoo-listed team in the header to match what the user is looking at.
- Whether the 9-axis polygon should animate on first reveal (axes-grow-from-center). Probably no for v1, but worth a try if the static reveal feels flat.
- Where to surface "data freshness" (when was the cache last refreshed). Probably the filter-bar status pill already covers it; revisit if smoke testing exposes a gap.
