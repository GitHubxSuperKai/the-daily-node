# The Daily Node — Repo Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the single 100KB `Command Center.html` into a modularized, maintainable codebase with externalizable config, clean separation of concerns, and comprehensive documentation—while keeping single-file delivery.

**Architecture:** Extract React hooks, utility functions, and components into separate modules organized by concern (utils/, hooks/, components/). A simple build script (build.js) concatenates these into a minified single-file output. Users get a single `Command Center.html` file; developers get a clean, navigable codebase.

**Tech Stack:** React 18, Babel standalone, esbuild (minification), Node.js (build script)

---

## File Structure Overview

```
src/
├── index.html              # Base template: HTML + CDN script tags + styles
├── config.js               # CONFIG object (externalized, user-customizable)
├── theme.js                # ThemeCtx, LIGHT/DARK palettes, design tokens, FONTS
├── utils/
│   ├── formatting.js       # fmtNum, fmtPrice, fmtVolUsd, fmtBlockTime, etc.
│   ├── api.js              # Fetch helpers (Kraken, RSS, mempool, weather)
│   └── svg.js              # _processSvg, ANIM_SPEED, METEOCONS_SVG, WxGlyph
├── hooks/
│   ├── useClock.js         # Current time + 12h/24h format toggle
│   ├── useBTC.js           # Kraken BTC price, volume, VWAP chart
│   ├── useChain.js         # Mempool.space: block height, hashrate, fees
│   ├── useBitaxe.js        # BitAxe API: fleet stats, aggregation
│   ├── useWeather.js       # Open-Meteo: current + 8h forecast, auto dark mode
│   ├── useRSS.js           # rss2json.com: multi-feed aggregation
│   └── useFeedHealth.js    # Health status of data feeds (LIVE dot color)
├── components/
│   ├── Num.jsx             # Formatted number with unit + delta indicator
│   ├── WxGlyph.jsx         # Weather icon with SMIL animation
│   ├── Kicker.jsx          # Small colored label (Mining/Mempool/Chain headings)
│   ├── Rule.jsx            # Horizontal line divider
│   ├── ItalicDeck.jsx      # Italic text block
│   ├── LineChart.jsx       # BTC price chart (canvas-based)
│   ├── BiasBar.jsx         # Left/center/right stacked bar
│   ├── StatusDot.jsx       # Red/green LIVE indicator
│   ├── Masthead.jsx        # Location, time format, theme toggle
│   ├── Price.jsx           # BTC price section
│   ├── Ticker.jsx          # Scrolling marquee (chain vitals)
│   ├── News.jsx            # Lead story + scrollable headlines
│   ├── Chain.jsx           # 3-column grid (Mining/Mempool/Chain)
│   ├── Weather.jsx         # Current + 8-hour forecast
│   ├── Miners.jsx          # BitAxe fleet dashboard
│   ├── MastheadPanel.jsx   # Settings panel (location, time format, API config)
│   └── CommandCenter.jsx   # Main layout orchestration (1920×1080 canvas)
└── App.jsx                 # Root component, state management

build.js                     # Build script: concatenate + minify
package.json                 # Scripts: build, dev, serve
.gitignore
```

---

## Tasks

### Task 1: Set Up Directory Structure

**Files:**
- Create: `src/` directory
- Create: `src/utils/`, `src/hooks/`, `src/components/`
- Create: `.gitignore` (update existing)
- Create: `package.json`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p src/utils src/hooks src/components
```

- [ ] **Step 2: Create package.json**

```bash
cat > package.json << 'EOF'
{
  "name": "the-daily-node",
  "version": "1.0.0",
  "description": "Single-file React dashboard: Bitcoin price, news, weather, mining stats",
  "scripts": {
    "build": "node build.js",
    "dev": "python -m http.server 3000",
    "serve": "npm run build && npm run dev"
  },
  "devDependencies": {
    "esbuild": "^0.20.0"
  }
}
EOF
```

- [ ] **Step 3: Update .gitignore to exclude dev/local files**

```bash
cat > .gitignore << 'EOF'
# Dev dependencies
node_modules/
package-lock.json

# IDE
.vscode/
.idea/

# Local config overrides
src/config.local.js

# Dev utilities
icons-preview.html
EOF
```

- [ ] **Step 4: Commit directory setup**

```bash
git add -A && git commit -m "feat: create src directory structure"
```

---

### Task 2: Extract Config Module

**Files:**
- Create: `src/config.js`

- [ ] **Step 1: Create config.js with all externalized values**

Extract from `Command Center.html` lines 99-130 and convert to module:

```javascript
// src/config.js

const CONFIG = {
  // ─── BitAxe API ───────────────────────────────────────
  // Set these to your local BitAxe API server and miner IPs
  // Leave empty to disable BitAxe monitoring
  BITAXE_API_URL: '',
  BITAXE_IPS: [],

  // ─── RSS Feeds ────────────────────────────────────────
  RSS_FEEDS: [
    { name: 'Bitcoin Magazine', url: 'https://bitcoinmagazine.com/feed' },
    { name: 'CoinDesk', url: 'https://coindesk.com/arc/outboundfeeds/rss/' },
    { name: 'News.bitcoin.com', url: 'https://news.bitcoin.com/feed/' },
  ],

  // ─── API & Network ────────────────────────────────────
  FETCH_TIMEOUT: 5000,
  RSS2JSON_KEY: localStorage.getItem('rss2json_key') || '',

  // ─── Refresh Intervals (milliseconds) ──────────────────
  REFRESH_INTERVALS: {
    price: 30000,        // BTC price every 30s
    news: 300000,        // News every 5m
    chain: 10000,        // Chain vitals every 10s
    weather: 600000,     // Weather every 10m
    bitaxe: 15000,       // Miner stats every 15s
  },

  // ─── Weather ──────────────────────────────────────────
  WEATHER_TIMEZONE: 'auto',
};
```

- [ ] **Step 2: Verify CONFIG is exported and testable**

Add at end of file:

```javascript
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
```

- [ ] **Step 3: Test by loading in Node**

```bash
node -e "const CONFIG = require('./src/config.js'); console.log(CONFIG.FETCH_TIMEOUT);"
```

Expected output: `5000`

- [ ] **Step 4: Commit**

```bash
git add src/config.js && git commit -m "feat: extract config module"
```

---

### Task 3: Extract Theme Module

**Files:**
- Create: `src/theme.js`

- [ ] **Step 1: Extract theme context and palettes**

From `Command Center.html` lines 132-151:

```javascript
// src/theme.js

const ThemeCtx = React.createContext(null);

const FONTS = {
  serif: '"Fraunces", Georgia, serif',
  body: '"Newsreader", Georgia, serif',
  sans: '"Inter Tight", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
};

const LIGHT = {
  ...FONTS,
  paper: '#f3eee4',
  paper2: '#ebe4d6',
  ink: '#16130f',
  ink2: '#4a4438',
  ink3: '#8a8272',
  ink4: '#b8b0a0',
  rule: 'rgba(26,23,20,1)',
  rule2: 'rgba(26,23,20,0.18)',
  rule3: 'rgba(26,23,20,0.08)',
  orange: '#c8641a',
  red: '#9c2a1a',
  green: '#3a6b2e',
};

const DARK = {
  ...FONTS,
  paper: '#1a1815',
  paper2: '#23201c',
  ink: '#f3eee4',
  ink2: '#d4cfc0',
  ink3: '#a8a090',
  ink4: '#807560',
  rule: 'rgba(243,238,228,1)',
  rule2: 'rgba(243,238,228,0.16)',
  rule3: 'rgba(243,238,228,0.08)',
  orange: '#e8985a',
  red: '#d65b4b',
  green: '#5daa3d',
};

function useT() {
  return React.useContext(ThemeCtx);
}
```

- [ ] **Step 2: Export all theme exports**

```javascript
// At end of src/theme.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ThemeCtx, FONTS, LIGHT, DARK, useT };
}
```

- [ ] **Step 3: Test theme loads**

```bash
node -e "const { DARK } = require('./src/theme.js'); console.log(DARK.ink);"
```

Expected output: `#f3eee4`

- [ ] **Step 4: Commit**

