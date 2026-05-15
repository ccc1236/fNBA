import type { PerModeKey } from "./types.js";

export interface PerModeDef {
  key: PerModeKey;
  label: string;
  /** value to send to nba.com `PerMode` param */
  apiValue: string;
}

export const PER_MODES: PerModeDef[] = [
  { key: "PerGame", label: "Per Game", apiValue: "PerGame" },
  { key: "Per36", label: "Per 36", apiValue: "Per36" },
  { key: "Per100Possessions", label: "Per 100", apiValue: "Per100Possessions" },
];

export function perModeByKey(key: PerModeKey): PerModeDef {
  const m = PER_MODES.find((m) => m.key === key);
  if (!m) throw new Error(`unknown per-mode ${key}`);
  return m;
}
