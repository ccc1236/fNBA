import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json" with { type: "json" };

export default defineConfig({
  plugins: [crx({ manifest })],
  build: { rollupOptions: { input: {} } },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    environmentMatchGlobs: [
      ["test/unit/yahooScrape.test.ts", "jsdom"],
      ["test/unit/pages.*.test.ts", "jsdom"],
      ["test/unit/filterBar.test.ts", "jsdom"],
    ],
  },
});
