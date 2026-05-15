import type { WindowKey } from "./types.js";

export interface WindowDef {
  key: WindowKey;
  label: string;
  /** nba.com `LastNGames` param. 0 = season-long. */
  lastNGames: number;
}

export const WINDOWS: WindowDef[] = [
  { key: "Season", label: "Season", lastNGames: 0 },
  { key: "Last5", label: "L5", lastNGames: 5 },
  { key: "Last10", label: "L10", lastNGames: 10 },
];

export function windowByKey(key: WindowKey): WindowDef {
  const w = WINDOWS.find((w) => w.key === key);
  if (!w) throw new Error(`unknown window ${key}`);
  return w;
}
