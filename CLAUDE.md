# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Ikigai context

Life-goal framing for this project lives at `D:\Ikigai\00-PARA\1-Projects\the-daily-node.md`. Read it for the "why" — goal, success criteria, current state.

## Commands

```bash
node build.js              # build index.html from src/
python -m http.server 3000 # dev server (or port 3002 per launch.json)
npm run serve              # build + serve in one step
npm test                   # run smoke + unit tests
npm run test:smoke         # build smoke test only
npm run test:unit          # vitest unit tests only
```

Preview tool server ID: `the-daily-node`

## Build System

`build.js` runs `esbuild.build({ entryPoints: ['src/App.jsx'], bundle: true, format: 'iife', minify: true })` to produce a single minified IIFE. React + ReactDOM are vendored UMD builds inlined into `src/index.html` as separate `<script>` tags (the `<!-- VENDOR -->` placeholder); a small `require()` shim before the IIFE maps the `react` and `react-dom/client` module specifiers to the global `React` / `ReactDOM`. No CDN, no in-browser Babel, no concat hack. Output goes to the `/* MODULES CONCATENATED BY build.js */` placeholder.

## Architecture

Single-file React dashboard for Bitcoin & mining monitoring. React + ReactDOM are vendored locally (inlined from `src/vendor/` at build time) — no CDN, no runtime bundler, no Babel.

**Component tree:**
```
App (root — owns all hooks, theme, localStorage prefs)
└── ThemeCtx.Provider
    └── CommandCenter (4-column grid)
        ├── Masthead + Ticker (top chrome)
        ├── Col 0: Sidebar (Logo, Clock, Weather, StatusDots)
        ├── Col 1: Price, LineChart, LeadStory
        ├── Col 2: News feed
        └── Col 3: Miners, Chain stats, Kicker
```

**Data flow:** External APIs → custom hooks → App → CommandCenter as props. Each hook exposes its own data field plus health metadata; shapes vary (e.g. `useBitaxe` → `{ miners, err, loading, lastOk, interval, refresh }`). Check the hook's return for exact fields.

**API sources** (intervals in `src/config.js`):
- Kraken + CoinGecko → `useBTC` (price, chart) — 30s
- Mempool.space (5 endpoints via `Promise.allSettled`) → `useChain` — 60s
- Local BitAxe API → `useBitaxe` (miner fleet)
- Open-Meteo → `useWeather` (auto dark mode on sunset) — 15m
- RSS2JSON (3 feeds) → `useRSS` — 5m

## Key Patterns

**Styling:** Inline `style` props only. No CSS files. All colors from `ThemeCtx` via `useT()`. Dark mode = swap theme object.

**Canvas scaling:** Dashboard renders at 1920×1080, scaled to viewport via CSS `transform`. `src/utils/scale.js` exports `u(n)` — returns `calc(var(--u) * n)` for design-px values. Scaling logic lives inline in the component that mounts the canvas.

**localStorage:** User prefs (weather location, time format, temp unit) persist under `dailynode-prefs`; v2 prefs (alerts, feeds, intervals, theme) under their own key via `utils/v2prefs.js`. App reads localStorage on mount, falls back to `config.js` defaults. The legacy `dailynode-bitaxe` key is removed unconditionally on mount as a one-time migration.

**Performance:** All components wrapped in `React.memo()`; hook callbacks in `useCallback()` with stable deps.

## Module Reference

| File | Purpose |
|------|---------|
| `src/config.js` | API endpoints, refresh intervals, defaults — change data sources here |
| `src/theme.js` | LIGHT/DARK theme objects, `ThemeCtx`, `useT()` hook |
| `src/utils/formatting.js` | All formatters: `fmtPrice`, `fmtPct`, `fmtHashrate`, `wmoIcon`, `classifyTopic`, etc. |
| `src/utils/api.js` | Fetch wrappers with 5s timeouts |
| `src/utils/scale.js` | Viewport scaling logic |
| `src/utils/svg.js` | SVG icon helpers |
| `src/hooks/useFeedHealth.js` | Monitors all data sources, drives sidebar status lights |
| `src/hooks/useLayoutSize.js` | Responsive layout dimensions |
| `src/hooks/usePageRefresh.js` | Scheduled page reload |
| `src/hooks/useResettableInterval.js` | Interval that resets on demand |
