# Architecture — The Daily Node

A comprehensive overview of the modular React dashboard for Bitcoin & mining monitoring.

## Component Tree

```
App (root)
├── ThemeCtx.Provider
    └── CommandCenter
        ├── Masthead (top chrome with settings toggle)
        ├── Ticker (scrolling chain vitals)
        └── 4-Column Grid (main content)
            ├── Column 0: Sidebar
            │   ├── Logo & Clock
            │   ├── Weather
            │   └── System Status Lights
            ├── Column 1: Price & News
            │   ├── Price (BTC/USD with chart)
            │   ├── LineChart (24h price history)
            │   └── Lead Story (top news)
            ├── Column 2: Headlines Feed
            │   └── News (scrollable ticker)
            └── Column 3: Mining & Chain Stats
                ├── Miners (BitAxe fleet stats)
                ├── Chain (difficulty, hashrate)
                └── Kicker & metrics
```

Each component is memoized (`React.memo`) to prevent unnecessary re-renders and optimized with `useCallback` for stable function references.

## Data Flow

Data flows from external APIs through custom hooks into the component tree:

```
External APIs
  ├── Kraken API → useBTC() → { price, chgPct, hi, lo, cap }
  ├── CoinGecko API → useBTC() → chartPts (24h hourly)
  ├── Mempool.space → useChain() → { height, hashrate, fees, difficulty }
  ├── BitAxe API → useBitaxe() → { miners, power, hashrate, temps }
  ├── Open-Meteo API → useWeather() → { temp, icon, wind, sunrise/sunset }
  └── RSS Feeds (RSS2JSON) → useRSS() → { articles, timestamps }

↓

Custom Hooks (src/hooks/)
  ├── useBTC: Fetches BTC price & chart, merges with market cap
  ├── useChain: Aggregates chain stats from 5 Mempool endpoints
  ├── useBitaxe: Polls local BitAxe API for miner health
  ├── useWeather: Uses geo coords to fetch weather, auto dark mode on sunset
  ├── useRSS: Aggregates Bitcoin news from 3 RSS feeds
  ├── useClock: Formats current time in 12h/24h
  └── useFeedHealth: Monitors all data sources, returns { up, down, stale }

↓

App Component
  ├── Calls all hooks in sequence
  ├── Manages dark mode, settings panel, user prefs (localStorage)
  ├── Provides ThemeCtx (LIGHT or DARK theme object)
  └── Passes hook data to CommandCenter as props

↓

CommandCenter & Presentational Components
  ├── Format data (price, pct, hashrate, etc.) via utils/formatting.js
  ├── Render values with theme colors & typography
  ├── Respond to user input (settings, dark toggle)
  └── Update localStorage on preference changes
```

All hook data includes `{ data, loading, error, lastOk }` for status monitoring. Updates are staggered via `setInterval` at rates defined in `config.js` (price every 30s, chain every 60s, weather every 15m, news every 5m).

## Modules

### **src/config.js**
Centralized configuration for API endpoints, refresh intervals, and user defaults. Contains RSS feed list, weather location, and fetch timeout. Exported as ES6 default and CommonJS for Node.js testability. Edit this file to customize API sources or polling rates.

### **src/theme.js**
Defines two complete color themes (LIGHT and DARK) with font stacks, ink shades, paper backgrounds, and semantic colors (orange, red, green). Exports `ThemeCtx` context and `useT()` hook for components to access current theme. Themes include typography scales (serif, body, sans, mono) and rule/divider opacity levels.

### **src/utils/formatting.js**
Collection of formatting functions for display: `fmtPrice()` (USD currency), `fmtPct()` (percent change), `fmtNum()` (1K/1M abbreviation), `fmtHashrate()` (EH/s, PH/s), `fmtDiff()` (T), `fmtMempoolMB()` (size), `fmtBlockTime()` (minutes), `fmtHour()` (time in 12h/24h), `calcSoloOdds()` (mining odds). Also includes WMO weather icon mapping (`wmoIcon()`, `wmoDesc()`, `wmoSpeed()`).

### **src/utils/api.js**
Low-level fetch wrappers with 5-second timeouts for all external APIs. Exports `fetchBTCPrice()` (Kraken), `fetchChainStats()` (Mempool, 5 parallel endpoints), `fetchBitaxeStats()` (BitAxe HTTP API), `fetchWeather()` (Open-Meteo), `fetchRSSFeeds()` (RSS2JSON proxy). Uses `Promise.allSettled()` for batch requests that fail gracefully.

### **src/utils/svg.js**
SVG component factory functions for icons: `svgLine()`, `svgRect()`, `svgCircle()`, `svgPath()`. Used by chart and weather components to render inline SVG graphics without external assets.

### **src/hooks/useBTC.js**
Fetches BTC price from Kraken API (primary) and 24h chart from CoinGecko. Returns `{ data, chartPts, loading, error, lastOk }`. Polls price every 30s and chart every 60s. Handles errors gracefully and merges market cap into data object.

### **src/hooks/useChain.js**
Aggregates block height, hashrate, network difficulty, mempool stats, and fee estimates from Mempool.space using 5 parallel endpoint requests. Returns computed values: difficulty adjustment countdown, solo mining odds, estimated retarget date. Polls every 60s.

### **src/hooks/useBitaxe.js**
Polls the server's `/api/miners` endpoint for miner fleet stats. Returns hashrate, power consumption, temperatures, and uptime per miner. Polls every 10s. Falls back gracefully if API unavailable.

