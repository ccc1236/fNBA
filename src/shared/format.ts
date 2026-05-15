/**
 * Format a stat value for display. Numbers in [0, 1) for fractional columns
 * (FG_PCT, EFG_PCT, TS_PCT) render with no leading zero, NBA-broadcast style.
 * null/undefined render as a dash placeholder.
 */
export function formatStat(v: number | null | undefined, decimals: number): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  const fixed = v.toFixed(decimals);
  if (decimals >= 3 && v >= 0 && v < 1) return fixed.replace(/^0\./, ".");
  return fixed;
}
