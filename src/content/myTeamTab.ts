/**
 * Yahoo's My Team page uses a same-URL tab nav: clicking "Stats" vs
 * "Average Stats" swaps the table contents via JS without changing the
 * URL. The "Stats" tab defaults to Today, which renders LIVE game-day
 * numbers; users rely on those raw values on game days. We only want to
 * overlay nba.com data on the Average Stats > current-season view.
 *
 * Detection works by text-matching the tab labels we know and walking up
 * the tree looking for one of several common "active" markers (Yahoo
 * renames CSS classes periodically, so we try multiple signals).
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

const TOP_TAB = "Average Stats";

function findTabByText(text: string): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>("a, button");
  for (const el of Array.from(candidates)) {
    if ((el.textContent ?? "").trim() === text) return el;
  }
  return null;
}

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

export function detectMyTeamTab(seasonString: string): MyTeamTabState {
  const subTabLabel = `${seasonString} Season`;

  const topEl = findTabByText(TOP_TAB);
  const subEl = findTabByText(subTabLabel);

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
  let scheduled = false;

  const check = (): void => {
    const next = detectMyTeamTab(seasonString);
    if (next.kind === lastKind) return;
    lastKind = next.kind;
    onChange(next);
  };

  // Seed the lastKind so the first real change fires.
  lastKind = detectMyTeamTab(seasonString).kind;

  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      check();
    });
  });
  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-current", "aria-selected", "class"],
  });

  return (): void => observer.disconnect();
}
