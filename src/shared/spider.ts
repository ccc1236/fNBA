import type { PerModeKey, YahooPlayerId } from "./types.js";

export type SpiderStatKey =
  | "PTS"
  | "REB"
  | "AST"
  | "STL"
  | "BLK"
  | "FG3M"
  | "TOV"
  | "TS_PCT"
  | "USG_PCT";

/** League percentile (0..100) per stat key. */
export type PercentileRecord = Partial<Record<SpiderStatKey, number>>;

export interface WindowSlice {
  values: Partial<Record<SpiderStatKey, number>>;
  percentiles: PercentileRecord;
}

export interface SpiderData {
  name: string;
  team: string;
  position: string;
  perMode: PerModeKey;
  windows: {
    season: WindowSlice | null;
    L10: WindowSlice | null;
    L5: WindowSlice | null;
  };
}

export interface GetSpiderDataRequest {
  type: "getSpiderData";
  yahooId: YahooPlayerId;
  perMode: PerModeKey;
}

export type GetSpiderDataResponse =
  | { type: "getSpiderDataResponse"; ok: true; data: SpiderData }
  | { type: "getSpiderDataResponse"; ok: false; reason: "no-mapping" | "fetch-failed" };