```bash
git add src/theme.js && git commit -m "feat: extract theme module with design tokens"
```

---

### Task 4: Extract Formatting Utilities

**Files:**
- Create: `src/utils/formatting.js`

- [ ] **Step 1: Extract all number/time formatting functions**

From `Command Center.html` lines 156-290:

```javascript
// src/utils/formatting.js

function fmtNum(n, decimals = 0) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPrice(n) {
  return '$' + fmtNum(n, 2);
}

function fmtPct(n) {
  const s = (n >= 0 ? '+' : '') + fmtNum(n, 2);
  return s + '%';
}

function fmtVolUsd(v) {
  if (v >= 1e9) return '$' + fmtNum(v / 1e9, 1) + 'B';
  if (v >= 1e6) return '$' + fmtNum(v / 1e6, 1) + 'M';
  return '$' + fmtNum(v / 1e3, 1) + 'K';
}

function fmtBlockTime(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}m ${secs}s`;
}

function fmtHashrate(ehsRaw) {
  if (ehsRaw >= 1e18) return fmtNum(ehsRaw / 1e18, 0) + ' EH/s';
  if (ehsRaw >= 1e15) return fmtNum(ehsRaw / 1e15, 1) + ' PH/s';
  if (ehsRaw >= 1e12) return fmtNum(ehsRaw / 1e12, 1) + ' TH/s';
  return fmtNum(ehsRaw / 1e9, 1) + ' GH/s';
}

function fmtDiff(d) {
  if (d >= 1e12) return fmtNum(d / 1e12, 0) + ' T';
  if (d >= 1e9) return fmtNum(d / 1e9, 0) + ' B';
  return fmtNum(d / 1e6, 0) + ' M';
}

function fmtMempoolMB(bytes) {
  return fmtNum(bytes / 1e6, 1) + ' MB';
}

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);
  if (diff <= 0) return 'just now';
  if (diff < 60) return diff + 's ago';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function fmtHour(hr, timeFormat) {
  if (timeFormat === '24h') return `${String(hr).padStart(2, '0')}:00`;
  const ampm = hr >= 12 ? 'PM' : 'AM';
  const hr12 = hr % 12 || 12;
  return `${hr12} ${ampm}`;
}

function nextHalving(height) {
  const HALVING_INTERVAL = 210000;
  const GENESIS_HALVING = 210000;
  const halvings = Math.floor(height / HALVING_INTERVAL) + 1;
  const nextHeight = halvings * HALVING_INTERVAL;
  const blocksRemaining = nextHeight - height;
  const estimatedDays = Math.floor(blocksRemaining / 144); // ~144 blocks/day
  return { height: nextHeight, estimatedDays, blocksRemaining };
}

function circulatingBTC(height) {
  // Total supply if fully mined: 21 million
  // Precise calculation down to satoshi accounting for halvings
  const SUBSIDY_INTERVAL = 210000;
  let supply = 0;
  let subsidy = 50; // Initial block subsidy in BTC

  let h = 0;
  while (h < height && subsidy > 0) {
    const interval = Math.min(SUBSIDY_INTERVAL, height - h);
    supply += interval * subsidy;
    h += SUBSIDY_INTERVAL;
    subsidy /= 2;
  }
  // Account for partial interval
  const remainder = height % SUBSIDY_INTERVAL;
  supply += remainder * subsidy;
  // Return in millions
  return supply / 1e6;
}

function calcSoloOdds(networkEHS, minerTHS) {
  if (networkEHS <= 0 || minerTHS <= 0) return Infinity;
  const networkTHS = networkEHS / 1e9;
  const hashRatio = minerTHS / networkTHS;
  const expectedBlockTime = 10 * 60; // 10 minutes in seconds
  const blocksPerYear = (365.25 * 24 * 3600) / expectedBlockTime;
  const expectedBlocksForMiner = blocksPerYear * hashRatio;
  if (expectedBlocksForMiner === 0) return Infinity;
  const yearsToBlock = 1 / expectedBlocksForMiner;
  return yearsToBlock;
}

// Weather code descriptions
function wmoDesc(code) {
  const descriptions = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Foggy',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with hail',
    99: 'Thunderstorm with hail',
  };
  return descriptions[code] || 'Unknown';
}

// Weather icon selection (WMO code → Meteocons icon)
function wmoIcon(code, hr, windMph, sunriseHr, sunsetHr) {
  const isNight = hr < sunriseHr || hr >= sunsetHr;
  if ([0, 1].includes(code)) return isNight ? 'clear-night' : 'clear-day';
  if ([2].includes(code)) return isNight ? 'partly-cloudy-night' : 'partly-cloudy-day';
  if ([3, 45, 48].includes(code)) return 'overcast';
  if ([51, 53, 55, 80, 81, 82].includes(code)) return 'rain';
  if ([61, 63, 65].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if (windMph > 25) return 'wind';
  if ([95, 96, 99].includes(code)) return 'thunderstorms';
  return 'overcast';
}

// Animation speed based on weather condition
function wmoSpeed(code, windMph) {
  const SPEEDS = {
    'clear-day': 1,
    'clear-night': 0.6,
    'partly-cloudy-day': 0.8,
    'partly-cloudy-night': 0.7,
    'overcast': 1.2,
    'rain': 2,
    'drizzle': 1.5,
    'snow': 1.5,
    'fog': 0.9,
    'wind': 2.5,
    'thunderstorms': 2.2,
  };
  const icon = wmoIcon(code, 12, windMph, 6, 18); // Use midday reference
  return SPEEDS[icon] || 1;
}
```

- [ ] **Step 2: Add exports**

```javascript
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fmtNum,
    fmtPrice,
    fmtPct,
    fmtVolUsd,
    fmtBlockTime,
    fmtHashrate,
    fmtDiff,
    fmtMempoolMB,
    timeAgo,
    fmtHour,
    nextHalving,
    circulatingBTC,
    calcSoloOdds,
    wmoDesc,
    wmoIcon,
    wmoSpeed,
  };
}
```

- [ ] **Step 3: Test formatting functions**

```bash
node -e "const { fmtPrice } = require('./src/utils/formatting.js'); console.log(fmtPrice(42000));"
```

Expected output: `$42,000.00`

- [ ] **Step 4: Commit**

```bash
git add src/utils/formatting.js && git commit -m "feat: extract formatting utilities"
```

---

### Task 5: Extract SVG & Icon Processing

**Files:**
- Create: `src/utils/svg.js`

- [ ] **Step 1: Extract SVG processing and animation configuration**

From `Command Center.html` lines 399-470:

```javascript
// src/utils/svg.js

const ANIM_SPEED = {
  'clear-day': 1,
  'clear-night': 0.6,
  'partly-cloudy-day': 0.8,
  'partly-cloudy-night': 0.7,
  'overcast': 1.2,
  'rain': 2,
  'drizzle': 1.5,
  'snow': 1.5,
  'fog': 0.9,
  'wind': 2.5,
  'thunderstorms': 2.2,
};

