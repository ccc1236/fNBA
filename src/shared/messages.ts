import type { PerModeKey, PlayerStatRow, WindowKey, YahooPlayerId } from "./types.js";

export const WINDOW_KEYS: readonly WindowKey[] = ["Season", "Last5", "Last10"];
export const PER_MODE_KEYS: readonly PerModeKey[] = ["PerGame", "Per36", "Per100Possessions"];

export interface GetPlayerStatsRequest {
  type: "getPlayerStats";
  yahooIds: YahooPlayerId[];
  window: WindowKey;
  perMode: PerModeKey;
  /** if true, bypass cache and refetch */
  forceFresh?: boolean;
}

export interface GetPlayerStatsResponse {
  type: "getPlayerStatsResponse";
  byYahooId: Record<YahooPlayerId, PlayerStatRow | null>;
  fetchedAt: number;
}

export interface ErrorResponse {
  type: "error";
  code: "RATE_LIMITED" | "UPSTREAM_UNAVAILABLE" | "BAD_REQUEST" | "UNKNOWN";
  message: string;
}

export type Request = GetPlayerStatsRequest;
export type Response = GetPlayerStatsResponse | ErrorResponse;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isGetPlayerStatsRequest(v: unknown): v is GetPlayerStatsRequest {
  if (!isObject(v)) return false;
  if (v.type !== "getPlayerStats") return false;
  if (!Array.isArray(v.yahooIds)) return false;
  if (!v.yahooIds.every((id) => typeof id === "string")) return false;
  if (typeof v.window !== "string" || !WINDOW_KEYS.includes(v.window as WindowKey)) return false;
  if (typeof v.perMode !== "string" || !PER_MODE_KEYS.includes(v.perMode as PerModeKey)) return false;
  if (v.forceFresh !== undefined && typeof v.forceFresh !== "boolean") return false;
  return true;
}
