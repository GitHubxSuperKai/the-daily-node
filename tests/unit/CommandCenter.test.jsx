import React from 'react';
globalThis.React = React;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeCtx, LIGHT, DARK } from '../../src/theme.js';
import { PREFS_DEFAULTS } from '../../src/utils/v2prefs.js';
import { makeProps, makeDownProps, NOW_SEC } from '../fixtures/dashboardProps.js';
import { CommandCenter } from '../../src/components/CommandCenter.jsx';

// CommandCenter mounts useHistory, which fetches on mount. Every test stubs it.
function stubHistoryFetch(points = []) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => points }));
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
  const props = makeProps(overrides);
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

  it('renders real values from the fixture, not blanks or NaN', () => {
    // Pins two fields a fixture audit caught rendering wrong: clock.dayStr was
    // absent (the date line rendered empty) and btc.data.cap was a string, so
    // `cap / 1e12` produced "$NaNT". Without these assertions both regress silently.
    const { container } = renderCC();
    expect(screen.getByText('Wednesday, August 26')).toBeDefined();
    expect(container.textContent).toContain('$1.56T');
    expect(container.textContent).not.toContain('NaN');
  });

  it('survives a fully degraded feed set — every source null or erroring', () => {
    // The all-APIs-down path, exercising the derived-value block (halvings,
    // blockReward, mempoolMB, the sys array) with nothing to derive from.
    expect(() => renderCC(makeDownProps())).not.toThrow();
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
        <CC {...makeProps()} />
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
        <CC {...makeProps()} />
      </Ctx.Provider>,
    )).toThrow(/masthead exploded/);
  });
});
