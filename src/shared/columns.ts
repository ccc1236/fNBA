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
  { key: "FTM", label: "FTM", source: "Base", decimals: 1, yahooHeader: "FTM" },
  { key: "FTA", label: "FTA", source: "Base", decimals: 1, yahooHeader: "FTA" },
  { key: "TOV", label: "TO", source: "Base", decimals: 1, yahooHeader: "TO" },
];

/** A compound override: Yahoo renders the made and attempted values for
 *  a stat in a single cell, separated (e.g., `9.9/17.4`). We override by
 *  formatting both inputs and joining with `separator`. Matched against
 *  Yahoo's table by `yahooHeader` (trailing `*` and PUA sort glyphs are
 *  stripped before comparison; see buildHeaderIndex). */
export interface CompoundColumnDef {
  makeKey: string;
  attemptKey: string;
  source: MeasureType;
  decimals: number;
  separator: string;
  yahooHeader: string;
}

export const COMPOUND_OVERRIDE_COLUMNS: CompoundColumnDef[] = [
  { makeKey: "FGM", attemptKey: "FGA", source: "Base", decimals: 1, separator: "/", yahooHeader: "FGM/A" },
];

/** A derived override: the displayed value is computed by dividing one
 *  nba.com stat by another (e.g., A/T = AST / TOV). Falls back to `-`
 *  when either input is missing or the denominator is zero. */
export interface DerivedColumnDef {
  numeratorKey: string;
  denominatorKey: string;
  source: MeasureType;
  decimals: number;
  yahooHeader: string;
}

export const DERIVED_OVERRIDE_COLUMNS: DerivedColumnDef[] = [
  { numeratorKey: "AST", denominatorKey: "TOV", source: "Base", decimals: 3, yahooHeader: "A/T" },
  // FG% and FT% derived from rounded made/attempted so the displayed ratio
  // matches FGM/A and FTM/FTA cells visually. nba.com's raw FG_PCT/FT_PCT
  // are computed from un-rounded season totals and drift slightly when the
  // displayed counting stats are rounded to 1 decimal at Per-36/Per-100
  // scaling. Visual consistency > 0.001-precision in the percentage.
  { numeratorKey: "FGM", denominatorKey: "FGA", source: "Base", decimals: 3, yahooHeader: "FG%" },
  { numeratorKey: "FTM", denominatorKey: "FTA", source: "Base", decimals: 3, yahooHeader: "FT%" },
];
