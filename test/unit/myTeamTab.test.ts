import { beforeEach, describe, expect, it } from "vitest";
import { detectMyTeamTab } from "../../src/content/myTeamTab.js";

/**
 * Yahoo's actual DOM places three "2025-26 Season" anchors on the My Team
 * page (Stats subnav, Average Stats subnav, Standard Deviations subnav).
 * The detector must disambiguate by href so it points the switch button
 * at the AS subnav specifically. These fixtures mimic that layout.
 */
const NAV = `
  <ul>
    <li class="Navitem Selected">
      <a id="top-S" href="/nba/9144/1?stat1=S">Stats</a>
    </li>
    <li class="Navitem">
      <a id="top-AS" href="/nba/9144/1?stat1=AS">Average Stats</a>
    </li>
  </ul>
  <ul>
    <li class="Navitem Selected"><a id="sub-S-today" href="/nba/9144/1?stat1=S&stat2=D">Today</a></li>
    <li class="Navitem"><a id="sub-S-season" href="/nba/9144/1?stat1=S&stat2=S_2025">2025-26 Season</a></li>
  </ul>
  <ul>
    <li class="Navitem"><a id="sub-AS-l7" href="/nba/9144/1?stat1=AS&stat2=AL7">Last 7 Days</a></li>
    <li class="Navitem Default-selected"><a id="sub-AS-season" href="/nba/9144/1?stat1=AS&stat2=AS_2025">2025-26 Season</a></li>
  </ul>
`;

describe("detectMyTeamTab", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns wrong-tab on default Stats > Today, pointing the switch links at the Average Stats subnav", () => {
    document.body.innerHTML = NAV;
    const r = detectMyTeamTab("2025-26");
    expect(r.kind).toBe("wrong-tab");
    if (r.kind !== "wrong-tab") return;
    expect(r.switchToTopTab?.id).toBe("top-AS");
    expect(r.switchToSubTab?.id).toBe("sub-AS-season");
  });

  it("ignores the identically-labelled '2025-26 Season' anchor in the Stats subnav", () => {
    document.body.innerHTML = NAV;
    const r = detectMyTeamTab("2025-26");
    if (r.kind !== "wrong-tab") return;
    expect(r.switchToSubTab?.id).not.toBe("sub-S-season");
  });

  it("returns 'ready' once Average Stats and the season sub-tab are both marked Selected", () => {
    document.body.innerHTML = NAV;
    // Flip the active markers.
    document.querySelector("#top-S")!.closest("li")!.classList.remove("Selected");
    document.querySelector("#top-AS")!.closest("li")!.classList.add("Selected");
    document.querySelector("#sub-S-today")!.closest("li")!.classList.remove("Selected");
    const seasonLi = document.querySelector("#sub-AS-season")!.closest("li")!;
    seasonLi.classList.remove("Default-selected");
    seasonLi.classList.add("Selected");

    expect(detectMyTeamTab("2025-26")).toEqual({ kind: "ready" });
  });

  it("treats Default-selected as NOT active (it persists while the parent tab is hidden)", () => {
    // Default-selected on the AS season sub-tab while Stats is the visible top tab.
    document.body.innerHTML = NAV;
    const r = detectMyTeamTab("2025-26");
    expect(r.kind).toBe("wrong-tab");
  });

  it("returns 'ready' when active state is signalled via aria-current=page", () => {
    document.body.innerHTML = `
      <a id="top-AS" href="/nba/9144/1?stat1=AS" aria-current="page">Average Stats</a>
      <a id="sub-AS-season" href="/nba/9144/1?stat1=AS&stat2=AS_2025" aria-current="page">2025-26 Season</a>
    `;
    expect(detectMyTeamTab("2025-26")).toEqual({ kind: "ready" });
  });

  it("returns both anchors null when no Average Stats nav is present in the DOM", () => {
    document.body.innerHTML = `<div>some other Yahoo page</div>`;
    const r = detectMyTeamTab("2025-26");
    expect(r.kind).toBe("wrong-tab");
    if (r.kind !== "wrong-tab") return;
    expect(r.switchToTopTab).toBeNull();
    expect(r.switchToSubTab).toBeNull();
  });
});
