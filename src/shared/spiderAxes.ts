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
 * Format a raw stat for display next to an axis label. Conventions match
 * `formatStat` in `src/shared/format.ts` so the tooltip stays consistent
 * with the injected stat columns.
 * - TS_PCT: raw is a [0, 1) fraction; render as `.XXX` (no leading zero).
 * - USG_PCT: raw is a [0, 1) fraction; multiply by 100 then render with 1
 *   decimal (e.g. 0.284 -> "28.4"). Matches the USG% injected column.
 * - Counting stats render with 1 decimal.
 * - Null renders as a dash.
 */
export function formatAxisValue(key: SpiderStatKey, v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (key === "TS_PCT") {
    const s = v.toFixed(3);
    return s.startsWith("0") ? s.slice(1) : s;
  }
  if (key === "USG_PCT") {
    return (v * 100).toFixed(1);
  }
  return v.toFixed(1);
}
