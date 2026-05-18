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
        // Click only the sub-tab anchor. Its href encodes both
        // stat1=AS and stat2=AS_<startYear>, so Yahoo updates the
        // top tab and the sub tab in one atomic AJAX load. Clicking
        // the top tab and sub tab separately races Yahoo's tab-state
        // controller and tends to leave the UI on Stats > Today.
        if (state.switchToSubTab) {
          state.switchToSubTab.click();
        } else if (state.switchToTopTab) {
          // Fallback for cases where the sub-tab is already active but
          // the top tab is not (theoretically unreachable in current
          // Yahoo UI, but harmless).
          state.switchToTopTab.click();
        }
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
