import React from 'react';
globalThis.React = React;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, cleanup } from '@testing-library/react';
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
 */
async function bootApp() {
  vi.resetModules();
  document.body.innerHTML = '<div id="stage"><div id="canvas"></div></div>';
  await act(async () => {
    await import('../../src/App.jsx');
  });
}

function setViewport(width) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
}

describe('App — bootstrap and layout routing', () => {
  beforeEach(() => {
    localStorage.clear();
    setViewport(1440);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline in tests')));
    // Hooks log fetch failures through utils/log.js, which calls console.error.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('mounts into #canvas and renders the desktop layout above the breakpoint', async () => {
    await bootApp();
    expect(document.getElementById('canvas').children.length).toBeGreaterThan(0);
    // Masthead is desktop-only chrome.
    expect(screen.getByText(/The Daily Node/i)).toBeDefined();
    // The App-level boundary did not swallow the tree.
    expect(screen.queryByText('Dashboard unavailable')).toBeNull();
  });

  it('renders the mobile layout at or below the 900px breakpoint', async () => {
    setViewport(375);
    await bootApp();
    // Tab bar is mobile-only; the desktop tree has no such buttons.
    expect(screen.getByRole('button', { name: /^miners$/i })).toBeDefined();
    expect(screen.queryByText('Dashboard unavailable')).toBeNull();
  });

  it('survives every data source failing — the whole point of the boundary', async () => {
    // fetch rejects for all five hooks; nothing should reach the App boundary.
    await bootApp();
    expect(screen.queryByText('Dashboard unavailable')).toBeNull();
    expect(document.getElementById('canvas').children.length).toBeGreaterThan(0);
  });
});

describe('App — localStorage wiring', () => {
  beforeEach(() => {
    localStorage.clear();
    setViewport(1440);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline in tests')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

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

describe('App — theme on mount', () => {
  beforeEach(() => {
    localStorage.clear();
    setViewport(1440);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline in tests')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    document.body.style.background = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('starts light by default and paints the light background', async () => {
    await bootApp();
    expect(document.documentElement.style.getPropertyValue('--paper')).toBe(LIGHT.paper);
  });

  it('starts dark when v2prefs.theme is dark', async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ version: 2, theme: 'dark' }));
    await bootApp();
    expect(document.documentElement.style.getPropertyValue('--paper')).toBe(DARK.paper);
  });
});
