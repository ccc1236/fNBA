import type { PerModeKey, PlayerStatRow, SeasonString, WindowKey, YahooPlayerId } from "./types.js";
import type { YahooPlayer } from "../background/playerMapping.js";
import type { FilterSettings } from "./settings.js";

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

export type MessageRequest = GetPlayerStatsRequest;
export type MessageResponse = GetPlayerStatsResponse | ErrorResponse;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isGetPlayerStatsRequest(v: unknown): v is GetPlayerStatsRequest {
  if (!isObject(v)) return false;
  if (v.type !== "getPlayerStats") return false;
  if (!Array.isArray(v.yahooIds)) return false;
  if (!v.yahooIds.every((id) => typeof id === "string")) return false;
  if (typeof v.window !== "string" || !(WINDOW_KEYS as readonly string[]).includes(v.window)) return false;
  if (typeof v.perMode !== "string" || !(PER_MODE_KEYS as readonly string[]).includes(v.perMode)) return false;
  if (v.forceFresh !== undefined && typeof v.forceFresh !== "boolean") return false;
  return true;
}

export interface BootstrapPlayersRequest {
  type: "bootstrapPlayers";
  season: SeasonString;
  players: YahooPlayer[];
}

export interface BootstrapPlayersResponse {
  type: "bootstrapPlayersResponse";
  added: number;
  unmapped: YahooPlayerId[];
}

export type AnyRequest = GetPlayerStatsRequest | BootstrapPlayersRequest;
export type AnyResponse = GetPlayerStatsResponse | BootstrapPlayersResponse | ErrorResponse;

export function isBootstrapPlayersRequest(v: unknown): v is BootstrapPlayersRequest {
  if (!isObject(v)) return false;
  if (v.type !== "bootstrapPlayers") return false;
  if (typeof v.season !== "string") return false;
  if (!Array.isArray(v.players)) return false;
  for (const p of v.players) {
    if (!isObject(p)) return false;
    if (typeof p.yahooId !== "string") return false;
    if (typeof p.name !== "string") return false;
    if (typeof p.team !== "string") return false;
  }
  return true;
}

// Settings-relay messages: content scripts in some Chrome MV3 builds do not
// see `chrome.storage` directly. The SW handles storage on their behalf.
export interface GetSettingsRequest {
  type: "getSettings";
}
export interface GetSettingsResponse {
  type: "getSettingsResponse";
  settings: FilterSettings;
}
export interface SaveSettingsRequest {
  type: "saveSettings";
  patch: Partial<FilterSettings>;
}
export interface SaveSettingsResponse {
  type: "saveSettingsResponse";
}

export function isGetSettingsRequest(v: unknown): v is GetSettingsRequest {
  return isObject(v) && v.type === "getSettings";
}

export function isSaveSettingsRequest(v: unknown): v is SaveSettingsRequest {
  if (!isObject(v)) return false;
  if (v.type !== "saveSettings") return false;
  if (v.patch === undefined) return true;
  return isObject(v.patch);
}
