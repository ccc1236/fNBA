import { scrapePlayers, findStatsTable } from "../content/yahoo.js";
import { renderColumns, clearFnbaCells } from "../content/injectColumns.js";
import "../ui/filter-bar.js";
import type { FilterBar } from "../ui/filter-bar.js";
import { loadSettings } from "../shared/settings.js";
import type { PageInfo } from "../content/pageDetect.js";
import type {
  BootstrapPlayersRequest,
  BootstrapPlayersResponse,
  GetPlayerStatsRequest,
  GetPlayerStatsResponse,
  ErrorResponse,
} from "../shared/messages.js";
import type { FilterSettings } from "../shared/settings.js";
import { log } from "../shared/logger.js";

function currentSeasonString(now: Date = new Date()): string {
  const m = now.getUTCMonth();
  const y = now.getUTCFullYear();
  const start = m >= 6 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

async function send<T>(req: unknown): Promise<T> {
  return (await chrome.runtime.sendMessage(req)) as T;
}

async function paint(table: HTMLTableElement, bar: FilterBar, settings: FilterSettings): Promise<void> {
  bar.setStatus("Loading...");
  const players = scrapePlayers();
  if (players.length === 0) {
    bar.setStatus("No players found on this page", "error");
    return;
  }
  const season = currentSeasonString();

  const bootReq: BootstrapPlayersRequest = { type: "bootstrapPlayers", season, players };
  await send<BootstrapPlayersResponse | ErrorResponse>(bootReq);

  const yahooIds = players.map((p) => p.yahooId);
  const statsReq: GetPlayerStatsRequest = {
    type: "getPlayerStats",
    yahooIds,
    window: settings.window,
    perMode: settings.perMode,
  };
  const resp = await send<GetPlayerStatsResponse | ErrorResponse>(statsReq);
  if (resp.type === "error") {
    bar.setStatus(`${resp.code}`, "error");
    return;
  }
  renderColumns(table, resp.byYahooId);
  bar.setStatus(`Updated ${new Date().toLocaleTimeString()}`);
}

export async function run(_info: PageInfo): Promise<{ teardown: () => void }> {
  const table = findStatsTable();
  if (!table) {
    log.warn("no stats table found; content script idle");
    return { teardown: () => {} };
  }

  // Mount filter bar above the table.
  const bar = document.createElement("fnba-filter-bar") as FilterBar;
  table.parentElement?.insertBefore(bar, table);

  // Wait for the bar to async-init its settings.
  await new Promise((r) => setTimeout(r, 0));
  let settings = await loadSettings();

  await paint(table, bar, settings);

  const onChange = async (e: Event): Promise<void> => {
    const ce = e as CustomEvent<FilterSettings>;
    settings = ce.detail;
    await paint(table, bar, settings);
  };
  const onRefresh = async (): Promise<void> => {
    // Force-fresh: same flow with forceFresh hint passed down. The simplest
    // path is to do a getPlayerStats with forceFresh=true.
    bar.setStatus("Refreshing...");
    const yahooIds = scrapePlayers().map((p) => p.yahooId);
    const r = await send<GetPlayerStatsResponse | ErrorResponse>({
      type: "getPlayerStats",
      yahooIds,
      window: settings.window,
      perMode: settings.perMode,
      forceFresh: true,
    });
    if (r.type === "error") {
      bar.setStatus(`${r.code}`, "error");
      return;
    }
    renderColumns(table, r.byYahooId);
    bar.setStatus(`Updated ${new Date().toLocaleTimeString()}`);
  };

  bar.addEventListener("fnba-filter-change", onChange);
  bar.addEventListener("fnba-filter-refresh", onRefresh);

  return {
    teardown: () => {
      bar.removeEventListener("fnba-filter-change", onChange);
      bar.removeEventListener("fnba-filter-refresh", onRefresh);
      clearFnbaCells(table);
      bar.remove();
    },
  };
}
