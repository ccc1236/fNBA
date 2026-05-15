import { Cache } from "./cache.js";
import { Throttle, ThrottledError } from "./throttle.js";
import { fetchLeagueDashPlayerStats, RateLimitedError, UpstreamUnavailableError } from "./nbaClient.js";
import { loadMapping } from "./playerMapping.js";
import { currentSeason } from "./season.js";
import { perModeByKey } from "../shared/perModes.js";
import { windowByKey } from "../shared/windows.js";
import { ADVANCED_COLUMNS, BASE_OVERRIDE_COLUMNS } from "../shared/columns.js";
import {
  isGetPlayerStatsRequest,
  type ErrorResponse,
  type GetPlayerStatsRequest,
  type GetPlayerStatsResponse,
  type MessageResponse as MsgResponse,
} from "../shared/messages.js";
import type { PlayerStatRow, YahooPlayerId } from "../shared/types.js";
import { log } from "../shared/logger.js";

const cache = new Cache({ dbName: "fnba", defaultTtlMs: 6 * 60 * 60 * 1000 });
const throttle = new Throttle({ intervalMs: 1100, cooldownMs: 60_000 });

const cacheKey = (req: GetPlayerStatsRequest, measure: "Base" | "Advanced", season: string): string =>
  `lps:${season}:${measure}:${req.perMode}:${windowByKey(req.window).lastNGames}`;

async function fetchWithCache(
  req: GetPlayerStatsRequest,
  measure: "Base" | "Advanced",
  season: string,
): Promise<PlayerStatRow[]> {
  const key = cacheKey(req, measure, season);
  if (!req.forceFresh) {
    const hit = await cache.get<PlayerStatRow[]>(key);
    if (hit) return hit;
  }
  const rows = await throttle.run(() =>
    fetchLeagueDashPlayerStats({
      season,
      measureType: measure,
      perMode: perModeByKey(req.perMode).apiValue as GetPlayerStatsRequest["perMode"],
      lastNGames: windowByKey(req.window).lastNGames,
    }),
  );
  await cache.set(key, rows);
  return rows;
}

async function handleGetPlayerStats(req: GetPlayerStatsRequest): Promise<MsgResponse> {
  try {
    const season = currentSeason();
    const mapping = await loadMapping(season);
    const yahooToNba = new Map(mapping.map((m) => [m.yahooId, m.nbaId]));

    const [base, adv] = await Promise.all([
      fetchWithCache(req, "Base", season),
      fetchWithCache(req, "Advanced", season),
    ]);
    const byNbaId = new Map<number, PlayerStatRow>();
    for (const row of base) byNbaId.set(row.nbaId, { ...row, stats: { ...row.stats } });
    for (const row of adv) {
      const existing = byNbaId.get(row.nbaId);
      if (existing) Object.assign(existing.stats, row.stats);
      else byNbaId.set(row.nbaId, row);
    }

    const byYahooId: Record<YahooPlayerId, PlayerStatRow | null> = {};
    for (const yahooId of req.yahooIds) {
      const nbaId = yahooToNba.get(yahooId);
      byYahooId[yahooId] = nbaId ? byNbaId.get(nbaId) ?? null : null;
    }

    const response: GetPlayerStatsResponse = {
      type: "getPlayerStatsResponse",
      byYahooId,
      fetchedAt: Date.now(),
    };
    return response;
  } catch (e) {
    if (e instanceof RateLimitedError || e instanceof ThrottledError) {
      throttle.triggerCooldown();
      const r: ErrorResponse = { type: "error", code: "RATE_LIMITED", message: String(e) };
      return r;
    }
    if (e instanceof UpstreamUnavailableError) {
      return { type: "error", code: "UPSTREAM_UNAVAILABLE", message: String(e) };
    }
    log.error("handleGetPlayerStats", e);
    return { type: "error", code: "UNKNOWN", message: String(e) };
  }
}

// Eagerly open the cache so first request is fast.
void cache.open();

// Expose configs to the SW console for manual smoke-testing.
(globalThis as unknown as Record<string, unknown>).fnba = {
  ADVANCED_COLUMNS,
  BASE_OVERRIDE_COLUMNS,
  cache,
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (isGetPlayerStatsRequest(msg)) {
    void handleGetPlayerStats(msg).then(sendResponse);
    return true; // async response
  }
  sendResponse({ type: "error", code: "BAD_REQUEST", message: "unknown message" });
  return false;
});

log.info("service worker booted");
