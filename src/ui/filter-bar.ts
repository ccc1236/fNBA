import { WINDOWS } from "../shared/windows.js";
import { PER_MODES } from "../shared/perModes.js";
import { loadSettings, saveSettings, type FilterSettings } from "../shared/settings.js";
import type { PerModeKey, WindowKey } from "../shared/types.js";

const STYLES = `
  :host {
    display: block;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #1a1a2e;
    box-sizing: border-box;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: #f5f5f7;
    border: 1px solid #d8d8de;
    border-radius: 6px;
    font-size: 12px;
  }
  .brand {
    font-weight: 700;
    color: #5f01d1;
    letter-spacing: 0.02em;
  }
  select, button {
    font: inherit;
    color: inherit;
    background: #fff;
    border: 1px solid #c4c4cc;
    border-radius: 4px;
    padding: 3px 8px;
    cursor: pointer;
  }
  button[data-role="refresh"] {
    padding: 3px 10px;
  }
  .status {
    margin-left: auto;
    font-size: 11px;
    opacity: 0.7;
  }
  .status[data-state="error"] {
    color: #b00020;
    opacity: 1;
  }
`;

export class FilterBar extends HTMLElement {
  private settings: FilterSettings = { window: "Season", perMode: "PerGame" };

  connectedCallback(): void {
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${STYLES}</style>
      <div class="bar">
        <span class="brand">fNBA</span>
        <select data-role="window">
          ${WINDOWS.map((w) => `<option value="${w.key}">${w.label}</option>`).join("")}
        </select>
        <select data-role="perMode">
          ${PER_MODES.map((m) => `<option value="${m.key}">${m.label}</option>`).join("")}
        </select>
        <button data-role="refresh" title="Refetch from nba.com">⟳ Refresh</button>
        <span class="status" data-role="status"></span>
      </div>
    `;
    void this.init();
    this.wireEvents();
  }

  private async init(): Promise<void> {
    this.settings = await loadSettings();
    const root = this.shadowRoot!;
    (root.querySelector('select[data-role="window"]') as HTMLSelectElement).value = this.settings.window;
    (root.querySelector('select[data-role="perMode"]') as HTMLSelectElement).value = this.settings.perMode;
  }

  private wireEvents(): void {
    const root = this.shadowRoot!;
    const winSel = root.querySelector('select[data-role="window"]') as HTMLSelectElement;
    const modeSel = root.querySelector('select[data-role="perMode"]') as HTMLSelectElement;
    const refresh = root.querySelector('button[data-role="refresh"]') as HTMLButtonElement;
    winSel.addEventListener("change", () => {
      this.settings = { ...this.settings, window: winSel.value as WindowKey };
      void saveSettings({ window: this.settings.window });
      this.dispatchEvent(new CustomEvent("fnba-filter-change", { detail: { ...this.settings } }));
    });
    modeSel.addEventListener("change", () => {
      this.settings = { ...this.settings, perMode: modeSel.value as PerModeKey };
      void saveSettings({ perMode: this.settings.perMode });
      this.dispatchEvent(new CustomEvent("fnba-filter-change", { detail: { ...this.settings } }));
    });
    refresh.addEventListener("click", () => {
      this.dispatchEvent(new Event("fnba-filter-refresh"));
    });
  }

  getSettings(): FilterSettings {
    return { ...this.settings };
  }

  setStatus(text: string, state: "ok" | "error" = "ok"): void {
    const el = this.shadowRoot!.querySelector('[data-role="status"]') as HTMLElement;
    el.textContent = text;
    el.dataset.state = state;
  }
}

if (!customElements.get("fnba-filter-bar")) {
  customElements.define("fnba-filter-bar", FilterBar);
}
