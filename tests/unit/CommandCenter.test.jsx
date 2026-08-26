import React from 'react';
globalThis.React = React;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeCtx, LIGHT, DARK } from '../../src/theme.js';
import { PREFS_DEFAULTS } from '../../src/utils/v2prefs.js';
import { CommandCenter } from '../../src/components/CommandCenter.jsx';

// CommandCenter mounts useHistory, which fetches on mount. Every test stubs it.
function stubHistoryFetch(points = []) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => points }));
}

const NOW_SEC = Math.floor(Date.now() / 1000);

const HOURLY = Array.from({ length: 8 }, (_, i) => ({
  hr: (10 + i) % 24, t: 70 + i, code: 3, pop: 0, precip: 0,
}));

// Every field below is cross-checked against what the hooks in src/hooks/ actually
// return — an invented shape lets a test pass while production breaks.
function baseProps(overrides = {}) {
  const items = [{ hed: 'Top story', link: 'https://example.com', src: 'src', t: 'just now', topic: '', cat: 'BTC' }];
  return {
    dark: false,
    onToggleDark: vi.fn(),
    prefs: { tempUnit: 'fahrenheit', timeFormat: '12h' },
    // 'light' (not 'auto') keeps the auto-dark effect from firing onToggleDark
    // mid-test. Domain is 'auto' | 'light' | 'dark' — see v2prefs.js and App.jsx.
    v2prefs: { ...PREFS_DEFAULTS, theme: 'light' },
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
        mempoolBytes: 50_000_000, feeFast: 30, feeEco: 5, blockTimeMs: 600000,
      },
      recentBlocks: [{ timestamp: NOW_SEC - 300 }],
      error: null, lastOk: Date.now(),
    },
    bitaxe: {
      miners: [{ ip: '10.0.0.2', online: true, data: { hashRate: 500, power: 15, vrTemp: 55 } }],
      err: null, loading: false, lastOk: Date.now(), interval: 30000, refresh: vi.fn(),
    },
    weather: {
      // Mirrors useWeather: 8 hourly slots of { hr, t, code, pop, precip };
      // wxHum and wxWind are preformatted strings, not numbers.
      data: {
        temp: 75, feels: 74, wxCond: 'Overcast', wxCode: 3,
        wxHi: 79, wxLo: 61, wxWind: 'NW 8 mph', wxWindSpeed: 8, wxHum: '62%',
        wxSunriseHr: 6, wxSunsetHr: 19, hourly: HOURLY,
      },
      err: null, lastOk: Date.now(), interval: 900000,
    },
    // useRSS always sets leadStory = all[0] when items exist; null-with-items never occurs.
    rss: { items, leadStory: items[0], err: null, lastOk: Date.now(), interval: 300000 },
    // useFeedHealth returns a STRING ('loading' | 'live' | 'degraded' | 'offline'),
    // which App passes straight through. An object here would silently disable
    // DesktopTicker's live-pulse branch.
    feedHealth: 'live',
    ...overrides,
  };
}

const BOUNDARIES = ['Ticker', 'Sidebar', 'Markets', 'News', 'Network'];

// A child throwing is CAUGHT by its column's ErrorBoundary, so it never propagates
// out of render() — .not.toThrow() alone would not notice. Assert on fallback text.
function expectNoBoundaryFallback() {
  for (const label of BOUNDARIES) {
    expect(screen.queryByText(`${label} unavailable`)).toBeNull();
  }
}

function renderCC(overrides = {}, theme = LIGHT) {
  const props = baseProps(overrides);
  return {
    ...render(
      <ThemeCtx.Provider value={theme}>
        <CommandCenter {...props} />
      </ThemeCtx.Provider>,
    ),
    props,
  };
}

