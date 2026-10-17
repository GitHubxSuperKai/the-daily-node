import React from 'react';
globalThis.React = React;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, cleanup, fireEvent } from '@testing-library/react';
import { LIGHT, DARK } from '../../src/theme.js';
import { PREFS_KEY } from '../../src/utils/v2prefs.js';

/**
 * App.jsx exports nothing — it self-bootstraps at module scope with
 *   ReactDOM.createRoot(document.getElementById('canvas')).render(<App />)
 * so the only way to exercise it is through that real path: create the mount
 * node, stub the network, then import the module. That has the side benefit of
 * covering the bootstrap itself, including the #canvas mount target.
 *
 * Every hook fetches on mount. The stub rejects, so each lands in its error
 * state and the dashboard renders degraded — deterministic, and it exercises
 * the null-data paths through both layouts.
 *
 * NOTE: the act() flush works because vi.resetModules() does NOT reset
 * node_modules/react — it stays externalized, so RTL's act and App's renderer
 * share one React instance. If React were ever inlined via server.deps.inline,
 * act would silently stop flushing. expectNoActWarnings() is the guard.
 */

let rootRef = null;
let consoleErrors = [];

// Hooks log fetch failures through utils/log.js -> console.error, which would
// drown the output. Swallow only those; let everything else through so a React
// "not wrapped in act(...)" warning cannot pass unnoticed.
function silenceExpectedLogs() {
  consoleErrors = [];
  const real = console.error;
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    consoleErrors.push(args.map(String).join(' '));
    if (String(args[0] ?? '').startsWith('[DN]')) return;
    real(...args);
  });
}

function expectNoActWarnings() {
  expect(consoleErrors.filter((m) => /not wrapped in act/i.test(m))).toEqual([]);
}

async function bootApp() {
  vi.resetModules();
  document.body.innerHTML = '<div id="stage"><div id="canvas"></div></div>';
  // Capture the root App creates for itself so it can be unmounted afterwards.
  // RTL's cleanup() only knows about roots IT created, so without this every
  // boot leaves a mounted tree with live intervals against detached DOM.
  // doMock, not spyOn: an ESM module namespace is not configurable. App.jsx
  // uses the DEFAULT import (ReactDOM.createRoot), so wrap that too.
  vi.doMock('react-dom/client', async (importOriginal) => {
    const actual = await importOriginal();
    const base = actual.default ?? actual;
    const wrapped = (el) => { rootRef = base.createRoot(el); return rootRef; };
    return { ...actual, createRoot: wrapped, default: { ...base, createRoot: wrapped } };
  });
  await act(async () => {
    await import('../../src/App.jsx');
  });
  // If doMock ever stopped intercepting, rootRef would stay null and afterEach
  // would silently skip the unmount — failing loudly beats a rotting safety net.
  expect(rootRef).not.toBeNull();
}

// jsdom normalizes an inline style color to rgb(), while theme tokens are hex.
// Custom properties (--paper) are stored verbatim, so only body.style needs this.
function toRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

function setViewport(width) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
}

beforeEach(() => {
  localStorage.clear();
  setViewport(1440);
  rootRef = null;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline in tests')));
  silenceExpectedLogs();
});