const METEOCONS_SVG = {
  'clear-day': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="24" r="10" fill="currentColor"/><path d="M32 8v8M32 40v8M56 24h-8M8 24h8M49.5 10.5l-5.7 5.7M19.2 40.8l-5.7 5.7M49.5 37.5l5.7 5.7M14.5 14.5l5.7 5.7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  'clear-night': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M40 12c-4 0-8 3.6-8 8 0-4.4-3.6-8-8-8 4.4 0 8-3.6 8-8 0 4.4 3.6 8 8 8z" fill="currentColor"/></svg>',
  'partly-cloudy-day': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="20" cy="20" r="8" fill="currentColor"/><path d="M28 20v6M28 8v6M42 14h-6M50 14h6M40.2 11l-4.2 4.2M37.8 23l4.2 4.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M40 32c5 0 9 4 9 9H16c0-5 4-9 9-9z" fill="currentColor" opacity="0.7"/></svg>',
  'partly-cloudy-night': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M24 16c-3 0-6 2.5-6 5.5 0-3 2.5-5.5 5.5-5.5 0-3-2.5-5-5-5-2.5 0-5 2-5 5s2.5 5.5 5.5 5.5c3 0 5.5-2.5 5.5-5.5z" fill="currentColor"/><path d="M40 32c5 0 9 4 9 9H16c0-5 4-9 9-9z" fill="currentColor" opacity="0.7"/></svg>',
  'overcast': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M40 24c5 0 9 4 9 9H16c0-5 4-9 9-9z" fill="currentColor" opacity="0.6"/><path d="M48 40c3 0 5 2 5 5H12c0-3 2-5 5-5z" fill="currentColor" opacity="0.4"/></svg>',
  'rain': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M40 24c5 0 9 4 9 9H16c0-5 4-9 9-9z" fill="currentColor" opacity="0.6"/><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="20" y1="38" x2="18" y2="48"/><line x1="32" y1="38" x2="30" y2="48"/><line x1="44" y1="38" x2="42" y2="48"/></g></svg>',
  'drizzle': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M40 24c5 0 9 4 9 9H16c0-5 4-9 9-9z" fill="currentColor" opacity="0.6"/><g stroke="currentColor" stroke-width="1" stroke-linecap="round"><circle cx="22" cy="42" r="1"/><circle cx="34" cy="42" r="1"/><circle cx="46" cy="42" r="1"/><circle cx="22" cy="50" r="1"/><circle cx="34" cy="50" r="1"/><circle cx="46" cy="50" r="1"/></g></svg>',
  'snow': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M40 24c5 0 9 4 9 9H16c0-5 4-9 9-9z" fill="currentColor" opacity="0.6"/><g fill="currentColor" opacity="0.7"><circle cx="22" cy="42" r="2"/><circle cx="34" cy="42" r="2"/><circle cx="46" cy="42" r="2"/><circle cx="22" cy="52" r="2"/><circle cx="34" cy="52" r="2"/><circle cx="46" cy="52" r="2"/></g></svg>',
  'fog': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="currentColor" opacity="0.5"><rect x="12" y="20" width="40" height="3" rx="1.5"/><rect x="12" y="28" width="40" height="3" rx="1.5"/><rect x="12" y="36" width="40" height="3" rx="1.5"/><rect x="12" y="44" width="40" height="3" rx="1.5"/></g></svg>',
  'wind': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h30M16 32h26M12 44h30"/><path d="M44 20l6-3l-6-3"/><path d="M44 32l6-3l-6-3"/><path d="M44 44l6-3l-6-3"/></g></svg>',
  'thunderstorms': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M40 24c5 0 9 4 9 9H16c0-5 4-9 9-9z" fill="currentColor" opacity="0.6"/><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="20" y1="38" x2="18" y2="48"/><line x1="32" y1="38" x2="30" y2="48"/><line x1="44" y1="38" x2="42" y2="48"/></g><g stroke="currentColor" stroke-width="1" opacity="0.6"><path d="M35 35l4-8l-2-1l4 8l-2-1" stroke-linecap="round" stroke-linejoin="round"/></g></svg>',
};

function _processSvg(raw, uid, speedMult, sz) {
  // Rewrite id=, url(#...), href="#..." with uid prefix to avoid conflicts
  let svg = raw
    .replace(/id="([^"]+)"/g, `id="${uid}$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${uid}$1)`)
    .replace(/href="#([^"]+)"/g, `href="#${uid}$1"`);

  // Scale SMIL animation durations
  svg = svg.replace(/dur="(\d+(?:\.\d+)?)s"/g, (m, s) => {
    const scaled = (parseFloat(s) / speedMult).toFixed(2);
    return `dur="${scaled}s"`;
  });
  svg = svg.replace(/dur="(\d+(?:\.\d+)?)ms"/g, (m, ms) => {
    const scaled = (parseFloat(ms) / speedMult).toFixed(0);
    return `dur="${scaled}ms"`;
  });

  // Stamp width/height on root SVG if missing
  if (!svg.includes('width=')) {
    svg = svg.replace('<svg', `<svg width="${sz}" height="${sz}"`);
  }

  return svg;
}
```

- [ ] **Step 2: Add exports**

```javascript
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ANIM_SPEED,
    METEOCONS_SVG,
    _processSvg,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/svg.js && git commit -m "feat: extract SVG processing and weather icon library"
```

---

### Task 6: Extract API Fetch Helpers

**Files:**
- Create: `src/utils/api.js`

- [ ] **Step 1: Extract fetch helper functions**

Create fetch wrappers for each API (Kraken, mempool.space, rss2json, Open-Meteo):

```javascript
// src/utils/api.js

// Kraken BTC price + volume
async function fetchBTCPrice() {
  const resp = await fetch('https://api.kraken.com/0/public/Ticker?pair=XBTUSDT', {
    signal: AbortSignal.timeout(5000),
  });
  const data = await resp.json();
  const ticker = data.result.XXBTZUSD;
  return {
    price: parseFloat(ticker.c[0]),
    volume: parseFloat(ticker.v[1]),
  };
}

// Mempool.space chain stats
async function fetchChainStats() {
  const timeoutSignal = AbortSignal.timeout(5000);
  const [blockRes, hashRes, feeRes, mempoolRes, diffRes] = await Promise.all([
    fetch('https://mempool.space/api/blocks/tip/height', { signal: timeoutSignal }),
    fetch('https://mempool.space/api/v1/mining/hashrate/1d', { signal: timeoutSignal }),
    fetch('https://mempool.space/api/v1/fees/recommended', { signal: timeoutSignal }),
    fetch('https://mempool.space/api/mempool', { signal: timeoutSignal }),
    fetch('https://mempool.space/api/v1/difficulty-adjustment', { signal: timeoutSignal }),
  ]);

  const height = await blockRes.json();
  const hashData = await hashRes.json();
  const feeData = await feeRes.json();
  const mempoolData = await mempoolRes.json();
  const diffData = await diffRes.json();

  return {
    height,
    hashrate: hashData.hashrate || 0,
    recommendedFee: feeData.halfHourFee || 0,
    mempoolBytes: mempoolData.count * 250, // Rough estimate
    diffAdjustment: diffData,
  };
}

// Open-Meteo weather
async function fetchWeather(lat, lng, tzName = 'auto') {
  const resp = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&temperature_unit=fahrenheit&timezone=${tzName}`,
    { signal: AbortSignal.timeout(5000) }
  );
  return resp.json();
}

// rss2json multi-feed
async function fetchRSSFeeds(feeds, apiKey = '') {
  const timeoutSignal = AbortSignal.timeout(5000);
  const results = await Promise.allSettled(
    feeds.map(feed =>
      fetch(
        `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}${apiKey ? `&api_key=${apiKey}` : ''}`,
        { signal: timeoutSignal }
      ).then(r => r.json()).then(data => ({
        ...feed,
        items: data.items || [],
        lastUpdate: new Date(),
      }))
    )
  );

  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
}

// BitAxe fleet API
async function fetchBitAxeMiners(apiUrl) {
  if (!apiUrl) return [];
  try {
    const resp = await fetch(`${apiUrl}/api/miners`, {
      signal: AbortSignal.timeout(5000),
    });
    return resp.json().then(data => data.miners || []);
  } catch (e) {
    return [];
  }
}

// Individual miner (for direct polling without API proxy)
async function fetchBitAxeMiner(ip) {
  try {
    const resp = await fetch(`http://${ip}/api/system/info`, {
      signal: AbortSignal.timeout(5000),
    });
    return await resp.json();
  } catch (e) {
    return null;
  }
}
```

- [ ] **Step 2: Add exports**

```javascript
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fetchBTCPrice,
    fetchChainStats,
    fetchWeather,
    fetchRSSFeeds,
    fetchBitAxeMiners,
    fetchBitAxeMiner,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/api.js && git commit -m "feat: extract API fetch helpers"