### **src/hooks/useWeather.js**
Fetches current weather from Open-Meteo API (no key required) using lat/lng coordinates. Returns temperature, weather code (WMO), wind speed, and sunrise/sunset times. Triggers auto dark mode at sunset. Polls every 15 minutes. Supports Celsius/Fahrenheit.

### **src/hooks/useRSS.js**
Aggregates Bitcoin news from 3 RSS feeds (Bitcoin Magazine, CoinDesk, news.bitcoin.com) via RSS2JSON proxy. Removes duplicates and sorts by timestamp. Returns up to 100 articles with title, content, link, and publication date. Polls every 5 minutes.

### **src/hooks/useFeedHealth.js**
Monitor hook that tracks all data sources and returns overall feed health. Checks `lastOk` timestamps on all hooks and marks feeds as stale (>120s since last good fetch). Renders status lights in sidebar to indicate live/stale feeds.

### **src/hooks/useClock.js**
Simple time formatter that updates every 1 second. Accepts `timeFormat` string ('12h' or '24h') and returns formatted time string. Used for masthead clock display.

## Build Process

**Development (`npm run dev`):** Runs Python HTTP server on `localhost:3000` serving the pre-built `index.html` file. No rebuilding needed; edit source files and manually run `npm run build` when ready to test the minified output.

**Release (`npm run build`):** Executes `build.js` script which:
1. Reads all source files in dependency order (config → theme → utils → components → hooks → App)
2. Removes all `import`/`export` statements (file concatenation model)
3. Strips CommonJS wrapper for Node.js testability
4. Concatenates all modules into a single JavaScript block
5. Injects concatenated code into `src/index.html` template (replaces `/* MODULES CONCATENATED BY build.js */` placeholder)
6. Minifies entire HTML file with esbuild (whitespace, variable mangling, but preserves React/Babel CDN)
7. Writes output to `index.html` (single-file deliverable)

**Key insight:** The build process creates a **single-file HTML dashboard**. All React, Babel, and application code is bundled inline; esbuild minifies the entire document, reducing file size for easy deployment or distribution.

## Styling

**Approach:** Inline `style` prop with CSS-in-JS. No external CSS files or SCSS. All color values pulled from `ThemeCtx` at render time, enabling instant dark mode toggle without reloading.

**Theming:** Two complete themes (LIGHT/DARK) defined in `theme.js` as plain objects. Each theme includes:
- **Ink shades:** ink (primary text), ink2, ink3, ink4 (decreasing contrast for secondary/tertiary text)
- **Paper shades:** paper (background), paper2 (secondary bg), paperHi (highlights)
- **Rule colors:** rule (lines), rule2/rule3 (lighter dividers at different opacity)
- **Semantic colors:** orange (accent), red (down/negative), green (up/positive)
- **Typography:** serif, body, sans, mono font stacks

**Responsive design:** The dashboard is locked to 1920×1080px canvas mounted in a centered `#stage` div. Browser window can be any size; CSS `transform` scale handles fit-to-screen. See `index.html` for `#canvas` element and `applyScale()` function in `Command Center.jsx`.

**Key pattern:** Components never hardcode colors. They pull from `const T = useT()` hook and reference `T.ink`, `T.paper`, `T.green`, etc. This decouples styling from component logic and makes theme switching trivial.

## Dependencies

**Runtime (via CDN in index.html):**
- **React 18.3.1** — Component library and hooks
- **ReactDOM 18.3.1** — DOM rendering and root creation
- **Babel Standalone 7.29.0** — JSX transpilation in the browser (transforms `.jsx` to `.js` at runtime)

**Development (npm devDependencies):**
- **esbuild 0.20.0** — Fast bundler/minifier for the final HTML file (dev-only, not shipped)

**No external UI libraries, CSS frameworks, or state managers.** React hooks (`useState`, `useEffect`, `useCallback`, `useContext`, `useRef`) handle all state. Browser `localStorage` persists user preferences. `fetch()` API handles all HTTP requests.

**Build chain:** Node.js (build.js) + esbuild. Source code is ES6 modules; build step concatenates modules and removes import/export, producing a single-file HTML deliverable that runs React from unpkg CDN.

---

## Key Patterns & Gotchas

**React.memo & useCallback:** All presentational components are wrapped in `React.memo()` to prevent re-renders when parent props haven't changed. Hook callbacks are wrapped in `useCallback()` with stable dependency arrays to maintain referential equality across renders.

**Promise.allSettled():** Used in `fetchChainStats()` to batch 5 Mempool endpoints in parallel. If one fails, others continue; the hook presents partial data instead of failing entirely.

**localStorage persistence:** User preferences (weather location, time format, temp unit) are saved to localStorage on change. App initializes from localStorage on mount, falling back to `config.js` defaults. Miner IPs are managed server-side via `bitaxe_api.py` and persisted to `bitaxe_config.json` — not localStorage.

**Canvas scaling:** The 1920×1080 canvas is rendered at native size in the DOM but scaled to fit the browser window via CSS `transform`. The `applyScale()` function calculates the required scale factor and applies it to `#canvas`.

**Error handling:** All API calls include try/catch and timeouts. Hooks return `{ data, loading, error, lastOk }` so components can display fallbacks or stale data gracefully. `useFeedHealth()` monitors all sources and colors status lights red when feeds are stale.

**Single-file distribution:** The final `index.html` is a complete, self-contained dashboard with no external dependencies except the React/Babel CDN. It can be opened directly in a browser or served from a simple HTTP server.
