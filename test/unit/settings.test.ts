import { beforeEach, describe, expect, it } from "vitest";
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from "../../src/shared/settings.js";

describe("filter settings", () => {
  beforeEach(async () => {
    await chrome.storage.sync.clear();
  });

  it("returns defaults when nothing is saved", async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips saved settings", async () => {
    await saveSettings({ window: "Last5", perMode: "Per36" });
    expect(await loadSettings()).toEqual({ window: "Last5", perMode: "Per36" });
  });

  it("merges partial saves with defaults", async () => {
    await saveSettings({ window: "Last10" });
    const s = await loadSettings();
    expect(s.window).toBe("Last10");
    expect(s.perMode).toBe(DEFAULT_SETTINGS.perMode);
  });
});