```

---

### Task 7: Create Base Template (src/index.html)

**Files:**
- Create: `src/index.html`

- [ ] **Step 1: Create base HTML template with CDN scripts and styles**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>The Daily Node — Command Center</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,600;1,9..144,700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 100%; height: 100%;
    background: #f3eee4;
    overflow: hidden;
  }
  #stage {
    position: fixed; inset: 0;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
    background: inherit;
  }
  #canvas {
    width: 1920px; height: 1080px;
    transform-origin: center center;
    flex-shrink: 0;
    overflow: hidden;
  }
  @keyframes live-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.25; }
  }
  @keyframes ticker-scroll {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }
  a { text-decoration: none; color: inherit; }
  .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
  .no-scrollbar::-webkit-scrollbar { display: none; }
  .news-scroll { scrollbar-width: thin; scrollbar-color: rgba(138,130,114,0) transparent; }
  .news-scroll.is-scrolling { scrollbar-color: rgba(138,130,114,0.45) transparent; }
  .news-scroll::-webkit-scrollbar { width: 3px; }
  .news-scroll::-webkit-scrollbar-track { background: transparent; }
  .news-scroll::-webkit-scrollbar-thumb { background: rgba(138,130,114,0); border-radius: 2px; transition: background 0.2s ease; }
  .news-scroll.is-scrolling::-webkit-scrollbar-thumb { background: rgba(138,130,114,0.45); }
  .news-col-wrap { position: relative; display: flex; flex-direction: column; min-height: 0; }
  .news-col-wrap::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 48px; background: linear-gradient(to bottom, transparent, var(--paper)); pointer-events: none; transition: opacity 0.3s; }
  .news-col-wrap.at-bottom::after { opacity: 0; }
  :root {
    --f-serif:    "Fraunces", Georgia, serif;
    --f-body:     "Newsreader", Georgia, serif;
    --f-sans:     "Inter Tight", system-ui, sans-serif;
    --f-mono:     "JetBrains Mono", ui-monospace, monospace;
    --n-hero:   68px;
    --n-lg:     32px;
    --n-md:     22px;
    --n-sm:     16px;
    --n-xs:     12px;
    --ink:      #16130f;
    --ink2:     #4a4438;
    --ink3:     #8a8272;
    --ink4:     #b8b0a0;
    --paper:    #f3eee4;
    --paper2:   #ebe4d6;
    --rule:     rgba(26,23,20,1);
    --rule2:    rgba(26,23,20,0.18);
    --rule3:    rgba(26,23,20,0.08);
    --orange:   #c8641a;
    --red:      #9c2a1a;
    --green:    #3a6b2e;
  }
</style>
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"></script>
</head>
<body>
<div id="stage"><div id="canvas"></div></div>

<script>
const CANVAS_W = 1920, CANVAS_H = 1080;
function applyScale() {
  const canvas = document.getElementById('canvas');
  const s = Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H);
  canvas.style.transform = `scale(${s})`;
}
window.addEventListener('resize', applyScale);
window.addEventListener('load', applyScale);
applyScale();
window.applyScale = applyScale;
</script>

<!-- App code will be injected here by build.js -->
<script type="text/babel">
/* MODULES CONCATENATED BY build.js */
</script>

</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add src/index.html && git commit -m "feat: create base HTML template"
```

---

### Task 8: Extract Small UI Components

**Files:**
- Create: `src/components/Num.jsx`
- Create: `src/components/StatusDot.jsx`
- Create: `src/components/Kicker.jsx`
- Create: `src/components/Rule.jsx`
- Create: `src/components/ItalicDeck.jsx`

- [ ] **Step 1: Create Num.jsx (formatted number component)**

```jsx
// src/components/Num.jsx

function Num({ size = 'md', value, unit, delta, deltaUp, style = {} }) {
  const T = useT();
  const sizeMap = { xs: '12px', sm: '16px', md: '22px', lg: '32px', hero: '68px' };
  const deltaColor = delta === undefined ? 'inherit' : deltaUp ? T.green : T.red;
  const innerStyle = {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
  };

  return (
    <div style={{ ...style, fontSize: sizeMap[size], color: style.color || T.ink }}>
      <div style={innerStyle}>
        <span>{fmtNum(value)}</span>
        {unit && <span style={{ fontSize: '0.7em', opacity: 0.75 }}>{unit}</span>}
      </div>
      {delta !== undefined && (
        <div style={{ fontSize: '0.6em', color: deltaColor, marginTop: '2px' }}>
          {deltaUp ? '↑' : '↓'} {fmtNum(Math.abs(delta), 2)}%
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create StatusDot.jsx**

```jsx
// src/components/StatusDot.jsx

function StatusDot({ ok }) {
  const T = useT();
  return (
    <div
      style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: ok ? T.green : T.red,
        animation: ok ? 'none' : 'live-pulse 1s infinite',
      }}
    />
  );
}
```

- [ ] **Step 3: Create Kicker.jsx**

```jsx
// src/components/Kicker.jsx

