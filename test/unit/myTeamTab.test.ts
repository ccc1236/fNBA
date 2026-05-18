import { beforeEach, describe, expect, it } from "vitest";
import { detectMyTeamTab } from "../../src/content/myTeamTab.js";

describe("detectMyTeamTab", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  function setup(html: string): void {
    document.body.innerHTML = html;
  }

  it("returns 'ready' when Average Stats and the current-season sub-tab are both aria-current=page", () => {
    setup(`
      <ul>
        <li><a aria-current="page">Average Stats</a></li>
        <li><a>Stats</a></li>
      </ul>
      <ul>
        <li><a>Today</a></li>
        <li><a aria-current="page">2025-26 Season</a></li>
      </ul>
    `);
    expect(detectMyTeamTab("2025-26")).toEqual({ kind: "ready" });
  });

  it("returns 'wrong-tab' when Stats > Today is active, with anchors to click", () => {
    setup(`
      <ul>
        <li><a aria-current="page">Stats</a></li>
        <li><a id="t-avg">Average Stats</a></li>
      </ul>
      <ul>
        <li><a aria-current="page">Today</a></li>
        <li><a id="s-season">2025-26 Season</a></li>
      </ul>
    `);
    const r = detectMyTeamTab("2025-26");
    expect(r.kind).toBe("wrong-tab");
    if (r.kind !== "wrong-tab") return;
    expect(r.switchToTopTab?.id).toBe("t-avg");
    expect(r.switchToSubTab?.id).toBe("s-season");
  });

  it("recognizes the 'Selected' Yahoo class on an ancestor as the active marker", () => {
    setup(`
      <ul>
        <li class="Selected"><a>Average Stats</a></li>
        <li><a>Stats</a></li>
      </ul>
      <ul>
        <li class="Selected"><a>2025-26 Season</a></li>
      </ul>
    `);
    expect(detectMyTeamTab("2025-26")).toEqual({ kind: "ready" });
  });

  it("does not need to switch the top tab if Average Stats is already active but season sub-tab is not", () => {
    setup(`
      <ul>
        <li aria-current="page"><a>Average Stats</a></li>
      </ul>
      <ul>
        <li aria-current="page"><a>Last 7 Days</a></li>
        <li><a id="s-season">2025-26 Season</a></li>
      </ul>
    `);
    const r = detectMyTeamTab("2025-26");
    expect(r.kind).toBe("wrong-tab");
    if (r.kind !== "wrong-tab") return;
    expect(r.switchToTopTab).toBeNull();
    expect(r.switchToSubTab?.id).toBe("s-season");
  });

  it("returns wrong-tab with both anchors null when neither tab is found in the DOM", () => {
    setup(`<div>no tabs here</div>`);
    const r = detectMyTeamTab("2025-26");
    expect(r.kind).toBe("wrong-tab");
    if (r.kind !== "wrong-tab") return;
    expect(r.switchToTopTab).toBeNull();
    expect(r.switchToSubTab).toBeNull();
  });
});
