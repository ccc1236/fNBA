import "fake-indexeddb/auto";

// Minimal chrome.* stubs for unit tests. Add to as needed per test.
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: (() => {
      const store: Record<string, unknown> = {};
      return {
        get: async (keys?: string | string[]) => {
          if (!keys) return { ...store };
          const arr = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(arr.map((k) => [k, store[k]]));
        },
        set: async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        },
        remove: async (key: string) => {
          delete store[key];
        },
        clear: async () => {
          for (const k of Object.keys(store)) delete store[k];
        },
      };
    })(),
  },
} as unknown;
