# fNBA

Yahoo Fantasy NBA advanced-stats overlay (Chromium MV3 extension).

Adds eFG%, TS%, USG% columns, Last 5/10 GP windows, and per-36/per-100 modes
to Yahoo Fantasy Basketball pages. Data sourced from nba.com/stats.

**Status:** Plan 1 (Foundation) complete — service worker only. UI ships in Plan 2.

## Development

```bash
npm install
npm test              # run unit tests
npm run typecheck
npm run build         # writes dist/
```

## Loading the unpacked extension

1. `npm run build`
2. Chrome → `chrome://extensions` → enable Developer mode
3. "Load unpacked" → select the `dist/` folder

## License

MIT.
