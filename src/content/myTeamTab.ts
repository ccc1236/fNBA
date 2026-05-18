/**
 * Yahoo's My Team page uses a same-URL tab nav: clicking "Stats" vs
 * "Average Stats" swaps the table contents via JS without changing the
 * URL. The "Stats" tab defaults to Today, which renders LIVE game-day
 * numbers; users rely on those raw values on game days. We only want to
 * overlay nba.com data on the Average Stats > current-season view.
 *
 * Detection is href-based per CLAUDE.md's "Yahoo renames CSS classes
 * periodically" gotcha. The top tab Average Stats is the anchor whose
 * href contains `stat1=AS` and no `stat2=`. The current-season sub-tab
 * inside the Average Stats subnav is the anchor whose href contains
 * `stat2=AS_<startYear>`, where startYear is the start year of the
 * current NBA season (e.g. 2025 for "2025-26"). The Stats and Standard
 * Deviations subnavs also contain a "2025-26 Season" link, so text-only
 * matching would collide.
 */

export type MyTeamTabState =
  | { kind: "ready" }
  | {
      kind: "wrong-tab";
      /** The Average Stats top-tab element to click, or null if it could not be found / is already active. */
      switchToTopTab: HTMLElement | null;
      /** The current-season sub-tab element to click, or null if it could not be found / is already active. */
      switchToSubTab: HTMLElement | null;
    };

// Exact class tokens that mean "the user has actively selected this tab".
// We intentionally do not include Yahoo's "Default-selected" class because
// it is a fallback marker on the season sub-tab while a different tab is
// actually visible; mistaking it for active state would give a false
// "ready" verdict when the user is on Stats > Today.
const ACTIVE_CLASSES = [
  "Selected",
  "is-active",
  "active",
  "Tab-active",
  "is-selected",
];

function hasActiveClass(el: HTMLElement): boolean {
  for (const c of ACTIVE_CLASSES) {
    if (el.classList.contains(c)) return true;
  }
  return false;
}

function isActive(el: HTMLElement): boolean {
  // Check the element and a small slice of its ancestors. Yahoo sometimes
  // tags the link itself, sometimes the wrapping <li>.
  let cur: HTMLElement | null = el;
  let depth = 0;
  while (cur && depth < 4) {
    if (cur.getAttribute("aria-current") === "page") return true;
    if (cur.getAttribute("aria-selected") === "true") return true;
    if (hasActiveClass(cur)) return true;
    cur = cur.parentElement;
    depth++;
  }
  return false;
}

function findAverageStatsTopTab(): HTMLAnchorElement | null {
  // Top-tab anchors carry stat1 but no stat2; sub-tab anchors carry both.
  for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="stat1=AS"]'))) {
    const href = a.getAttribute("href") ?? "";
    if (!href.includes("stat2=")) return a;
  }
  return null;
}

function findAverageStatsSeasonSubTab(seasonString: string): HTMLAnchorElement | null {
  // seasonString is "YYYY-YY". The start year is the part before the dash.
  const startYear = seasonString.split("-")[0];
  if (!startYear) return null;
  return document.querySelector<HTMLAnchorElement>(`a[href*="stat2=AS_${startYear}"]`);
}

export function detectMyTeamTab(seasonString: string): MyTeamTabState {
  const topEl = findAverageStatsTopTab();
  const subEl = findAverageStatsSeasonSubTab(seasonString);

  const topActive = topEl ? isActive(topEl) : false;
  const subActive = subEl ? isActive(subEl) : false;

  if (topActive && subActive) return { kind: "ready" };

  return {
    kind: "wrong-tab",
    switchToTopTab: topActive ? null : topEl,
    switchToSubTab: subActive ? null : subEl,
  };
}

/**
 * Watch the DOM for tab-state changes (active class / aria attribute flips)
 * and notify the caller. Yahoo's tab switching is in-page (no URL change),
 * so we rely on a debounced MutationObserver. Returns a stop function.
 */
export function watchMyTeamTab(
  seasonString: string,
  onChange: (state: MyTeamTabState) => void,
): () => void {
  let lastKind: MyTeamTabState["kind"] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const check = (): void => {
    const next = detectMyTeamTab(seasonString);
    if (next.kind === lastKind) return;
    lastKind = next.kind;
    onChange(next);
  };

  lastKind = detectMyTeamTab(seasonString).kind;

  // Trailing-edge debounce: Yahoo's tab clicks flip the class markers
  // immediately but the corresponding AJAX content swap completes a few
  // hundred ms later, which can wipe anything we mounted in the
  // intervening window. Waiting until mutations have settled lets us
  // bind to the new table the first time.
  const SETTLE_MS = 400;
  const observer = new MutationObserver(() => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      check();
    }, SETTLE_MS);
  });
  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-current", "aria-selected", "class"],
  });

  return (): void => {
    if (timer !== null) clearTimeout(timer);
    observer.disconnect();
  };
}