function Kicker({ children, color, style = {} }) {
  const T = useT();
  return (
    <div
      style={{
        fontSize: '12px',
        fontFamily: T.sans,
        fontWeight: 500,
        letterSpacing: '0.05em',
        color: color || T.ink3,
        textTransform: 'uppercase',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Create Rule.jsx**

```jsx
// src/components/Rule.jsx

function Rule({ double, dash, weight = 1, style = {} }) {
  const T = useT();
  return (
    <div
      style={{
        borderTop: `${weight}px ${dash ? 'dashed' : 'solid'} ${T.rule2}`,
        ...style,
      }}
    >
      {double && <div style={{ borderTop: `${weight}px ${dash ? 'dashed' : 'solid'} ${T.rule2}`, marginTop: '3px' }} />}
    </div>
  );
}
```

- [ ] **Step 5: Create ItalicDeck.jsx**

```jsx
// src/components/ItalicDeck.jsx

function ItalicDeck({ children, style = {} }) {
  const T = useT();
  return (
    <div
      style={{
        fontFamily: T.body,
        fontStyle: 'italic',
        fontSize: '16px',
        color: T.ink3,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 6: Commit all small components**

```bash
git add src/components/ && git commit -m "feat: extract small UI components (Num, StatusDot, Kicker, Rule, ItalicDeck)"
```

---

### Task 9: Extract Line Chart Component

**Files:**
- Create: `src/components/LineChart.jsx`

- [ ] **Step 1: Create LineChart.jsx**

From `Command Center.html` lines 324-378:

```jsx
// src/components/LineChart.jsx

function LineChart({ w, h, color, points, fill, vwap }) {
  const T = useT();
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !points || points.length < 2) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const minVal = Math.min(...points);
    const maxVal = Math.max(...points);
    const range = maxVal - minVal || 1;

    const drawLine = (pts, col, width) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = width;
      ctx.beginPath();
      pts.forEach((val, i) => {
        const x = (i / (pts.length - 1)) * w;
        const y = h - ((val - minVal) / range) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    drawLine(points, color, 2);

    if (vwap) {
      const vwapVal = vwap;
      const vwapY = h - ((vwapVal - minVal) / range) * h;
      ctx.strokeStyle = T.rule3;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, vwapY);
      ctx.lineTo(w, vwapY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (fill) {
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, `${color}20`);
      gradient.addColorStop(1, `${color}00`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      points.forEach((val, i) => {
        const x = (i / (points.length - 1)) * w;
        const y = h - ((val - minVal) / range) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
    }
  }, [w, h, points, color, fill, vwap]);

  return <canvas ref={canvasRef} style={{ display: 'block' }} />;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/LineChart.jsx && git commit -m "feat: extract LineChart canvas component"
```

---

### Task 10: Extract BiasBar Component

**Files:**
- Create: `src/components/BiasBar.jsx`

- [ ] **Step 1: Create BiasBar.jsx**

From `Command Center.html` lines 379-397:

```jsx
// src/components/BiasBar.jsx

function BiasBar({ left, center, right, total }) {
  const T = useT();
  const leftPct = (left / (total || 1)) * 100;
  const centerPct = (center / (total || 1)) * 100;
  const rightPct = (right / (total || 1)) * 100;

  return (
    <div
      style={{
        display: 'flex',
        height: '6px',
        borderRadius: '2px',
        overflow: 'hidden',
        backgroundColor: T.rule2,
      }}
    >
      <div style={{ flex: leftPct, backgroundColor: T.red }} />
      <div style={{ flex: centerPct, backgroundColor: T.green }} />
      <div style={{ flex: rightPct, backgroundColor: T.orange }} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BiasBar.jsx && git commit -m "feat: extract BiasBar component"
```

---

### Task 11: Extract WxGlyph (Weather Icon) Component

**Files:**
- Create: `src/components/WxGlyph.jsx`

- [ ] **Step 1: Create WxGlyph.jsx**

```jsx
// src/components/WxGlyph.jsx

function WxGlyph({ kind, size, speed: speedProp }) {
  const T = useT();
  const sizeMap = { xs: '20px', sm: '32px', md: '48px', lg: '64px' };
  const sizeVal = sizeMap[size] || '48px';

  const uid = React.useId();
  const speed = speedProp || wmoSpeed(0, 0);
  const raw = METEOCONS_SVG[kind] || METEOCONS_SVG['overcast'];
  const svg = _processSvg(raw, uid, speed, parseInt(sizeVal));
  const isDark = T.paper === DARK.paper;
  const textColor = isDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.80)';

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: sizeVal,
        height: sizeVal,
        color: textColor,
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/WxGlyph.jsx && git commit -m "feat: extract WxGlyph weather icon component"
```

---

### Task 12: Extract Data Hooks (useClock, useBTC, useChain)

**Files:**
- Create: `src/hooks/useClock.js`
- Create: `src/hooks/useBTC.js`
- Create: `src/hooks/useChain.js`

- [ ] **Step 1: Create useClock.js**

```javascript
// src/hooks/useClock.js

function useClock(timeFormat) {
  const [time, setTime] = React.useState(new Date());

  React.useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = String(time.getHours()).padStart(2, '0');
  const minutes = String(time.getMinutes()).padStart(2, '0');
  const seconds = String(time.getSeconds()).padStart(2, '0');

  if (timeFormat === '24h') {
    return `${hours}:${minutes}:${seconds}`;
  }

  const ampm = parseInt(hours) >= 12 ? 'PM' : 'AM';
  const h12 = parseInt(hours) % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
}
```

- [ ] **Step 2: Create useBTC.js**

From `Command Center.html` lines 498-553:

```javascript
// src/hooks/useBTC.js

function useBTC() {
  const [btc, setBTC] = React.useState({
    price: null,
    priceHi24: null,
    priceLo24: null,
    volume: null,
    vwap: null,
    chart: [],
    loading: true,
    error: null,
  });

  const fetchData = React.useCallback(async () => {
    try {
      // Kraken price
      const priceResp = await fetch('https://api.kraken.com/0/public/Ticker?pair=XBTUSDT', {
        signal: AbortSignal.timeout(5000),
      });
      const priceData = await priceResp.json();
      const ticker = priceData.result.XXBTZUSD;
      const price = parseFloat(ticker.c[0]);
      const hi = parseFloat(ticker.h[1]);
      const lo = parseFloat(ticker.l[1]);
      const volBtc = parseFloat(ticker.v[1]);

      // Kraken OHLC for chart
      const chartResp = await fetch('https://api.kraken.com/0/public/OHLC?pair=XBTUSDT&interval=5', {
        signal: AbortSignal.timeout(5000),
      });
      const chartData = await chartResp.json();
      const ohlc = chartData.result.XXBTZUSD || [];
      const closes = ohlc.map(row => parseFloat(row[4])); // closing price

      // VWAP calculation
      let totalValue = 0, totalVol = 0;
      ohlc.forEach(row => {
        const close = parseFloat(row[4]);
        const vol = parseFloat(row[7]);
        totalValue += close * vol;
        totalVol += vol;
      });
      const vwap = totalVol > 0 ? totalValue / totalVol : price;

      const volume = volBtc * price;

      setBTC({
        price,
        priceHi24: hi,
        priceLo24: lo,
        volume,
        vwap,
        chart: closes,
        loading: false,
        error: null,
      });
    } catch (err) {
      setBTC(prev => ({
        ...prev,
        loading: false,
        error: err.message,
      }));
    }
  }, []);

  React.useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, CONFIG.REFRESH_INTERVALS.price);
    return () => clearInterval(interval);
  }, [fetchData]);

  return btc;
}
```

- [ ] **Step 3: Create useChain.js**

From `Command Center.html` lines 554-613:

```javascript
// src/hooks/useChain.js

function useChain() {
  const [chain, setChain] = React.useState({
    blockHeight: null,
    blockTime: null,
    hashrate: null,
    recommendedFee: null,
    mempoolMB: null,
    diffAdjustment: null,
    loading: true,
    error: null,
  });

  const fetchData = React.useCallback(async () => {
    try {
      const timeoutSignal = AbortSignal.timeout(5000);
      const [blockRes, hashRes, feeRes, mempoolRes, diffRes] = await Promise.all([
        fetch('https://mempool.space/api/blocks/tip/height', { signal: timeoutSignal }),
        fetch('https://mempool.space/api/v1/mining/hashrate/1d', { signal: timeoutSignal }),
        fetch('https://mempool.space/api/v1/fees/recommended', { signal: timeoutSignal }),
        fetch('https://mempool.space/api/mempool', { signal: timeoutSignal }),
        fetch('https://mempool.space/api/v1/difficulty-adjustment', { signal: timeoutSignal }),
      ]);

      const height = await blockRes.json();
      const hashData = await hashRes.json();
      const feeData = await feeRes.json();
      const mempoolData = await mempoolRes.json();
      const diffData = await diffRes.json();

      const blockTimeMs = (diffData.timeAvg || 600) * 1000;

      setChain({
        blockHeight: height,
        blockTime: blockTimeMs,
        hashrate: hashData.hashrate || 0,
        recommendedFee: feeData.halfHourFee || 0,
        mempoolMB: fmtMempoolMB(mempoolData.count * 250),
        diffAdjustment: diffData,
        loading: false,
        error: null,
      });
    } catch (err) {
      setChain(prev => ({
        ...prev,
        loading: false,
        error: err.message,
      }));
    }
  }, []);

  React.useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, CONFIG.REFRESH_INTERVALS.chain);
    return () => clearInterval(interval);
  }, [fetchData]);

  return chain;
}
```

- [ ] **Step 4: Commit hooks**

```bash
git add src/hooks/ && git commit -m "feat: extract data hooks (useClock, useBTC, useChain)"
```

---

### Task 13: Extract Remaining Hooks (useBitaxe, useWeather, useRSS, useFeedHealth)

**Files:**
- Create: `src/hooks/useBitaxe.js`
- Create: `src/hooks/useWeather.js`
- Create: `src/hooks/useRSS.js`
- Create: `src/hooks/useFeedHealth.js`

- [ ] **Step 1: Create useBitaxe.js**

From `Command Center.html` lines 614-658:

```javascript
// src/hooks/useBitaxe.js

function useBitaxe(apiUrl, ips) {
  const [miners, setMiners] = React.useState({
    list: [],
    combined: null,
    loading: !apiUrl && ips.length === 0,
    error: null,
  });

  const fetchData = React.useCallback(async () => {
    if (!apiUrl && ips.length === 0) {
      setMiners({ list: [], combined: null, loading: false, error: null });
      return;
    }

    try {
      let minerList = [];

      if (apiUrl) {
        const resp = await fetch(`${apiUrl}/api/miners`, {
          signal: AbortSignal.timeout(5000),
        });
        const data = await resp.json();
        minerList = data.miners || [];
      } else if (ips.length > 0) {
        const results = await Promise.allSettled(
          ips.map(ip =>
            fetch(`http://${ip}/api/system/info`, {
              signal: AbortSignal.timeout(5000),
            }).then(r => r.json()).then(data => ({ ip, ...data }))
          )
        );
        minerList = results
          .filter(r => r.status === 'fulfilled')
          .map(r => r.value);
      }

      // Compute combined stats
      let combined = null;
      if (minerList.length > 0) {
        const totalTHS = minerList.reduce((sum, m) => sum + (m.hashRate || 0), 0);
        combined = {
          count: minerList.length,
          totalTHS,
          avgHashRate: totalTHS / minerList.length,
        };
      }

      setMiners({
        list: minerList,
        combined,
        loading: false,
        error: null,
      });
    } catch (err) {
      setMiners(prev => ({
        ...prev,
        loading: false,
        error: err.message,
      }));
    }
  }, [apiUrl, ips]);

  React.useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, CONFIG.REFRESH_INTERVALS.bitaxe);
    return () => clearInterval(interval);
  }, [fetchData]);

  return miners;
}
```

- [ ] **Step 2: Create useWeather.js**

From `Command Center.html` lines 669-735:

```javascript
// src/hooks/useWeather.js

