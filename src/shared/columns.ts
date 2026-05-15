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
}

export const ADVANCED_COLUMNS: ColumnDef[] = [
  { key: "EFG_PCT", label: "eFG%", source: "Advanced", decimals: 3 },
  { key: "TS_PCT", label: "TS%", source: "Advanced", decimals: 3 },
  { key: "USG_PCT", label: "USG%", source: "Advanced", decimals: 1 },
];

/** Columns the override layer needs from MeasureType=Base. Used by content
 *  script to know which Yahoo cells it should replace. */
export const BASE_OVERRIDE_COLUMNS: ColumnDef[] = [
  { key: "PTS", label: "PTS", source: "Base", decimals: 1 },
  { key: "REB", label: "REB", source: "Base", decimals: 1 },
  { key: "AST", label: "AST", source: "Base", decimals: 1 },
  { key: "STL", label: "STL", source: "Base", decimals: 1 },
  { key: "BLK", label: "BLK", source: "Base", decimals: 1 },
  { key: "FG3M", label: "3PM", source: "Base", decimals: 1 },
  { key: "FG_PCT", label: "FG%", source: "Base", decimals: 3 },
  { key: "FT_PCT", label: "FT%", source: "Base", decimals: 3 },
  { key: "TOV", label: "TO", source: "Base", decimals: 1 },
];
