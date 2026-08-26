import React from 'react';
globalThis.React = React;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../src/theme.js';
import { PREFS_DEFAULTS } from '../../src/utils/v2prefs.js';
import { CommandCenter } from '../../src/components/CommandCenter.jsx';

// CommandCenter mounts useHistory, which fetches on mount. Every test stubs it.
function stubHistoryFetch() {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
}

const NOW_SEC = Math.floor(Date.now() / 1000);

const HOURLY = Array.from({ length: 8 }, (_, i) => ({
  hr: (10 + i) % 24, t: 70 + i, code: 3, pop: 0, precip: 0,
}));

// A fully-populated prop set — the "everything is working" path.
function baseProps(overrides = {}) {
  return {
    dark: false,
    onToggleDark: vi.fn(),
    prefs: { tempUnit: 'fahrenheit', timeFormat: '12h' },
    // theme 'manual' keeps the auto-dark effect from firing onToggleDark mid-test
    v2prefs: { ...PREFS_DEFAULTS, theme: 'manual' },
    onSaveV2: vi.fn(),
    settingsOpen: false,
    onOpenSettings: vi.fn(),
    onSaveSettings: vi.fn(),
    onCloseSettings: vi.fn(),
    clock: { timeHM: '10:24', amPm: 'AM', dateLong: 'Wednesday, August 26', secs: '30' },
    btc: {
      data: { price: 78408, chgPct: -0.13, hi: 79923, lo: 77850, cap: '1.5T', vwap: 78000 },
      chartPts: [], error: null, lastOk: Date.now(),
    },
    chain: {
      data: {
        height: 900000, hashrate: 6e20, difficulty: 1.1e14,
        mempoolBytes: 50_000_000, feeFast: 30, fastFee: 30, blockTimeMs: 600000,
      },
      recentBlocks: [{ timestamp: NOW_SEC - 300 }],
      error: null, lastOk: Date.now(),
    },
    bitaxe: {
      miners: [{ ip: '10.0.0.2', online: true, data: { hashRate: 500, power: 15, vrTemp: 55 } }],
      err: null, loading: false, lastOk: Date.now(), interval: 30000, refresh: vi.fn(),
    },
    weather: {
      // Shape mirrors useWeather's output: 8 hourly slots of { hr, t, code, pop, precip }.
      data: {
        temp: 75, feels: 74, wxCond: 'Overcast', wxCode: 3,
        wxHi: 79, wxLo: 61, wxWind: 'NW', wxWindSpeed: 8, wxHum: 62,
        wxSunriseHr: 6, wxSunsetHr: 19,
        hourly: HOURLY,
      },
      err: null, lastOk: Date.now(), interval: 900000,
    },
    rss: {
      items: [{ hed: 'Top story', link: 'https://example.com', src: 'src', t: 'just now', topic: '', cat: 'BTC' }],
      leadStory: null, err: null, lastOk: Date.now(), interval: 300000,
    },
    feedHealth: { sources: [] },
    ...overrides,
  };
}

function renderCC(overrides = {}) {
  const props = baseProps(overrides);
  return {
    ...render(
      <ThemeCtx.Provider value={LIGHT}>
        <CommandCenter {...props} />
      </ThemeCtx.Provider>,
    ),
    props,
  };
}

