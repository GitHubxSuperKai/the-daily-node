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

`build.js` transforms each `src/*.jsx` file's JSX with esbuild (`loader: 'jsx'`, `target: 'es2018'`) at build time, strips ESM `import`/`export` statements, and concatenates all `src/` files in dependency order into a single plain `<script>` block (the `/* MODULES CONCATENATED BY build.js */` placeholder in `src/index.html`), writing the result to `index.html`. React and ReactDOM are the production UMD builds vendored under `src/vendor/`, inlined as `<script>` tags (the `<!-- VENDOR -->` placeholder) — there is no CDN dependency and no in-browser Babel. The output HTML is written as-is (no minification step).

**Critical — read before touching any component:**

### 1. Imports: default only, never combined
The build regex strips `import X from 'module'` but silently breaks on combined default+named imports:
```js
// BREAKS build (blank page):
import React, { useRef, useState } from 'react';

// Correct — use React.* prefix for all hooks:
import React from 'react';
const ref = React.useRef(null);
const [x, setX] = React.useState(null);
```

### 2. Hook dependency arrays: declare variables first
A `useEffect` dependency array that references a variable declared *later* in the same function body breaks — the binding isn't initialized when the dependency array is evaluated during render. Always declare computed values before the hook that uses them.
```js
// BROKEN:
React.useEffect(() => { ... }, [oddsOneIn]);
const oddsOneIn = ...;

// Correct:
const oddsOneIn = ...;
React.useEffect(() => { ... }, [oddsOneIn]);
```

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
