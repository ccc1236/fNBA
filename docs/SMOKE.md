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
