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
        // Click the top tab first, then the season sub-tab. Yahoo's handlers
        // run in DOM order; the MutationObserver picks up the resulting
        // class / aria changes and triggers the remount.
        state.switchToTopTab?.click();
        state.switchToSubTab?.click();
      },
    });
    table.parentElement?.insertBefore(banner, table);
    mounted = { teardown: () => banner.remove() };
  }

  await mountForState(detectMyTeamTab(season));

  const stopWatch = watchMyTeamTab(season, (next) => {
    void mountForState(next);
  });

  return {
    teardown: () => {
      stopWatch();
      if (mounted) mounted.teardown();
    },
  };
}
