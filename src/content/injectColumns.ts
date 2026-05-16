import { ADVANCED_COLUMNS, BASE_OVERRIDE_COLUMNS } from "../shared/columns.js";
import { formatStat } from "../shared/format.js";
import type { PlayerStatRow, YahooPlayerId } from "../shared/types.js";

function getYahooIdFromRow(row: HTMLTableRowElement): YahooPlayerId | null {
  const a = row.querySelector<HTMLAnchorElement>("a[data-ys-playerid]");
  return a?.getAttribute("data-ys-playerid") ?? null;
}

/**
 * Build label-to-column-index map from the LAST `<thead>` row. Yahoo wraps
 * headers as `<th><div><a>PTS</a></div></th>`; we use textContent and strip
 * a trailing `*` (projected-stat decoration like `GP*`, `FTA*`).
 */
function buildHeaderIndex(table: HTMLTableElement): Map<string, number> {
  const rows = table.querySelectorAll("thead tr");
  const labelRow = rows.length > 0 ? rows[rows.length - 1]! : null;
  const map = new Map<string, number>();
  if (!labelRow) return map;
  Array.from(labelRow.children).forEach((cell, i) => {
    const text = (cell.textContent ?? "").trim().replace(/\*+$/, "").trim();
    if (text) map.set(text, i);
  });
  return map;
}

/**
 * Idempotent: removes prior fNBA columns and override marks before rendering.
 */
export function renderColumns(
  table: HTMLTableElement,
  data: Record<YahooPlayerId, PlayerStatRow | null>,
): void {
  clearFnbaCells(table);

  const headerIndex = buildHeaderIndex(table);

  // Append adv column headers to the last thead row (the one with actual labels).
  const rowsThead = table.querySelectorAll("thead tr");
  const headerRow = rowsThead.length > 0 ? rowsThead[rowsThead.length - 1]! : null;
  if (headerRow) {
    for (const col of ADVANCED_COLUMNS) {
      const th = document.createElement("th");
      th.dataset.fnba = col.key;
      th.textContent = col.label;
      headerRow.appendChild(th);
    }
  }

  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"));
  for (const row of rows) {
    const yahooId = getYahooIdFromRow(row);
    const stats = yahooId ? data[yahooId]?.stats ?? null : null;

    // Append adv cells (mirrors header position; null stats render as "-").
    for (const col of ADVANCED_COLUMNS) {
      const td = document.createElement("td");
      td.dataset.fnba = col.key;
      td.textContent = formatStat(stats?.[col.key] ?? null, col.decimals, col.multiplier);
      row.appendChild(td);
    }

    // Override Yahoo's Base stat cells in place via the header-index map.
    if (stats) {
      for (const col of BASE_OVERRIDE_COLUMNS) {
        const yahooLabel = col.yahooHeader;
        if (!yahooLabel) continue;
        const idx = headerIndex.get(yahooLabel);
        if (idx === undefined) continue;
        const cell = row.children[idx] as HTMLElement | undefined;
        if (!cell) continue;
        // Yahoo wraps cell content in a `<div>`; target it so we don't clobber the wrapper.
        const inner = cell.querySelector("div");
        const target = inner ?? cell;
        target.textContent = formatStat(stats[col.key] ?? null, col.decimals, col.multiplier);
        cell.dataset.fnbaOverride = "1";
      }
    }
  }
}

export function clearFnbaCells(table: HTMLTableElement): void {
  for (const el of Array.from(table.querySelectorAll("[data-fnba]"))) {
    el.remove();
  }
  for (const el of Array.from(table.querySelectorAll<HTMLElement>("[data-fnba-override]"))) {
    delete el.dataset.fnbaOverride;
  }
}
