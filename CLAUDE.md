# CLAUDE.md

Project conventions and technical context for AI coding agents working in this repo. Read this before making changes.

## What this is

fNBA is a Chromium MV3 extension that overlays advanced metrics (eFG%, TS%, USG%) from nba.com/stats onto Yahoo Fantasy Basketball pages, plus adds game-based time windows (Last 5, Last 10) and per-mode filters (Per 36, Per 100 poss) that Yahoo does not natively support.

Tech stack: TypeScript (strict + `noUncheckedIndexedAccess`), Vite, `@crxjs/vite-plugin`, Vanilla Web Components for UI (no React or chart libs in v1), Vitest with `fake-indexeddb` for tests, GitHub Actions for CI.

## Workflow

For any non-trivial change, follow the superpowers skill chain. Do not skip stages.

1. **brainstorming** to turn an idea into an approved design spec. Spec lives at `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
2. **writing-plans** to break the spec into TDD tasks with exact file paths and code. Plan lives at `docs/superpowers/plans/YYYY-MM-DD-<feature>-plan.md`.
3. **subagent-driven-development** or **executing-plans** to ship the plan. Each task gets a fresh subagent, then spec-compliance review, then code-quality review.

When in doubt, prefer one cohesive plan that produces shippable software. If the spec covers multiple subsystems, split into sequential plans (e.g. `plan-1-foundation`, `plan-2-content-overlay`).

## Where things live

```
docs/superpowers/specs/    Design specs (the "what" and "why")
docs/superpowers/plans/    Implementation plans (the "how", TDD-driven)
docs/SMOKE.md              Manual pre-release smoke checklist
src/background/            Service worker and its modules
src/shared/                Types, message contracts, config (columns, windows, perModes)
src/content/, src/pages/   Yahoo content script (Plan 2+)
src/ui/                    Web Components (filter bar, tooltip, options) (Plan 2+)
rules/                     declarativeNetRequest static rule files
test/unit/                 Vitest unit tests, one per source module
test/fixtures/             Saved HTML snapshots of Yahoo pages (Plan 2+)
.github/workflows/         CI
```

Each source file has one clear responsibility. Keep files small and focused. The service worker entry (`src/background/index.ts`) is the only file that wires modules together.

## TDD discipline

For any module with logic (anything that is not pure config or static JSON), follow red-green-refactor:

1. Write the failing test first.
2. Run it. Confirm it fails for the right reason (missing module, wrong assertion).
3. Write the minimum implementation that makes the test pass.
4. Run the test. Confirm green.
5. Commit.

The plan format already encodes this as numbered steps with fenced code blocks. Treat plan code blocks as authoritative. If you find a real issue with a plan step, stop and surface it before deviating.

The only file in Plan 1 that has no unit tests is `src/background/index.ts`. It is verified via the `docs/SMOKE.md` checklist instead, because mocking the entire SW environment costs more than it pays back.

## Before committing

Run all three. Any failure blocks the commit.

```bash
npm run typecheck
npm test
npm run build
```

CI runs the same chain. Keep it green.

## Code organization rules

- `noUncheckedIndexedAccess` is enabled. Array and object index reads return `T | undefined`. Use non-null assertions (`!`) only when you have already established the index is in range (e.g. inside a fully populated DP table).
- Local imports use `.js` extensions even though the source files are `.ts`. This is required for the NodeNext / Bundler module resolution we use.
- Type imports use `import type { ... }` syntax. Mixed value-and-type imports are fine.
- Do not name new types `Request` or `Response`. The TS DOM lib defines those globally and our code already collided once. Use `MessageRequest`, `MessageResponse`, or domain-specific names.

## Configurability

Adding a new advanced column, time window, or per-mode is a one-line config change, not a code change:

- New column: append to `ADVANCED_COLUMNS` in `src/shared/columns.ts`.
- New window (e.g. Last 7): append to `WINDOWS` in `src/shared/windows.ts`.
- New per-mode: append to `PER_MODES` in `src/shared/perModes.ts`.

The filter bar, cache keys, table columns, and tooltip rows all read from these configs.

## Technical gotchas (battle-scarred)

**nba.com/stats has aggressive bot detection.** All of the following must be true for requests to succeed from a Chrome MV3 extension:

1. `host_permissions` in the manifest includes `https://stats.nba.com/*`.
2. The fetch happens from the service worker, not a content script (content scripts hit CORS).
3. The `rules/nba-headers.json` declarativeNetRequest file sets `Origin`, `Referer`, `User-Agent`, `Accept`, `Accept-Language`, `x-nba-stats-origin: stats`, `x-nba-stats-token: true`.
4. The same DNR file removes `Sec-Fetch-Site`, `Sec-Fetch-Mode`, `Sec-Fetch-Dest`, and the `sec-ch-ua-*` family. Without removal, Akamai Bot Manager identifies the request as an extension fetch and returns 503 "Content Unavailable" with a Bot Manager challenge page.

**Dynamic `import()` is not allowed inside a service worker.** The HTML spec forbids it. To expose internal functions for SW DevTools smoke testing, attach them to `globalThis.fnba` in `src/background/index.ts`. Do not call `await import(...)` from SW code.

**`chrome.runtime.sendMessage` called from inside the same SW does not loop back** to that SW's `onMessage` listener. It dispatches to other contexts (content scripts, popups). For SW-internal smoke tests, call handlers directly via `fnba.*` debug handles instead.

**Yahoo player IDs are not NBA player IDs.** The Yahoo to NBA mapping is built once per season via `buildMapping(yahoo, nba)` in `src/background/playerMapping.ts` and persisted in `chrome.storage.local` keyed by season string (e.g. `fnba.mapping.2025-26`). The actual bootstrap that fetches both lists is deferred to Plan 2 because it requires Yahoo DOM scraping that only a content script can do. The matcher (`buildMapping`) ships in Plan 1 and is independently testable.

**Yahoo renames CSS classes periodically.** Page detection and element selection inside content scripts must be href-based (`a[href*="/nba/players/"]`), not class-based.

## What is and is not in scope

In scope:

- The two Yahoo pages explicitly listed in the spec (`/team`, `/players`).
- The three advanced columns (eFG%, TS%, USG%), three windows, three per-modes.
- The hover-preview-plus-click-to-pin tooltip with the Season vs L5 vs L10 table.

Deferred (v2 or later, listed in the spec's Future Work):

- Spider/radar tooltip view.
- Matchup and draft pages (different DOM, SPA routing).
- Injury alerts from external sources.
- Custom column picker UI.
- Per-category fantasy scoring weights.

Do not implement deferred features without an updated spec.

## License

MIT. See `LICENSE` once it is added.
