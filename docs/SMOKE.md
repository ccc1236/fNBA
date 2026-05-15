# Smoke Test — Plan 1

Run this manually after a `npm run build` + load-unpacked, before tagging a Plan 1 release.

**About the SW console:** Chrome's DevTools may show `allow pasting` as a warning when you first paste into the console. Type the literal words `allow pasting` and press Enter once to unblock pasting for the session.

**Why we don't use `chrome.runtime.sendMessage` here:** `chrome.runtime.sendMessage` called from inside the service worker itself does **not** dispatch to its own `onMessage` listener — it sends to other contexts (content scripts, popups). In Plan 1 those don't exist yet, so any `sendMessage` call from the SW console will fail with `"Could not establish connection"`. We call the handler directly via the `fnba` debug surface instead. The `onMessage` listener is still wired and will be exercised by Plan 2's content script.

## 1. Service worker starts cleanly

- Open `chrome://extensions`, find fNBA, click "service worker" (or "service worker (inactive)" — clicking wakes it).
- DevTools console: expect `[fNBA] service worker booted`.

## 2. nba.com/stats fetch succeeds (no mapping yet)

In the SW console:

```js
await fnba.getPlayerStats({
  type: "getPlayerStats",
  yahooIds: ["unknown"],
  window: "Season",
  perMode: "PerGame",
});
```

Expected:
- Returned value: `{type: "getPlayerStatsResponse", byYahooId: {unknown: null}, fetchedAt: <ms>}`
- Network tab: two 200 responses from `stats.nba.com/stats/leaguedashplayerstats` (one Base, one Advanced).
- Repeating the call within 6h hits cache (no new network request).

## 3. Force-fresh bypasses cache

```js
await fnba.getPlayerStats({
  type: "getPlayerStats", yahooIds: [], window: "Last5", perMode: "Per36", forceFresh: true,
});
```

Expected: new network requests even if the previous Last5+Per36 call was cached.

## 4. Bad request gracefully rejected (via the message-listener path)

To exercise the message-listener path (which Plan 2's content script will use), open any page where the extension's content scripts will eventually run — for v0.0.1, the simplest is to open `chrome://extensions/` itself won't work (chrome:// is privileged). Skip this step in Plan 1 smoke; it will be covered by Plan 2 once a content script exists.

If you want to spot-check the type guard now, call it directly:

```js
const { isGetPlayerStatsRequest } = await import(
  chrome.runtime.getURL("assets/messages.js")
);
isGetPlayerStatsRequest({ type: "garbage" }); // → false
```

(The exact `assets/messages.js` filename may include a content hash — find it via `chrome://extensions` → fNBA → inspect → Sources → assets/.)

## 5. Manual mapping smoke

Dynamic `import()` is forbidden inside service workers (HTML spec), so we
call `saveMapping` via the `fnba` debug object instead:

```js
await fnba.saveMapping("2025-26", [
  { yahooId: "luka", nbaId: 1629029, name: "Luka Dončić", matchedBy: "manual" },
]);
await fnba.getPlayerStats({
  type: "getPlayerStats",
  yahooIds: ["luka"],
  window: "Season",
  perMode: "PerGame",
});
```

Expected: `byYahooId["6015"]` is a populated `PlayerStatRow` (name, teamAbbr, stats with PTS/REB/AST/EFG_PCT/TS_PCT/USG_PCT, etc.) instead of `null`.

## 6. Cache inspection

```js
// Confirm the cache layer is alive:
await fnba.cache.get("lps:2025-26:Base:PerGame:0"); // returns the cached rows array
```

A non-null return after step 2 confirms IndexedDB persistence is working.

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
