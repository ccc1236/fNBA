export type WindowKey = "Season" | "Last5" | "Last10";
export type PerModeKey = "PerGame" | "Per36" | "Per100Possessions";
export type MeasureType = "Base" | "Advanced";

export type NbaPlayerId = number;
export type YahooPlayerId = string;
export type SeasonString = string; // e.g. "2025-26"

export interface PlayerStatRow {
  nbaId: NbaPlayerId;
  name: string;
  teamAbbr: string;
  position: string | null;
  // All stats as a flat record so adding columns doesn't require a type change.
  stats: Record<string, number | null>;
}

export interface PlayerMappingEntry {
  yahooId: YahooPlayerId;
  nbaId: NbaPlayerId;
  name: string;
  matchedBy: "exact" | "fuzzy" | "manual";
}
