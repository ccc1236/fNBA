import type { MeasureType, PerModeKey, PlayerStatRow, SeasonString } from "../shared/types.js";
import { log } from "../shared/logger.js";

export class RateLimitedError extends Error {
  constructor() {
    super("nba.com rate-limited (429)");
    this.name = "RateLimitedError";
  }
}

export class UpstreamUnavailableError extends Error {
  constructor(public status: number) {
    super(`nba.com upstream returned ${status}`);
    this.name = "UpstreamUnavailableError";
  }
}

export interface LeagueDashParams {
  season: SeasonString;
  measureType: MeasureType;
  perMode: PerModeKey;
  lastNGames: number;
}

const BASE_URL = "https://stats.nba.com/stats/leaguedashplayerstats";

/** Hardcoded params that don't vary per call. Mirrors swar/nba_api defaults. */
const STATIC_PARAMS: Record<string, string> = {
  College: "",
  Conference: "",
  Country: "",
  DateFrom: "",
  DateTo: "",
  Division: "",
  DraftPick: "",
  DraftYear: "",
  GameScope: "",
  GameSegment: "",
  Height: "",
  LeagueID: "00",
  Location: "",
  Month: "0",
  OpponentTeamID: "0",
  Outcome: "",
  PORound: "0",
  PaceAdjust: "N",
  Period: "0",
  PlayerExperience: "",
  PlayerPosition: "",
  PlusMinus: "N",
  Rank: "N",
  SeasonSegment: "",
  SeasonType: "Regular Season",
  ShotClockRange: "",
  StarterBench: "",
  TeamID: "0",
  TwoWay: "0",
  VsConference: "",
  VsDivision: "",
  Weight: "",
};

function buildUrl(p: LeagueDashParams): string {
  const q = new URLSearchParams({
    ...STATIC_PARAMS,
    Season: p.season,
    MeasureType: p.measureType,
    PerMode: p.perMode,
    LastNGames: String(p.lastNGames),
  });
  return `${BASE_URL}?${q.toString()}`;
}

interface RawResultSet {
  headers: string[];
  rowSet: (string | number | null)[][];
}
interface RawResponse {
  resultSets: RawResultSet[];
}

const HEADER_INDEX_FALLBACK = -1;

function parse(raw: RawResponse): PlayerStatRow[] {
  const rs = raw.resultSets?.[0];
  if (!rs) return [];
  const idx = (h: string): number => {
    const i = rs.headers.indexOf(h);
    return i === -1 ? HEADER_INDEX_FALLBACK : i;
  };
  const iId = idx("PLAYER_ID");
  const iName = idx("PLAYER_NAME");
  const iTeam = idx("TEAM_ABBREVIATION");

  return rs.rowSet.map((row) => {
    const stats: Record<string, number | null> = {};
    rs.headers.forEach((h, i) => {
      const v = row[i];
      if (typeof v === "number" || v === null) stats[h] = v as number | null;
    });
    return {
      nbaId: row[iId] as number,
      name: (row[iName] ?? "") as string,
      teamAbbr: (row[iTeam] ?? "") as string,
      position: null,
      stats,
    };
  });
}

export async function fetchLeagueDashPlayerStats(p: LeagueDashParams): Promise<PlayerStatRow[]> {
  const url = buildUrl(p);
  log.debug("fetch", url);
  const res = await fetch(url, { method: "GET" });
  if (res.status === 429) throw new RateLimitedError();
  if (!res.ok) throw new UpstreamUnavailableError(res.status);
  const json = (await res.json()) as RawResponse;
  return parse(json);
}
