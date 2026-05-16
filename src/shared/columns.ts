import type { MeasureType } from "./types.js";

export interface ColumnDef {
  /** key as returned by leaguedashplayerstats (uppercase) */
  key: string;
  /** UI label */
  label: string;
  /** which MeasureType call this column comes from */
  source: MeasureType;
  /** number of decimal places for display */
  decimals: number;
  /** Optional multiplier applied before display. nba.com returns most
   *  percentage stats as fractions (e.g. USG_PCT = 0.368). For columns
   *  conventionally shown as "36.8" rather than ".368", set multiplier: 100. */
  multiplier?: number;
  /** Yahoo's displayed column header (used by the override layer to locate
   *  the cell in Yahoo's table). Only meaningful for source: "Base" rows. */
  yahooHeader?: string;
}

export const ADVANCED_COLUMNS: ColumnDef[] = [
  { key: "EFG_PCT", label: "eFG%", source: "Advanced", decimals: 3 },
  { key: "TS_PCT", label: "TS%", source: "Advanced", decimals: 3 },
  { key: "USG_PCT", label: "USG%", source: "Advanced", decimals: 1, multiplier: 100 },
];

export const BASE_OVERRIDE_COLUMNS: ColumnDef[] = [
  { key: "PTS", label: "PTS", source: "Base", decimals: 1, yahooHeader: "PTS" },
  { key: "REB", label: "REB", source: "Base", decimals: 1, yahooHeader: "REB" },
  { key: "AST", label: "AST", source: "Base", decimals: 1, yahooHeader: "AST" },
  { key: "STL", label: "STL", source: "Base", decimals: 1, yahooHeader: "ST" },
  { key: "BLK", label: "BLK", source: "Base", decimals: 1, yahooHeader: "BLK" },
  { key: "FG3M", label: "3PM", source: "Base", decimals: 1, yahooHeader: "3PTM" },
  { key: "FG_PCT", label: "FG%", source: "Base", decimals: 3, yahooHeader: "FG%" },
  { key: "FT_PCT", label: "FT%", source: "Base", decimals: 3, yahooHeader: "FT%" },
  { key: "TOV", label: "TO", source: "Base", decimals: 1, yahooHeader: "TO" },
];
