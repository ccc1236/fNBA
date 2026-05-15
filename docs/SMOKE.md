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
