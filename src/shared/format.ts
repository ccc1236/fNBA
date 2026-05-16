/**
 * Format a stat value for display. Numbers in [0, 1) for fractional columns
 * (FG_PCT, EFG_PCT, TS_PCT) render with no leading zero, NBA-broadcast style.
 * null/undefined render as a dash placeholder. `multiplier` (default 1) lets
 * columns conventionally shown as percent values (USG, NetRtg) scale the raw
 * fraction up to "36.8" before formatting.
 */
export function formatStat(
  v: number | null | undefined,
  decimals: number,
  multiplier = 1,
): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  const scaled = v * multiplier;
  const fixed = scaled.toFixed(decimals);
  if (decimals >= 3 && scaled >= 0 && scaled < 1) return fixed.replace(/^0\./, ".");
  return fixed;
}
