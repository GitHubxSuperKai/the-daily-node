import { vi } from 'vitest';
import { PREFS_DEFAULTS } from '../../src/utils/v2prefs.js';

/**
 * Shared dashboard prop fixtures for CommandCenter (desktop) and MobileApp.
 *
 * Both trees consume the same hook outputs from App.jsx, so they must model the
 * same shapes. Keeping two hand-rolled copies let them drift: the mobile suite
 * carried `feedHealth: { sources: [] }`, `btc.data.changePct`, and
 * `chain.data.fastFee` — none of which any hook produces. An invented shape
 * lets a test pass while production breaks, so every field here is
 * cross-checked against src/hooks/ and noted where it is easy to get wrong.
 */

// useWeather builds exactly 8 slots of { hr, t, code, pop, precip }.
export const HOURLY = Array.from({ length: 8 }, (_, i) => ({
  hr: (10 + i) % 24, t: 70 + i, code: 3, pop: 0, precip: 0,
}));

export const NOW_SEC = Math.floor(Date.now() / 1000);

// useRSS sets leadStory = all[0] and items = all.slice(1, 15) — items EXCLUDES
// the lead. Overlapping them renders the same headline twice, which production
// never does.
export const LEAD_STORY = {
  hed: 'Lead story', link: 'https://example.com/lead', src: 'src', t: 'just now',
  topic: '', cat: 'BTC', snippet: 'Lead story snippet.',
};

export const NEWS_ITEMS = [
  { hed: 'Top story', link: 'https://example.com', src: 'src', t: '5m ago', topic: '', cat: 'BTC' },
  { hed: 'Second story', link: 'https://example.com/2', src: 'src', t: '9m ago', topic: '', cat: 'BTC' },
];

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
    clock: { timeHM: '10:24', amPm: 'AM', dateLong: 'Wednesday, August 26', secs: '30' },
    // useBTC returns chgPct — NOT changePct.
    btc: {
      data: { price: 78408, chgPct: -0.13, hi: 79923, lo: 77850, cap: '1.5T', vwap: 78000 },
      chartPts: [], error: null, lastOk: Date.now(), refresh: vi.fn(),
    },
    // useChain returns feeFast / feeEco — NOT fastFee. `fastFee` exists only as a
    // key of the triggers object CommandCenter hands to useAlerts.
    chain: {
      data: {
        height: 900000, hashrate: 6e20, difficulty: 1.1e14,
        mempoolBytes: 50_000_000, feeFast: 30, feeEco: 5, blockTimeMs: 600000,
      },
      recentBlocks: [{ timestamp: NOW_SEC - 300 }],
      error: null, lastOk: Date.now(), refresh: vi.fn(),
    },
    bitaxe: {
      miners: [{ ip: '10.0.0.2', online: true, data: { hashRate: 500, power: 15, vrTemp: 55 } }],
      err: null, loading: false, lastOk: Date.now(), interval: 30000, refresh: vi.fn(),
    },
    // wxHum and wxWind are preformatted strings from useWeather, not numbers.
    weather: {
      data: {
        temp: 75, feels: 74, wxCond: 'Overcast', wxCode: 3,
        wxHi: 79, wxLo: 61, wxWind: 'NW 8 mph', wxWindSpeed: 8, wxHum: '62%',
        wxSunriseHr: 6, wxSunsetHr: 19, hourly: HOURLY,
      },
      err: null, lastOk: Date.now(), interval: 900000, refresh: vi.fn(),
    },
    // leadStory is disjoint from items — see the LEAD_STORY note above.
    rss: {
      items: NEWS_ITEMS, leadStory: LEAD_STORY,
      err: null, lastOk: Date.now(), interval: 300000, refresh: vi.fn(),
    },
    // useFeedHealth returns a STRING, which App passes straight through.
    // DesktopTicker compares it with ===, so an object silently disables its
    // live-pulse branch.
    feedHealth: 'live',
    ...overrides,
  };
}

/** Every source null or erroring — the state the dashboard reaches when the APIs are down. */
export function makeDownProps(overrides = {}) {
  return makeProps({
    btc:     { data: null, chartPts: [], error: 'down', lastOk: null, refresh: vi.fn() },
    chain:   { data: null, recentBlocks: null, error: 'down', lastOk: null, refresh: vi.fn() },
    bitaxe:  { miners: [], err: 'down', loading: false, lastOk: null, interval: 30000, refresh: vi.fn() },
    weather: { data: null, err: 'down', lastOk: null, interval: 900000, refresh: vi.fn() },
    rss:     { items: [], leadStory: null, err: 'down', lastOk: null, interval: 300000, refresh: vi.fn() },
    feedHealth: 'offline',
    ...overrides,
  });
}
