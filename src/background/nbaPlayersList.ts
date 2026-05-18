import type { NbaPlayer } from "./playerMapping.js";
import type { SeasonString } from "../shared/types.js";
import { UpstreamUnavailableError, RateLimitedError } from "./nbaClient.js";
import { log } from "../shared/logger.js";

const BASE_URL = "https://stats.nba.com/stats/commonallplayers";

function buildUrl(season: SeasonString): string {
  const q = new URLSearchParams({
    LeagueID: "00",
    Season: season,
    IsOnlyCurrentSeason: "1",
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

function parse(raw: RawResponse): NbaPlayer[] {
  const rs = raw.resultSets[0];
  if (!rs) return [];
  const iId = rs.headers.indexOf("PERSON_ID");
  const iName = rs.headers.indexOf("DISPLAY_FIRST_LAST");
  const iTeam = rs.headers.indexOf("TEAM_ABBREVIATION");
  // Guard against schema drift. Without this, missing headers produce
  // row[-1] === undefined and `undefined as number` poisons the mapping
  // with NaN IDs that silently never match.
  if (iId === -1 || iName === -1 || iTeam === -1) {
    throw new Error(
      `commonallplayers schema drift: missing one of PERSON_ID/DISPLAY_FIRST_LAST/TEAM_ABBREVIATION in ${JSON.stringify(rs.headers)}`,
    );
  }
  // Include all players regardless of ROSTERSTATUS. The previous filter
  // (ROSTERSTATUS === 1, "currently on an active roster") excluded injured,
  // two-way, and G-League-assigned players, leaving them silently unmappable
  // for the rest of the season. Rows with no TEAM_ABBREVIATION are still
  // dropped because the mapping algorithm in playerMapping.ts requires a
  // team match.
  const out: NbaPlayer[] = [];
  for (const row of rs.rowSet) {
    const team = (row[iTeam] ?? "") as string;
    if (!team) continue;
    out.push({
      nbaId: row[iId] as number,
      name: (row[iName] ?? "") as string,
      team,
    });
  }
  return out;
}

export async function fetchCommonAllPlayers(season: SeasonString): Promise<NbaPlayer[]> {
  const url = buildUrl(season);
  log.debug("fetch commonallplayers", url);
  const res = await fetch(url, { method: "GET" });
  if (res.status === 429) throw new RateLimitedError();
  if (!res.ok) throw new UpstreamUnavailableError(res.status);
  const json = (await res.json()) as RawResponse;
  return parse(json);
}