afterEach(async () => {
  if (rootRef) {
    await act(async () => rootRef.unmount());
    rootRef = null;
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  cleanup();
  document.body.innerHTML = '';
  document.body.style.background = '';
  document.documentElement.style.removeProperty('--paper');
  vi.doUnmock('react-dom/client');
  vi.doUnmock('../../src/hooks/useChain.js');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('App — bootstrap and layout routing', () => {
  it('mounts into #canvas and renders the DESKTOP tree above the breakpoint', async () => {
    await bootApp();
    expect(document.getElementById('canvas').children.length).toBeGreaterThan(0);
    // "The Daily Node" is NOT a discriminator — mobile/MobileHeader renders it
    // too, so asserting on it would pass even if routing were inverted. The
    // masthead settings button is desktop-only chrome.
    expect(screen.getByRole('button', { name: /settings/i })).toBeDefined();
    // ...and the mobile tab bar must be absent.
    expect(screen.queryByRole('button', { name: /^miners$/i })).toBeNull();
    expect(screen.queryByText('Dashboard unavailable')).toBeNull();
    expectNoActWarnings();
  });

  it('renders the MOBILE tree at exactly the 900px breakpoint', async () => {
    // useViewportMode compares with <=, so 900 is the boundary worth pinning.
    setViewport(900);
    await bootApp();
    expect(screen.getByRole('button', { name: /^miners$/i })).toBeDefined();
    expect(screen.queryByText('Dashboard unavailable')).toBeNull();
    expectNoActWarnings();
  });

  it('stays on the desktop tree one pixel above the breakpoint', async () => {
    setViewport(901);
    await bootApp();
    expect(screen.queryByRole('button', { name: /^miners$/i })).toBeNull();
  });

  it('survives every data source failing — the whole point of the boundary', async () => {
    // fetch rejects for all five hooks; nothing should reach the App boundary.
    await bootApp();
    expect(screen.queryByText('Dashboard unavailable')).toBeNull();
    expect(document.getElementById('canvas').children.length).toBeGreaterThan(0);
  });
});

describe('App — localStorage wiring', () => {
  it('runs the one-time bitaxe migration and marks it done', async () => {
    localStorage.setItem('dailynode-bitaxe', '["10.0.0.9"]');
    await bootApp();
    expect(localStorage.getItem('dailynode-bitaxe')).toBeNull();
    expect(localStorage.getItem('dailynode-bitaxe-migrated')).toBe('1');
  });

  it('does not re-run the migration once the marker is set', async () => {
    // A key written back AFTER migration must survive — proving the guard holds.
    localStorage.setItem('dailynode-bitaxe-migrated', '1');
    localStorage.setItem('dailynode-bitaxe', 'written-after-migration');
    await bootApp();
    expect(localStorage.getItem('dailynode-bitaxe')).toBe('written-after-migration');
  });

  it('reads saved user prefs on mount and threads them into useWeather', async () => {
    localStorage.setItem('dailynode-prefs', JSON.stringify({
      lat: 51.5, lng: -0.12, cityName: 'London', timeFormat: '24h', tempUnit: 'celsius',
    }));
    await bootApp();
    // Assert on the request URL rather than rendered output: with fetch rejecting
    // there is no weather card to read a unit off, but the URL proves the saved
    // prefs reached the hook instead of CONFIG's defaults.
    const urls = global.fetch.mock.calls.map(([u]) => String(u));
    const wx = urls.find((u) => u.includes('open-meteo'));
    expect(wx).toBeDefined();
    expect(wx).toContain('latitude=51.5');
    expect(wx).toContain('longitude=-0.12');
    expect(wx).toContain('temperature_unit=celsius');
  });

  it('tolerates corrupt prefs JSON rather than blanking the dashboard', async () => {
    localStorage.setItem('dailynode-prefs', '{not valid json');
    await bootApp();
    expect(screen.getByText(/The Daily Node/i)).toBeDefined();
    expect(screen.queryByText('Dashboard unavailable')).toBeNull();
  });
});

describe('App — chart range wiring', () => {
  const ohlcUrls = () =>
    global.fetch.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('/0/public/OHLC'));

  it('stored range 7d fetches Kraken interval 60', async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ version: 2, chart: { range: '7d' } }));
    await bootApp();
    const urls = ohlcUrls();
    expect(urls.some((u) => u.includes('interval=60'))).toBe(true);
    expect(urls.some((u) => u.includes('interval=5'))).toBe(false);
  });

  it('clicking 7D saves the range, keeps stored prefs, and refetches Kraken at interval 60', async () => {
    // Spy on what App hands useChain: a range save rebuilds v2prefs, but the
    // mempool object must keep its identity or useChain's effect would re-fire.
    const mempoolArgs = [];
    vi.doMock('../../src/hooks/useChain.js', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, useChain: (m) => { mempoolArgs.push(m); return actual.useChain(m); } };
    });
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      version: 2,
      alerts: { fee: { enabled: true, threshold: 77, cooldownMin: 30 } },
      mempool: { baseUrl: 'https://mempool.example.test', fallbackToPublic: false },
    }));
    await bootApp();
    expect(ohlcUrls().some((u) => u.includes('interval=5'))).toBe(true);
    expect(ohlcUrls().some((u) => u.includes('interval=60'))).toBe(false);
    const before = mempoolArgs[mempoolArgs.length - 1];
    expect(before).toEqual({ baseUrl: 'https://mempool.example.test', fallbackToPublic: false });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '7D' })); });

    const saved = JSON.parse(localStorage.getItem(PREFS_KEY));
    expect(saved.chart.range).toBe('7d');
    expect(saved.alerts.fee.threshold).toBe(77);
    expect(saved.mempool).toEqual(before);
    expect(ohlcUrls().some((u) => u.includes('interval=60'))).toBe(true);
    // Same reference, not just equal: withRange spreads, it does not clone nested prefs.
    expect(mempoolArgs[mempoolArgs.length - 1]).toBe(before);
  });

  it('bogus stored range falls back to 24h', async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ version: 2, chart: { range: 'bogus' } }));
    await bootApp();
    const urls = ohlcUrls();
    expect(urls.some((u) => u.includes('interval=5'))).toBe(true);
    expect(urls.some((u) => u.includes('interval=60'))).toBe(false);
  });
});

describe('App — theme on mount', () => {
  it('starts light by default', async () => {
    await bootApp();
    expect(document.documentElement.style.getPropertyValue('--paper')).toBe(LIGHT.paper);
    expect(document.body.style.background).toBe(toRgb(LIGHT.paper));
  });

  it('starts dark when v2prefs.theme is dark', async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ version: 2, theme: 'dark' }));
    await bootApp();
    expect(document.documentElement.style.getPropertyValue('--paper')).toBe(DARK.paper);
    expect(document.body.style.background).toBe(toRgb(DARK.paper));
  });
});