describe('CommandCenter — desktop smoke render', () => {
  beforeEach(() => { stubHistoryFetch(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('mounts and renders the masthead and all four columns', () => {
    const { container } = renderCC();
    // Masthead
    expect(screen.getByText(/The Daily Node/i)).toBeDefined();
    // No column fell back to its ErrorBoundary
    expect(screen.queryByText(/unavailable$/)).toBeNull();
    expect(container.firstChild).not.toBeNull();
  });

  it('renders every column without tripping an ErrorBoundary', () => {
    renderCC();
    for (const label of ['Ticker', 'Sidebar', 'Markets', 'News', 'Network']) {
      expect(screen.queryByText(`${label} unavailable`)).toBeNull();
    }
  });

  it('survives a fully degraded feed set — every source null or empty', () => {
    // The all-APIs-down path. A throw here blanks the whole dashboard, because
    // CommandCenter's own render body sits outside every per-column boundary.
    expect(() => renderCC({
      btc:     { data: null, chartPts: [], error: 'down', lastOk: null },
      chain:   { data: null, recentBlocks: null, error: 'down', lastOk: null },
      bitaxe:  { miners: [], err: 'down', loading: false, lastOk: null, interval: 30000, refresh: vi.fn() },
      weather: { data: null, err: 'down', lastOk: null, interval: 900000 },
      rss:     { items: [], leadStory: null, err: 'down', lastOk: null, interval: 300000 },
    })).not.toThrow();
  });

  it('survives a chain payload with no recentBlocks', () => {
    // msSinceLastBlock derives from chain.recentBlocks[0].timestamp via optional chaining.
    expect(() => renderCC({
      chain: { data: { height: 900000, mempoolBytes: 1, feeFast: 1 }, recentBlocks: [], error: null, lastOk: Date.now() },
    })).not.toThrow();
  });

  it('renders miners that report no vrTemp without throwing', () => {
    expect(() => renderCC({
      bitaxe: {
        miners: [
          { ip: '10.0.0.2', online: true, data: { hashRate: 500, power: 15 } },
          { ip: '10.0.0.3', online: false, data: null },
        ],
        err: null, loading: false, lastOk: Date.now(), interval: 30000, refresh: vi.fn(),
      },
    })).not.toThrow();
  });

  it('does not mount SettingsPanel when settingsOpen is false', () => {
    renderCC({ settingsOpen: false });
    // 'vtest' is the version label, rendered only inside the overlay.
    expect(screen.queryByText('vtest')).toBeNull();
  });

  it('mounts SettingsPanel and surfaces the build version when settingsOpen is true', () => {
    // The version label is the only render of __VERSION__ in the app, and it lives
    // behind this overlay — which is why a headless check of the built page misses it.
    // vitest.config.js defines __VERSION__ as 'test'.
    renderCC({ settingsOpen: true });
    expect(screen.getByText('vtest')).toBeDefined();
  });
});

describe('CommandCenter — failure isolation', () => {
  let errSpy;
  beforeEach(() => {
    stubHistoryFetch();
    // React logs caught errors to console.error; silence so output stays readable.
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('contains a throwing column in its own boundary, leaving siblings rendered', async () => {
    vi.resetModules();
    vi.doMock('../../src/components/NewsColumn', () => ({
      NewsColumn: () => { throw new Error('news exploded'); },
    }));
    // resetModules gives a SECOND theme.js instance, so the outer ThemeCtx no
    // longer matches the one the fresh components consume. Pull both from the
    // same fresh graph or every child throws on an undefined theme.
    const { ThemeCtx: Ctx, LIGHT: L } = await import('../../src/theme.js');
    const { CommandCenter: CC } = await import('../../src/components/CommandCenter.jsx');
    render(
      <Ctx.Provider value={L}>
        <CC {...baseProps()} />
      </Ctx.Provider>,
    );
    // The News boundary caught it...
    expect(screen.getByText('News unavailable')).toBeDefined();
    // ...and nothing else did.
    expect(screen.getByText(/The Daily Node/i)).toBeDefined();
    for (const label of ['Ticker', 'Sidebar', 'Markets', 'Network']) {
      expect(screen.queryByText(`${label} unavailable`)).toBeNull();
    }
    vi.doUnmock('../../src/components/NewsColumn');
  });

  it('does NOT contain a throwing Masthead — it is outside every boundary', async () => {
    // Documents a real gap rather than asserting it is fine: Masthead and
    // CommandCenter's own render body have no boundary between them and App.
    // A throw here escapes CommandCenter entirely and only the App-level
    // catch-all stops it, blanking the dashboard. If someone later wraps
    // Masthead in an ErrorBoundary, this test SHOULD fail — update it then.
    vi.resetModules();
    vi.doMock('../../src/components/Masthead', () => ({
      Masthead: () => { throw new Error('masthead exploded'); },
    }));
    const { ThemeCtx: Ctx, LIGHT: L } = await import('../../src/theme.js');
    const { CommandCenter: CC } = await import('../../src/components/CommandCenter.jsx');
    expect(() => render(
      <Ctx.Provider value={L}>
        <CC {...baseProps()} />
      </Ctx.Provider>,
    )).toThrow(/masthead exploded/);
    vi.doUnmock('../../src/components/Masthead');
  });
});
