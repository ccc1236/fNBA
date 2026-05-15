import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../src/ui/filter-bar.js";

describe("<fnba-filter-bar>", () => {
  let bar: HTMLElement;
  beforeEach(async () => {
    await chrome.storage.sync.clear();
    document.body.innerHTML = "";
    bar = document.createElement("fnba-filter-bar");
    document.body.appendChild(bar);
    await new Promise((r) => setTimeout(r, 0)); // wait for connectedCallback's async init
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders both dropdowns and a refresh button", () => {
    const sr = (bar as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot;
    expect(sr.querySelector('select[data-role="window"]')).not.toBeNull();
    expect(sr.querySelector('select[data-role="perMode"]')).not.toBeNull();
    expect(sr.querySelector('button[data-role="refresh"]')).not.toBeNull();
  });

  it("emits fnba-filter-change with the new selection on window change", async () => {
    const sr = (bar as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot;
    const sel = sr.querySelector<HTMLSelectElement>('select[data-role="window"]')!;
    const events: CustomEvent[] = [];
    bar.addEventListener("fnba-filter-change", (e) => events.push(e as CustomEvent));

    sel.value = "Last5";
    sel.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 0));

    expect(events).toHaveLength(1);
    expect(events[0]!.detail).toEqual({ window: "Last5", perMode: "PerGame" });
  });

  it("emits fnba-filter-refresh on refresh-button click", () => {
    const sr = (bar as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot;
    const btn = sr.querySelector<HTMLButtonElement>('button[data-role="refresh"]')!;
    const events: Event[] = [];
    bar.addEventListener("fnba-filter-refresh", (e) => events.push(e));
    btn.click();
    expect(events).toHaveLength(1);
  });

  it("setStatus() updates the status pill", () => {
    (bar as HTMLElement & { setStatus: (s: string) => void }).setStatus("Updated just now");
    const sr = (bar as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot;
    expect(sr.querySelector('[data-role="status"]')!.textContent).toBe("Updated just now");
  });
});