describe('CommandCenter — desktop smoke render', () => {
  beforeEach(() => { stubHistoryFetch(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('mounts the masthead and every column with no boundary tripped', () => {
    renderCC();
    expect(screen.getByText(/The Daily Node/i)).toBeDefined();
    expectNoBoundaryFallback();
  });

  it('survives a fully degraded feed set — every source null or erroring', () => {
    // The all-APIs-down path, exercising the derived-value block (halvings,
    // blockReward, mempoolMB, the sys array) with nothing to derive from.
    expect(() => renderCC({
      btc:     { data: null, chartPts: [], error: 'down', lastOk: null },
      chain:   { data: null, recentBlocks: null, error: 'down', lastOk: null },
      bitaxe:  { miners: [], err: 'down', loading: false, lastOk: null, interval: 30000, refresh: vi.fn() },
      weather: { data: null, err: 'down', lastOk: null, interval: 900000 },
      rss:     { items: [], leadStory: null, err: 'down', lastOk: null, interval: 300000 },
      feedHealth: 'offline',
    })).not.toThrow();
    expectNoBoundaryFallback();
  });

  it('survives a chain payload with no recentBlocks', () => {
    // msSinceLastBlock derives from chain.recentBlocks[0].timestamp.
    expect(() => renderCC({
      chain: {
        data: { height: 900000, mempoolBytes: 1, feeFast: 1, feeEco: 1 },
        recentBlocks: [], error: null, lastOk: Date.now(),
      },
    })).not.toThrow();
    expectNoBoundaryFallback();
  });

  it('renders miners reporting no vrTemp, and an offline miner', () => {
    expect(() => renderCC({
      bitaxe: {
        miners: [
          { ip: '10.0.0.2', online: true, data: { hashRate: 500, power: 15 } },
          { ip: '10.0.0.3', online: false, data: null },
        ],
        err: null, loading: false, lastOk: Date.now(), interval: 30000, refresh: vi.fn(),
      },
    })).not.toThrow();
    expectNoBoundaryFallback();
  });

  it('smoke-renders the second theme path against DARK', () => {
    // Note what this does NOT do: theme tokens are only ever consumed as inline
    // style values (there are no nested T.x.y derefs anywhere in src/), so a
    // token missing from DARK yields undefined, which React silently drops —
    // no throw, no boundary. This covers the render path only.
    renderCC({ dark: true, v2prefs: { ...PREFS_DEFAULTS, theme: 'dark' } }, DARK);
    expect(screen.getByText(/The Daily Node/i)).toBeDefined();
    expectNoBoundaryFallback();
  });

  it('keeps LIGHT and DARK at identical key sets', () => {
    // THIS is the check that actually catches a token missing from one theme,
    // which the render test above cannot.
    expect(Object.keys(DARK).sort()).toEqual(Object.keys(LIGHT).sort());
  });

  it("renders a fee-spike toast from CommandCenter's own render body", () => {
    // The toast block sits in the unguarded region this suite exists to protect,
    // and is the only conditional there. Default fee threshold is 50 (v2prefs).
    renderCC({
      chain: {
        data: { height: 900000, hashrate: 6e20, difficulty: 1.1e14, mempoolBytes: 1, feeFast: 80, feeEco: 5 },
        recentBlocks: [{ timestamp: NOW_SEC - 300 }], error: null, lastOk: Date.now(),
      },
    });
    expect(screen.getByText(/Fee spike: 80 sat\/vB \(threshold: 50\)/)).toBeDefined();
    expectNoBoundaryFallback();
  });

  it('does not mount SettingsPanel when settingsOpen is false', () => {
    renderCC({ settingsOpen: false });
    // 'vtest' is the version label, rendered only inside the overlay.
    expect(screen.queryByText('vtest')).toBeNull();
    expectNoBoundaryFallback();
  });

  it('mounts SettingsPanel and surfaces the build version when settingsOpen is true', () => {
    // The only render of __VERSION__ in the app, behind an overlay a headless
    // check of the built page cannot reach. vitest.config.js defines it as 'test'.
    renderCC({ settingsOpen: true });
    expect(screen.getByText('vtest')).toBeDefined();
    expectNoBoundaryFallback();
  });
});

describe('CommandCenter — failure isolation', () => {
  let errSpy;
  beforeEach(() => {
    stubHistoryFetch();
    // React logs caught errors to console.error; silence so output stays readable.
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  // Unmock here, not at the end of each test body — a failing assertion would
  // otherwise leave the mock registry dirty for anything appended after it.
  afterEach(() => {
    vi.doUnmock('../../src/components/NewsColumn');
    vi.doUnmock('../../src/components/Masthead');
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

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
    for (const label of BOUNDARIES.filter((l) => l !== 'News')) {
      expect(screen.queryByText(`${label} unavailable`)).toBeNull();
    }
    // The boundary logged the failure against its own label.
    const tagged = errSpy.mock.calls.some((args) => args.some((a) => String(a).includes('[ErrorBoundary · News]')));
    expect(tagged).toBe(true);
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
  });
});
