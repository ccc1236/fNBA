import type { SpiderStatKey } from "./spider.js";

export interface SpiderAxisConfig {
  key: SpiderStatKey;
  label: string;
  /** If true, higher raw value = worse (e.g. TOV). Percentile is pre-inverted SW-side. */
  inverted: boolean;
}

/** Clockwise from 12 o'clock. Order is intentional; do not re-sort. */
export const SPIDER_AXES: readonly SpiderAxisConfig[] = [
  { key: "FG3M",    label: "3PM",  inverted: false },
  { key: "PTS",     label: "PTS",  inverted: false },
  { key: "REB",     label: "REB",  inverted: false },
  { key: "AST",     label: "AST",  inverted: false },
  { key: "STL",     label: "STL",  inverted: false },
  { key: "BLK",     label: "BLK",  inverted: false },
  { key: "TOV",     label: "TO↓",  inverted: true  },
  { key: "TS_PCT",  label: "TS%",  inverted: false },
  { key: "USG_PCT", label: "USG%", inverted: false },
];

/**
 * Format a raw stat for display next to an axis label.
 * - TS_PCT renders as `.XXX` (no leading zero).
 * - USG_PCT comes from nba.com already as a percentage number (e.g. 28.4), so render as-is with 1 decimal.
 * - Counting stats render with 1 decimal.
 * - Null renders as "—".
 */
export function formatAxisValue(key: SpiderStatKey, v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (key === "TS_PCT") {
    const s = v.toFixed(3);
    return s.startsWith("0") ? s.slice(1) : s;
  }
  return v.toFixed(1);
}
