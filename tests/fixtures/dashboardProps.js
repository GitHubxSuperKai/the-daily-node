import { vi } from 'vitest';
import { PREFS_DEFAULTS } from '../../src/utils/v2prefs.js';

/**
 * Shared dashboard prop fixtures for CommandCenter (desktop) and MobileApp.
 *
 * Both trees consume the same hook outputs from App.jsx, so they must model the
 * same shapes. Keeping two hand-rolled copies let them drift, and an invented
 * shape lets a test pass while production breaks — a wrong TYPE as readily as a
 * wrong name (a `cap` string renders "$NaNT" through `cap / 1e12`).
 *
 * Every field below is transcribed from the hook that produces it:
 *   btc     — src/hooks/useBTC.js + api.js fetchBTCPrice
 *   chain   — src/hooks/useChain.js + api.js fetchChainStats
 *   bitaxe  — src/hooks/useBitaxe.js
 *   weather — src/hooks/useWeather.js
 *   rss     — src/hooks/useRSS.js
 *   clock   — src/hooks/useClock.js
 * When a hook changes, change this file — not a copy in one suite.
 */

// useWeather builds exactly 8 slots of { hr, t, code, pop, precip }.
export const HOURLY = Array.from({ length: 8 }, (_, i) => ({
  hr: (10 + i) % 24, t: 70 + i, code: 3, pop: 0, precip: 0,
}));

export const NOW_SEC = Math.floor(Date.now() / 1000);

// useRSS sets leadStory = all[0] and items = all.slice(1, 15) — items EXCLUDES
// the lead. Overlapping them renders the same headline twice, which production
// never does. Item shape: { hed, src, pubDate, t, link, img, snippet }.
export const LEAD_STORY = {
  hed: 'Lead story', src: 'CoinDesk', pubDate: '2026-08-26T09:00:00Z', t: 'just now',
  link: 'https://example.com/lead', img: 'https://example.com/lead.jpg',
  snippet: 'Lead story snippet.', topic: '', cat: 'BTC',
};

export const NEWS_ITEMS = [
  {
    hed: 'Top story', src: 'CoinDesk', pubDate: '2026-08-26T08:55:00Z', t: '5m ago',
    link: 'https://example.com', img: null, snippet: 'Top story snippet.', topic: '', cat: 'BTC',
  },
  {
    hed: 'Second story', src: 'Bitcoin Magazine', pubDate: '2026-08-26T08:51:00Z', t: '9m ago',
    link: 'https://example.com/2', img: null, snippet: 'Second story snippet.', topic: '', cat: 'BTC',
  },
];

/** One online miner. `temp` is near-universal; `vrTemp` is optional — supply both. */
export function makeMiner(overrides = {}) {
  return {
    ip: '10.0.0.2',
    online: true,
    data: {
      hostname: 'bitaxe-01',
      hashRate: 500,        // GH/s; MinerRow divides by 1000
      power: 15,
      temp: 52,
      vrTemp: 55,
      uptimeSeconds: 86_400,
      sharesAccepted: 1200,
      sharesRejected: 3,
      powerLimit: 25,
    },
    ...overrides,
  };
}

/** The server emits offline entries with NO `data` key at all — see bitaxe_api.py. */
export function makeOfflineMiner(overrides = {}) {
  return { ip: '10.0.0.3', online: false, error: 'unreachable', ...overrides };
}

/**
 * Full prop set for a healthy dashboard. Extra keys are harmless for MobileApp,
 * which reads a subset.
 *
 * @param {object} overrides shallow-merged over the defaults
 */
