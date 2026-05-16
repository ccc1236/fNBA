import { scrapePlayers, findStatsTable } from "../content/yahoo.js";
import { renderColumns, clearFnbaCells } from "../content/injectColumns.js";
import { createFilterBar, type FilterBarHandle } from "../ui/filter-bar.js";
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

/**
 * Yahoo wraps its stats table in a max-width-constrained content container,
 * which leaves wide unused margins on both sides of the page. After we append
 * three new columns the table no longer fits inside that constraint. Rather
 * than introducing a horizontal scrollbar, walk up the ancestor chain and
 * clear `max-width` on each level so the table can claim the available
 * horizontal space. Restored on teardown.
 */
/**
 * Yahoo Fantasy puts the stats table inside a narrow main-content column
 * (typically ~1300px) while reserving room for a right rail. With our three
 * extra columns the table doesn't fit. The whole rail column is the same
 * pixel width all the way down to the table's parent; the narrowing happens
 * at one single ancestor (Yahoo's `.Page` div). We find that narrowing
 * point and widen it to 100% of its own parent so the rest of the chain
 * cascades. Restored on teardown.
 */
function ensureTableFits(table: HTMLTableElement): () => void {
  const restorers: Array<() => void> = [];

  // Walk up the ancestor chain and widen every level that has a fixed
  // pixel width. Yahoo's main content column is constrained at a single
  // level (Page-wrap -> Page), but multiple intermediate divs inherit
  // explicit widths from layout JS; widening only one level can be
  // overridden by descendants' own fixed widths. Use !important to win
  // against Yahoo's stylesheet.
  let cur: HTMLElement | null = table.parentElement;
  let depth = 0;
  const MAX_DEPTH = 14;
  while (cur && cur !== document.body && cur !== document.documentElement && depth < MAX_DEPTH) {
    const cs = getComputedStyle(cur);
    const w = cs.width;
    if (w && w.endsWith("px") && w !== "0px") {
      const el = cur;
      const prev = el.style.getPropertyValue("width");
      const prevPrio = el.style.getPropertyPriority("width");
      const prevMax = el.style.getPropertyValue("max-width");
      const prevMaxPrio = el.style.getPropertyPriority("max-width");
      el.style.setProperty("width", "100%", "important");
      el.style.setProperty("max-width", "none", "important");
      restorers.push(() => {
        el.style.setProperty("width", prev, prevPrio);
        el.style.setProperty("max-width", prevMax, prevMaxPrio);
      });
    }
    cur = cur.parentElement;
    depth++;
  }

  // Force a synchronous reflow so the new widths are committed before any
  // subsequent layout-dependent work. Reading offsetWidth is the standard
  // trick.
  void document.body.offsetWidth;

  return () => restorers.forEach((r) => r());
}

function applyYahooFilterFade(table: HTMLTableElement): () => void {
  // Yahoo's native stat-range selector typically sits in a form labeled
  // "Stats Range" or contains a select with options like "Season" / "Last 14".
  // We look in the table's ancestor chain for a candidate.
  const ancestor = table.closest("section, div, form") ?? document.body;
  const candidates = Array.from(
    ancestor.querySelectorAll<HTMLElement>("select"),
  ).filter((s) => {
    const sel = s as HTMLSelectElement;
    const opts = Array.from(sel.options).map((o) => o.textContent?.trim() ?? "");
    return opts.some((o) => /season|last\s*\d/i.test(o));
  });

  const restorers: Array<() => void> = [];
  for (const sel of candidates) {
    const note = document.createElement("span");
    note.dataset["fnba"] = "yahoo-filter-note";
    note.textContent = " (fNBA active)";
    note.style.cssText = "font-size:11px;color:#5f01d1;margin-left:6px;";
    sel.parentElement?.appendChild(note);
    const prev = sel.style.cssText;
    sel.style.opacity = "0.5";
    sel.style.pointerEvents = "none";
    restorers.push(() => {
      sel.style.cssText = prev;
      note.remove();
    });
  }
  return () => restorers.forEach((r) => r());
}

async function paint(table: HTMLTableElement, bar: FilterBarHandle, settings: FilterSettings): Promise<void> {
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

  // Build and mount the filter bar above the table.
  const bar = await createFilterBar();
  table.parentElement?.insertBefore(bar, table);

  let settings = bar.getSettings();

  const restoreScroll = ensureTableFits(table);
  // Yahoo's layout JS recomputes column widths on resize, not on mutation.
  // Our ancestor-widen takes immediate effect in the DOM but the columns
  // stay at their cached widths until something nudges the layout. A
  // synthetic resize event is the standard nudge.
  window.dispatchEvent(new Event("resize"));
  const restoreYahoo = applyYahooFilterFade(table);

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
      restoreYahoo();
      restoreScroll();
      bar.removeEventListener("fnba-filter-change", onChange);
      bar.removeEventListener("fnba-filter-refresh", onRefresh);
      clearFnbaCells(table);
      bar.remove();
    },
  };
}
