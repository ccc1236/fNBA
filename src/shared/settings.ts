import type { PerModeKey, WindowKey } from "./types.js";

export interface FilterSettings {
  window: WindowKey;
  perMode: PerModeKey;
}

export const DEFAULT_SETTINGS: FilterSettings = {
  window: "Season",
  perMode: "PerGame",
};

const KEY = "fnba.filterSettings";

export async function loadSettings(): Promise<FilterSettings> {
  const r = await chrome.storage.sync.get(KEY);
  const saved = r[KEY];
  if (!saved || typeof saved !== "object") return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...(saved as Partial<FilterSettings>) };
}

export async function saveSettings(patch: Partial<FilterSettings>): Promise<void> {
  const current = await loadSettings();
  await chrome.storage.sync.set({ [KEY]: { ...current, ...patch } });
}