export function makeProps(overrides = {}) {
  return {
    dark: false,
    onToggleDark: vi.fn(),
    prefs: { tempUnit: 'fahrenheit', timeFormat: '12h', lat: 34.05, lng: -118.24, cityName: '' },
    // Domain is 'auto' | 'light' | 'dark' (v2prefs.js, App.jsx). 'light' keeps
    // CommandCenter's auto-dark effect from firing onToggleDark mid-test.
    v2prefs: { ...PREFS_DEFAULTS, theme: 'light' },
    onSaveV2: vi.fn(),
    settingsOpen: false,
    onOpenSettings: vi.fn(),
    onSaveSettings: vi.fn(),
    onCloseSettings: vi.fn(),
    // useClock returns timeSec and dayStr — NOT `secs`/`dateLong`. Sidebar reads
    // clock.timeSec as the seconds unit and clock.dayStr as the date line.
    clock: {
      timeHM: '10:24', timeSec: ':30', amPm: 'AM',
      dayStr: 'Wednesday, August 26', dateShort: '2026-08-26',
      loading: false, error: false,
    },
    btc: {
      // fetchBTCPrice returns chgPct — NOT changePct. `cap`, `ath` and
      // `circulatingSupply` are merged in by useBTC and are NUMBERS: consumers
      // divide them (MarketsColumn does cap / 1e12).
      data: {
        price: 78408, chgAbs: -102.4, chgPct: -0.13,
        hi: 79923, lo: 77850, vwap: 78000, volBtc: 14200,
        cap: 1.56e12, ath: 109350, athDate: '2025-01-20T09:14:32.000Z',
        circulatingSupply: 19_900_000,
      },
      chartPts: [], loading: false, error: false, lastOk: Date.now(),
      refresh: vi.fn(), interval: 30000,
    },
    chain: {
      // fetchChainStats returns feeFast/feeMid/feeEco — NOT fastFee. useChain
      // enriches with mempoolMB, nextHalvingDate and circulating, and always
      // spreads the four extData arrays.
      data: {
        height: 900000, hashrate: 6e20, difficulty: 1.1e14,
        mempoolBytes: 50_000_000, mempoolTx: 18_400,
        feeFast: 30, feeMid: 18, feeEco: 5,
        diffAdj: 1.8, previousDiffAdj: -0.9, previousRetargetDate: NOW_SEC - 900_000,
        blockTimeMs: 600000, remainingBlocks: 812,
        progressPercent: 59.7, estimatedRetargetDate: (NOW_SEC + 480_000) * 1000,
        // useChain's three derived fields. All STRINGS, and all computed from
        // height 900000 by the real formatters — circulating renders verbatim in
        // the ticker, so a raw number here shows as "SUPPLY19900000".
        mempoolMB: '50.0 MB', nextHalvingDate: '2029-07-03', circulating: '19.88M BTC',
      },
      // fetchMiningPools: { name, slug, blockCount, sharePct } — sharePct is a
      // STRING from .toFixed(1).
      pools: [
        { name: 'Foundry USA', slug: 'foundryusa', blockCount: 42, sharePct: '28.8' },
        { name: 'AntPool', slug: 'antpool', blockCount: 31, sharePct: '21.2' },
      ],
      // fetchPoolBlocks returns an ARRAY of { height, timestamp, txCount }.
      topPoolBlocks: [{ height: 899_998, timestamp: NOW_SEC - 1800, txCount: 3100 }],
      // fetchRecentBlocks maps nine fields onto every entry.
      recentBlocks: [{
        height: 900000, timestamp: NOW_SEC - 300, txCount: 3421,
        size: 1_480_000, weight: 3_992_000, medianFee: 21.4,
        totalFees: 12_400_000, feeRange: [1, 84], poolName: 'Foundry USA',
      }],
      // fetchMempoolBlocks returns exactly { nTx, medianFee, feeRange }.
      mempoolBlocks: [{ nTx: 3100, medianFee: 22, feeRange: [2, 91] }],
      stale: false, loading: false, error: false, lastOk: Date.now(),
      refresh: vi.fn(), interval: 60000,
    },
    bitaxe: {
      miners: [makeMiner()],
      err: false, loading: false, lastOk: Date.now(), interval: 30000, refresh: vi.fn(),
    },
    weather: {
      // wxHum and wxWind are preformatted strings from useWeather, not numbers.
      data: {
        temp: 75, feels: 74, wxCond: 'Overcast', wxCode: 3,
        wxWindSpeed: 8, wxWind: 'NW 8 mph', wxHum: '62%',
        wxHi: 79, wxLo: 61,
        wxSunriseHr: 6, wxSunsetHr: 19,
        wxSunrise: '06:12', wxSunset: '19:44', wxSunriseTomorrow: '06:13',
        wxPrecipTotal: '0.0', wxUVIndex: 6, wxUVIndexTomorrow: 7,
        wxDailyWindMax: 14, wxGusts: 18, wxPressure: 1013, wxDewPoint: 55,
        hourly: HOURLY,
      },
      err: false, lastOk: Date.now(), interval: 900000, refresh: vi.fn(),
    },
    // leadStory is disjoint from items — see the LEAD_STORY note above.
    rss: {
      items: NEWS_ITEMS, leadStory: LEAD_STORY,
      err: false, lastOk: Date.now(), interval: 300000, refresh: vi.fn(),
    },
    // useFeedHealth returns a STRING, which App passes straight through.
    // DesktopTicker compares it with ===, so an object silently disables its
    // live-pulse branch.
    feedHealth: 'live',
    ...overrides,
  };
}

/**
 * Every source failing — the state the dashboard reaches when the APIs are down.
 * Hooks store errors as BOOLEANS and never null out the extData arrays.
 */
export function makeDownProps(overrides = {}) {
  return makeProps({
    btc: {
      data: null, chartPts: [], loading: false, error: true, lastOk: null,
      refresh: vi.fn(), interval: 30000,
    },
    chain: {
      data: null, pools: [], topPoolBlocks: [], recentBlocks: [], mempoolBlocks: [],
      stale: false, loading: false, error: true, lastOk: null,
      refresh: vi.fn(), interval: 60000,
    },
    bitaxe: { miners: [], err: true, loading: false, lastOk: null, interval: 30000, refresh: vi.fn() },
    weather: { data: null, err: true, lastOk: null, interval: 900000, refresh: vi.fn() },
    rss: { items: [], leadStory: null, err: true, lastOk: null, interval: 300000, refresh: vi.fn() },
    feedHealth: 'offline',
    ...overrides,
  });
}
