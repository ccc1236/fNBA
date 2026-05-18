// My Team page module. Unlike the Players page (which is always a
// research view), My Team defaults to "Stats > Today" which shows live
// game-day numbers. We do not overlay there because those numbers are
// authoritative on game days. Instead we mount a small banner with a
// one-click switch to Average Stats > current-season, where the overlay
// is actually useful.
//
// Yahoo swaps the table in-page when the user changes tabs (the URL
// does not change), so we watch the DOM for tab-state flips and remount
// the appropriate view.

import { run as playersRun } from "./players.js";
import { findStatsTable } from "../content/yahoo.js";
import { detectMyTeamTab, watchMyTeamTab, type MyTeamTabState } from "../content/myTeamTab.js";
import { createWrongTabBanner } from "../ui/wrong-tab-banner.js";
import { currentSeason } from "../background/season.js";
import type { PageInfo } from "../content/pageDetect.js";
import { log } from "../shared/logger.js";

interface Mounted {
  teardown: () => void;
}

export async function run(info: PageInfo): Promise<{ teardown: () => void }> {
  const season = currentSeason();
  let mounted: Mounted | null = null;

  async function mountForState(state: MyTeamTabState): Promise<void> {
    // Tear down whatever is currently mounted (banner or full overlay).
    if (mounted) {
      mounted.teardown();
      mounted = null;
    }

    if (state.kind === "ready") {
      mounted = await playersRun(info);
      return;
    }

    const table = findStatsTable();
    if (!table) {
      log.debug("no stats table found on My Team; banner skipped");
      return;
    }

    const banner = createWrongTabBanner({
      message: `fNBA shows on Average Stats > ${season} Season. Click to switch.`,
      onSwitchClick: () => {
        // Navigate directly to the sub-tab anchor's href. Yahoo's
        // in-page tab JS does not reliably honor a click on an anchor
        // inside a hidden subnav, and clicking the top tab first plus
        // the sub-tab races their AJAX controller. Letting the browser
        // follow the href triggers a full page reload at the right URL
        // (?stat1=AS&stat2=AS_<startYear>), which Yahoo always renders
        // as Average Stats > current season.
        const href = state.switchToSubTab?.getAttribute("href");
        if (href) {
          window.location.href = href;
          return;
        }
        // Fallback when the sub-tab anchor isn't in the DOM yet.
        state.switchToTopTab?.click();
      },
    });
    table.parentElement?.insertBefore(banner, table);
    mounted = { teardown: () => banner.remove() };
  }

  await mountForState(detectMyTeamTab(season));

  const stopWatch = watchMyTeamTab(season, (next) => {
    void mountForState(next);
  });

  // Force every click on an Average Stats sub-tab anchor to do a full
  // page reload at the anchor's href. Yahoo's in-page AJAX swap for
  // sub-tab changes does not always update the markers we use for
  // detection, so polling missed transitions like AS > season ->
  // AS > Last 7 Days and back. A full reload guarantees our content
  // script runs against the new URL state.
  function onAvgStatsClick(e: Event): void {
    const t = e.target as Element | null;
    const a = t?.closest<HTMLAnchorElement>('a[href*="stat1=AS&stat2="]');
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    window.location.href = href;
  }
  document.addEventListener("click", onAvgStatsClick, true);

  return {
    teardown: () => {
      stopWatch();
      document.removeEventListener("click", onAvgStatsClick, true);
      if (mounted) mounted.teardown();
    },
  };
}