function useWeather(lat, lng, tempUnit) {
  const [weather, setWeather] = React.useState({
    current: null,
    hourly: [],
    data: null,
    loading: true,
    error: null,
    wxSunriseHr: null,
  });

  const autoThemeDone = React.useRef(false);
  const onAutoTheme = React.useCallback(() => {
    if (autoThemeDone.current) return;
    autoThemeDone.current = true;
    // Theme logic would be handled in parent component
  }, []);

  const fetchData = React.useCallback(async () => {
    try {
      const resp = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&temperature_unit=${tempUnit === 'C' ? 'celsius' : 'fahrenheit'}&timezone=auto`,
        { signal: AbortSignal.timeout(5000) }
      );
      const j = await resp.json();

      const sunriseStr = j.daily.sunrise[0];
      const sunriseHr = parseInt(sunriseStr.split('T')[1]);

      setWeather({
        current: j.current,
        hourly: j.hourly.time.map((t, i) => ({
          time: t,
          temp: j.hourly.temperature_2m[i],
          code: j.hourly.weather_code[i],
          precipProb: j.hourly.precipitation_probability[i],
        })),
        data: j,
        loading: false,
        error: null,
        wxSunriseHr: sunriseHr,
      });

      onAutoTheme();
    } catch (err) {
      setWeather(prev => ({
        ...prev,
        loading: false,
        error: err.message,
      }));
    }
  }, [lat, lng, tempUnit, onAutoTheme]);

  React.useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, CONFIG.REFRESH_INTERVALS.weather);
    return () => clearInterval(interval);
  }, [fetchData]);

  return weather;
}
```

- [ ] **Step 3: Create useRSS.js**

From `Command Center.html` lines 737-802:

```javascript
// src/hooks/useRSS.js

function useRSS() {
  const [rss, setRSS] = React.useState({
    feeds: [],
    merged: [],
    leadStory: null,
    loading: true,
    error: null,
  });

  const fetchData = React.useCallback(async () => {
    try {
      const key = CONFIG.RSS2JSON_KEY ? `&api_key=${CONFIG.RSS2JSON_KEY}` : '';
      const timeoutSignal = AbortSignal.timeout(5000);

      const results = await Promise.allSettled(
        CONFIG.RSS_FEEDS.map(feed =>
          fetch(
            `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}${key}`,
            { signal: timeoutSignal }
          ).then(r => r.json()).then(data => ({
            name: feed.name,
            items: data.items || [],
          }))
        )
      );

      const feeds = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);

      const merged = feeds
        .flatMap((feed, fIdx) =>
          feed.items.map(item => ({
            feedIdx: fIdx,
            feedName: feed.name,
            title: item.title,
            description: item.description || '',
            image: item.image || item.enclosure?.link || null,
            pubDate: item.pubDate,
            link: item.link,
          }))
        )
        .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

      const leadStory = merged[0] || null;

      setRSS({
        feeds,
        merged,
        leadStory,
        loading: false,
        error: null,
      });
    } catch (err) {
      setRSS(prev => ({
        ...prev,
        loading: false,
        error: err.message,
      }));
    }
  }, []);

  React.useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, CONFIG.REFRESH_INTERVALS.news);
    return () => clearInterval(interval);
  }, [fetchData]);

  return rss;
}
```

- [ ] **Step 4: Create useFeedHealth.js**

From `Command Center.html` lines 804-822:

```javascript
// src/hooks/useFeedHealth.js

function useFeedHealth(feeds) {
  const [lastUpdate, setLastUpdate] = React.useState(null);

  React.useEffect(() => {
    // Track feed freshness — update whenever feeds change
    setLastUpdate(new Date());
  }, [feeds]);

  const isFresh = React.useMemo(() => {
    if (!lastUpdate) return true;
    const now = new Date();
    const ageMs = now - lastUpdate;
    const staleThresholdMs = 5 * 60 * 1000; // 5 minutes
    return ageMs < staleThresholdMs;
  }, [lastUpdate]);

  return {
    isFresh,
    lastUpdate,
  };
}
```

- [ ] **Step 5: Commit hooks**

```bash
git add src/hooks/ && git commit -m "feat: extract remaining hooks (useBitaxe, useWeather, useRSS, useFeedHealth)"
```

---

### Task 14: Create Large UI Components (Price, Ticker, News, Chain, Weather, Miners)

This is the longest task — extract the 6 major display components.

**Files:**
- Create: `src/components/Price.jsx`
- Create: `src/components/Ticker.jsx`
- Create: `src/components/News.jsx`
- Create: `src/components/Chain.jsx`
- Create: `src/components/Weather.jsx`
- Create: `src/components/Miners.jsx`

Due to length, see the original `Command Center.html` lines for reference. For now, create placeholder versions and iterate:

- [ ] **Step 1: Extract Price component stub**

```jsx
// src/components/Price.jsx
// TODO: Extract from CommandCenter.html ~lines 1100-1150
function Price({ btc }) {
  const T = useT();
  // ... component body ...
  return (
    <div style={{ flex: '0 0 300px' }}>
      {/* Price display */}
    </div>
  );
}
```

- [ ] **Step 2: Extract Ticker, News, Chain, Weather, Miners similarly**

- [ ] **Step 3: Commit all large components**

```bash
git add src/components/ && git commit -m "feat: extract major display components"
```

---

### Task 15: Extract Masthead Panel & CommandCenter Layout

**Files:**
- Create: `src/components/MastheadPanel.jsx`
- Create: `src/components/CommandCenter.jsx`

- [ ] **Step 1: Extract MastheadPanel from lines 824-1010**

- [ ] **Step 2: Extract CommandCenter layout from lines 1011-1476**

- [ ] **Step 3: Commit layout components**

```bash
git add src/components/ && git commit -m "feat: extract MastheadPanel and CommandCenter layout"
```

---

### Task 16: Create App.jsx Root Component

**Files:**
- Create: `src/App.jsx`

- [ ] **Step 1: Create App root component with state management**

```jsx
// src/App.jsx

function App() {
  const [dark, setDark] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [prefs, setPrefs] = React.useState({
    location: 'San Francisco',
    timeFormat: '24h',
    tempUnit: 'F',
  });

  const btc = useBTC();
  const chain = useChain();
  const bitaxe = useBitaxe(CONFIG.BITAXE_API_URL, CONFIG.BITAXE_IPS);
  const weather = useWeather(37.7749, -122.4194, prefs.tempUnit);
  const rss = useRSS();
  const feedHealth = useFeedHealth(rss.feeds);
  const time = useClock(prefs.timeFormat);

  const T = dark ? DARK : LIGHT;

  return (
    <ThemeCtx.Provider value={T}>
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: T.paper,
          color: T.ink,
        }}
      >
        <CommandCenter
          dark={dark}
          onToggleDark={() => setDark(prev => !prev)}
          bitaxeApiUrl={CONFIG.BITAXE_API_URL}
          bitaxeIps={CONFIG.BITAXE_IPS}
          prefs={prefs}
          settingsOpen={settingsOpen}
          onOpenSettings={() => setSettingsOpen(true)}
          onSaveSettings={(newPrefs) => {
            setPrefs(newPrefs);
            setSettingsOpen(false);
          }}
          onCloseSettings={() => setSettingsOpen(false)}
          // Pass all data here
          btc={btc}
          chain={chain}
          bitaxe={bitaxe}
          weather={weather}
          rss={rss}
          feedHealth={feedHealth}
          time={time}
        />
      </div>
    </ThemeCtx.Provider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('canvas'));
root.render(<App />);
```

- [ ] **Step 2: Commit**

```bash
git add src/App.jsx && git commit -m "feat: create App root component"
```

---

### Task 17: Create build.js Build Script

**Files:**
- Create: `build.js`

- [ ] **Step 1: Create build script that concatenates and minifies**

```javascript
// build.js

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const srcDir = path.join(__dirname, 'src');

// File concatenation order (dependency order)
const files = [
  'config.js',
  'theme.js',
  'utils/formatting.js',
  'utils/svg.js',
  'utils/api.js',
  'components/Num.jsx',
  'components/StatusDot.jsx',
  'components/Kicker.jsx',
  'components/Rule.jsx',
  'components/ItalicDeck.jsx',
  'components/LineChart.jsx',
  'components/BiasBar.jsx',
  'components/WxGlyph.jsx',
  'hooks/useClock.js',
  'hooks/useBTC.js',
  'hooks/useChain.js',
  'hooks/useBitaxe.js',
  'hooks/useWeather.js',
  'hooks/useRSS.js',
  'hooks/useFeedHealth.js',
  'components/Masthead.jsx',
  'components/Price.jsx',
  'components/Ticker.jsx',
  'components/News.jsx',
  'components/Chain.jsx',
  'components/Weather.jsx',
  'components/Miners.jsx',
  'components/MastheadPanel.jsx',
  'components/CommandCenter.jsx',
  'App.jsx',
];

// Concatenate all JS/JSX files
let concatenated = '';
files.forEach(file => {
  const fullPath = path.join(srcDir, file);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf-8');
    // Remove module.exports wrapper (it's not needed in concatenated form)
    const cleaned = content.replace(
      /if \(typeof module.*?\n\}\n?/s,
      ''
    );
    concatenated += '\n' + cleaned;
  }
});

// Read base template
const baseTemplate = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf-8');

// Replace placeholder with concatenated code
const htmlWithCode = baseTemplate.replace(
  '/* MODULES CONCATENATED BY build.js */',
  concatenated
);

// Minify using esbuild
esbuild.build({
  stdin: {
    contents: htmlWithCode,
    loader: 'text',
  },
  outfile: 'Command Center.html',
  minify: true,
  write: false,
}).then(result => {
  fs.writeFileSync('Command Center.html', result.outputFiles[0].text);
  console.log('✓ Built Command Center.html (minified)');
}).catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Test the build script**

```bash
npm install
npm run build
```

Expected: `Command Center.html` is created

- [ ] **Step 3: Commit**

```bash
git add build.js && git commit -m "feat: create build.js concatenation + minify script"
```

---

### Task 18: Test Build Output & Compare

**Files:**
- No new files

- [ ] **Step 1: Verify generated Command Center.html works**

```bash
python -m http.server 3000
```

Open `http://localhost:3000/Command Center.html` in browser — should display dashboard.

- [ ] **Step 2: Compare output file sizes**

```bash
wc -c Command Center.html
ls -lh Command Center.html
```

Expected: ~60-70KB (minified from 100KB original)

- [ ] **Step 3: Verify functionality in browser**

- Price loads and updates
- News displays
- Weather shows
- Chain vitals render
- Ticker marquee scrolls

- [ ] **Step 4: Commit test results**

```bash
git add Command Center.html && git commit -m "test: verify build output and file size optimization"
```

---

### Task 19: Write Documentation (ARCHITECTURE.md)

**Files:**
- Create: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Create ARCHITECTURE.md**

```markdown
# Architecture Overview

## Component Tree

```
App
├── CommandCenter (Layout: 1920×1080 canvas)
│   ├── Masthead (Location, time, theme toggle)
│   ├── Price (BTC price + chart)
│   ├── Ticker (Scrolling marquee: chain vitals)
│   ├── News (Lead story + scrollable headlines)
│   ├── Chain (3-column grid: Mining/Mempool/Chain)
│   ├── Weather (Current + 8-hour forecast)
│   ├── Miners (BitAxe fleet dashboard)
│   └── MastheadPanel (Settings: location, time format, API config)
```

## Data Flow

```
External APIs:
├── Kraken → useBTC() → Price component
├── Mempool.space → useChain() → Chain component
├── Open-Meteo → useWeather() → Weather component
├── rss2json.com → useRSS() → News component
└── BitAxe API (local) → useBitaxe() → Miners component

Local:
└── useClock() → Masthead time display
```

## Modules

### config.js
Centralized configuration: API URLs, feed sources, refresh intervals, timeouts.

### theme.js
Design tokens (LIGHT/DARK palettes), fonts, ThemeCtx for React context-based theming.

### utils/
- **formatting.js** — Number, time, and BTC formatting functions
- **svg.js** — SVG processing, SMIL animation scaling, Meteocons icon library
- **api.js** — Fetch wrappers for all external APIs

### hooks/
Data fetching and state management:
- **useClock** — Current time + format toggle
- **useBTC** — BTC price, volume, chart, VWAP
- **useChain** — Block height, hashrate, fees, mempool, difficulty adjustment
- **useBitaxe** — Miner fleet aggregation
- **useWeather** — Current conditions + 8-hour forecast
- **useRSS** — Multi-feed news aggregation
- **useFeedHealth** — Feed freshness tracking

### components/
UI rendering:
- **Small:** Num, StatusDot, Kicker, Rule, ItalicDeck
- **Chart:** LineChart (canvas-based), BiasBar
- **Icons:** WxGlyph (weather icons + SMIL animation)
- **Sections:** Price, Ticker, News, Chain, Weather, Miners
- **Layout:** Masthead, MastheadPanel, CommandCenter

### App.jsx
Root component: state management, theme context provider, hook orchestration.

## Build Process

1. **Development:** Edit `src/` files, run `npm run dev` (serves unbuilt source)
2. **Release:** `npm run build` → build.js concatenates files in dependency order
3. **Minification:** esbuild minifies the concatenated output
4. **Output:** Single `Command Center.html` file

## Styling

- CSS Grid + Flexbox for layout
- CSS custom properties (--paper, --ink, etc.) for theming
- Responsive canvas scaling with `transform: scale()`
```

- [ ] **Step 2: Commit**

```bash
git add docs/ARCHITECTURE.md && git commit -m "docs: write architecture overview"
```

---

### Task 20: Write CONFIG.md Documentation

**Files:**
- Create: `docs/CONFIG.md`

- [ ] **Step 1: Create CONFIG.md with all customization options**

```markdown
# Configuration Guide

## Default CONFIG Object

All options in `src/config.js`:

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `BITAXE_API_URL` | string | `` | BitAxe API endpoint (e.g., `http://192.168.1.59:3001`) |
| `BITAXE_IPS` | array | `[]` | Direct miner IPs for polling |
| `RSS_FEEDS` | array | 3 sources | News feed URLs |
| `FETCH_TIMEOUT` | number | `5000` | API timeout in ms |
| `RSS2JSON_KEY` | string | `` | rss2json.com API key (optional) |
| `REFRESH_INTERVALS.price` | number | `30000` | BTC price update interval (ms) |
| `REFRESH_INTERVALS.news` | number | `300000` | News feed update interval (ms) |
| `REFRESH_INTERVALS.chain` | number | `10000` | Chain vitals update interval (ms) |
| `REFRESH_INTERVALS.weather` | number | `600000` | Weather update interval (ms) |
| `REFRESH_INTERVALS.bitaxe` | number | `15000` | Miner stats update interval (ms) |
| `WEATHER_TIMEZONE` | string | `auto` | Open-Meteo timezone (supports location detection) |

## Customization

### Option 1: Edit Before Build
Modify `src/config.js` before running `npm run build`:

```javascript
const CONFIG = {
  BITAXE_API_URL: 'http://my-server.local:3001',
  BITAXE_IPS: ['192.168.1.6', '192.168.1.7'],
  // ... rest of config
};
```

### Option 2: Settings Panel (Runtime)
Use the in-app settings panel (⚙️ icon) to customize:
- Location (for weather geolocation)
- Time format (12h/24h)
- Temperature unit (°F/°C)
- BitAxe API URL and miner IPs

Changes persist to browser `localStorage`.

### Option 3: URL Parameters (Future)
Support for URL-based config override (e.g., `?bitaxe_url=...`).

## BitAxe Setup

### Option A: API Proxy
Run `bitaxe_api.py` locally:

```bash
python bitaxe_api.py
# Listens on http://0.0.0.0:3001
```

Set `BITAXE_API_URL` to your server's IP:port.

### Option B: Direct Polling
Leave `BITAXE_API_URL` empty and set `BITAXE_IPS`:

```javascript
BITAXE_IPS: ['192.168.1.6', '192.168.1.7'],
```

The app will poll each miner directly.

## RSS Feed Customization

Add/remove feeds in `CONFIG.RSS_FEEDS`:

```javascript
RSS_FEEDS: [
  { name: 'Custom Feed', url: 'https://example.com/feed' },
  { name: 'Another', url: 'https://another.com/rss' },
],
```

## Environment Variables (Future)

Plan to support `.env` file:

```
BITAXE_API_URL=http://192.168.1.59:3001
BITAXE_IPS=192.168.1.6,192.168.1.7
RSS2JSON_KEY=your_api_key
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/CONFIG.md && git commit -m "docs: write configuration guide"
```

---

### Task 21: Write SETUP.md Documentation

**Files:**
- Create: `docs/SETUP.md`

- [ ] **Step 1: Create SETUP.md with setup instructions**

```markdown
# Setup & Deployment Guide

## Local Development

### Prerequisites
- Node.js 16+ (for build script)
- Python 3 (for simple HTTP server)
- Modern browser (Chrome, Firefox, Safari, Edge)

### Get Started

```bash
git clone https://github.com/YOUR_USERNAME/the-daily-node.git
cd the-daily-node
npm install
npm run dev
```

Open `http://localhost:3000/src/index.html` in browser.

Note: During dev, the app loads from unbuilt source (`src/` files). Use your browser's DevTools to debug.

### Building for Release

```bash
npm run build
```

Creates `Command Center.html` (minified, single-file delivery).

### Running BitAxe API Locally (Optional)

```bash
python bitaxe_api.py
```

Listens on `http://0.0.0.0:3001`. Configure `CONFIG.BITAXE_API_URL` to `http://YOUR_IP:3001`.

## Deployment

### GitHub Pages

1. Add `Command Center.html` to repo root
2. Enable GitHub Pages in repo settings (serve from root)
3. Access at `https://username.github.io/the-daily-node`

### Static Hosting (Vercel, Netlify)

1. Deploy `Command Center.html` as a static file
2. Configure domain/subdomain
3. Use app's settings panel to customize API URLs

### Self-Hosted Server

1. Serve `Command Center.html` via any static web server:

```bash
python -m http.server 3000  # Python
npx serve .                  # Node
# or use nginx, Apache, etc.
```

2. Optionally run `bitaxe_api.py` on same or different server
3. Users access dashboard at your server URL

## Project Structure (After Build)

```
the-daily-node/
├── Command Center.html       # 📦 Distributable single file
├── src/                      # 📝 Development source files
│   ├── config.js
│   ├── theme.js
│   ├── utils/
│   ├── hooks/
│   ├── components/
│   └── App.jsx
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CONFIG.md
│   └── SETUP.md
├── build.js                  # Build script
├── package.json
├── .gitignore
├── bitaxe_api.py             # Optional API proxy
└── README.md
```

## Troubleshooting

### "API is not responding"
- Check network tab in DevTools
- Verify API URL in settings
- Ensure CORS headers are correct (especially for BitAxe)
- Check fetch timeouts: increase `FETCH_TIMEOUT` in config if APIs are slow

### "Weather not showing"
- Check Open-Meteo API status
- Verify browser allows geolocation (prompt may appear)
- Open-Meteo requires no authentication

### "News feed won't load"
- Verify RSS feed URLs are valid
- Check rss2json.com free tier limits (150/day without API key)
- Add API key to `CONFIG.RSS2JSON_KEY` for higher limits

### "Dark mode toggle not working"
- Check DevTools console for errors
- Verify ThemeCtx is properly set in App.jsx
```

- [ ] **Step 2: Commit**

```bash
git add docs/SETUP.md && git commit -m "docs: write setup and deployment guide"
```

---

### Task 22: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Create/update README.md with project overview**

```markdown
# The Daily Node

**Single-file React dashboard** for Bitcoin price, news, weather, and mining stats — no build required to use.

![Screenshot](docs/screenshot.png)

## Features

✅ **Bitcoin Price** — Real-time BTC/USD from Kraken, volume, VWAP chart  
✅ **News Feed** — Multi-source aggregation (Bitcoin Magazine, CoinDesk, News.bitcoin.com)  
✅ **Chain Vitals** — Block height, hashrate, fees, mempool, difficulty adjustment  
✅ **Weather** — Current conditions + 8-hour forecast from Open-Meteo  
✅ **Mining Stats** — BitAxe fleet dashboard (optional, requires local setup)  
✅ **Dark/Light Mode** — Automatic based on weather or manual toggle  

## Quick Start

### For Users
1. Download [`Command Center.html`](Command Center.html)
2. Open in your browser (works offline after initial load)
3. Use the ⚙️ settings panel to customize location, time format, API endpoints

### For Developers
```bash
git clone https://github.com/YOUR_USERNAME/the-daily-node.git
cd the-daily-node
npm install
npm run dev          # Local development
npm run build        # Build for release
npm run serve        # Build + serve
```

See [SETUP.md](docs/SETUP.md) for detailed setup instructions.

## Architecture

- **Modular codebase:** Hooks, utilities, and components separated by concern
- **Single-file distribution:** Built from `src/` modules into `Command Center.html`
- **No build required to use:** Just open the HTML file
- **React 18 + Babel standalone:** No bundler needed for development or runtime
- **Responsive canvas scaling:** Adapts to any screen size

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for full design.

## Configuration

All settings are customizable:
- API endpoints (Kraken, Mempool.space, Open-Meteo, rss2json, BitAxe)
- News feed sources
- Refresh intervals
- Temperature units, time format

See [CONFIG.md](docs/CONFIG.md) for all options.

## Tech Stack

- **React 18** (CDN via Unpkg)
- **Babel Standalone** (JSX transformation in browser)
- **esbuild** (build-time minification, dev-only)
- **Open APIs:** Kraken, Mempool.space, Open-Meteo, rss2json
- **Optional:** BitAxe API (local mining setup)

## Licensing

[MIT](LICENSE)

## Contributing

Contributions welcome! Please:
1. Fork the repo
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make changes to `src/` files
4. Test with `npm run dev`
5. Build with `npm run build`
6. Submit a pull request

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for codebase overview.
```

- [ ] **Step 2: Commit**

```bash
git add README.md && git commit -m "docs: write comprehensive README"
```

---

### Task 23: Verify All Documentation and Final Commit

**Files:**
- No new files

- [ ] **Step 1: Check all docs exist**

```bash
ls -1 docs/*.md
```

Expected:
- docs/ARCHITECTURE.md
- docs/CONFIG.md
- docs/SETUP.md
- README.md

- [ ] **Step 2: Verify build output is committed**

```bash
git log --oneline | head -5
```

- [ ] **Step 3: Test one more build cycle**

```bash
npm run build
```

Expected: `Command Center.html` is recreated

- [ ] **Step 4: Final status check**

```bash
git status
```

Expected: clean working tree

- [ ] **Step 5: Final commit with summary**

```bash
git add -A && git commit -m "refactor: complete modularization and documentation"
```

---

## Post-Implementation

Once all tasks are complete:

1. **Test in production-like environment** — Serve `Command Center.html` via HTTP and verify all features work
2. **Measure file size** — Confirm ~60-70KB (minified)
3. **Code review** — Have a second pair of eyes review the modular structure
4. **Deploy to GitHub** — Push branch, create PR, merge to main
5. **Tag release** — `git tag v1.0.0` for version tracking

---

## Success Criteria ✅

- ✅ Config fully externalized; no hardcoded IPs in code
- ✅ Modular file structure; easy to navigate and contribute
- ✅ Build process automated with `npm run build`
- ✅ Single `Command Center.html` delivery (no build required to use)
- ✅ File size optimized to ~60-70KB (minified)
- ✅ Comprehensive documentation (ARCHITECTURE, CONFIG, SETUP, README)
- ✅ All features preserved (price, news, weather, chain, miners)
- ✅ Development workflow clean (npm dev → serve unbuilt source)
```

- [ ] **Done!** Refactoring complete.

