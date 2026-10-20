import React from 'react';
globalThis.React = React;

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../src/theme.js';
import { fitPoolLimit } from '../../src/utils/poolLimit.js';
import { Sidebar } from '../../src/components/Sidebar.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Header 40px, rows 20px: a region of 40 + 20n holds exactly n rows.
const fit = (rows, count, extra = 0) =>
  fitPoolLimit({ regionPx: 40 + 20 * rows + extra, headerPx: 40, rowPx: 20, count });

describe('fitPoolLimit', () => {
  it('names every pool when they all fit', () => {
    expect(fit(7, 7)).toBeNull();
    expect(fit(10, 7)).toBeNull();
    expect(fit(3, 3)).toBeNull();
  });

  it('reserves the last row that fits for Others', () => {
    // 6 rows of room, 7 pools: 5 named + Others (2) = 6 rows.
    expect(fit(6, 7)).toBe(5);
    // On This Day squeeze: 3 rows of room, 12 pools -> 2 named + Others (10).
    expect(fit(3, 12)).toBe(2);
  });

  it('rounds partial rows down', () => {
    expect(fit(6, 7, 19)).toBe(5);
    expect(fit(6, 7, -1)).toBe(4);
  });

  it('keeps one named pool when even two rows do not fit', () => {
    expect(fit(1, 7)).toBe(1);
    expect(fit(0, 7)).toBe(1);
  });

  it('falls back to 6 on unusable measurements (no layout)', () => {
    const base = { headerPx: 40, rowPx: 20, count: 9 };
    expect(fitPoolLimit({ ...base, regionPx: 0 })).toBe(6);
    expect(fitPoolLimit({ ...base, regionPx: 300, rowPx: 0 })).toBe(6);
    expect(fitPoolLimit({ ...base, regionPx: NaN })).toBe(6);
    expect(fitPoolLimit({ ...base, regionPx: 300, headerPx: undefined })).toBe(6);
  });

  // The limit is handed to MiningPools, which names `limit` pools plus Others, or all
  // of them at `limit + 1`. Whatever the room, the rows it renders must fit it.
  it('never yields more rows than fit, once two rows do', () => {
    for (let rows = 2; rows <= 12; rows++) {
      for (let count = 1; count <= 14; count++) {
        const limit = fit(rows, count);
        const rendered = limit == null || count <= limit + 1 ? count : limit + 1;
        expect(rendered, `rows=${rows} count=${count}`).toBeLessThanOrEqual(rows);
        // ...and leaves no row of room unused when there is more to show.
        expect(rendered, `rows=${rows} count=${count}`).toBe(Math.min(count, rows));
      }
    }
  });
});

describe('Sidebar pool limit', () => {
  const pools = Array.from({ length: 12 }, (_, i) => ({
    name: `Pool${i}`, slug: `p${i}`, sharePct: (8.3).toFixed(1), blockCount: 84,
  }));
  const props = {
    clock: { timeHM: '12:00', timeSec: '00', amPm: null, dayStr: 'Monday' },
    weather: {},
    prefs: { tempUnit: 'C', timeFormat: '24h' },
    sys: [],
    pools,
  };

  // Fake layout: the region (the pools list's flex wrapper) is `regionPx` tall, the
  // list's label block 40px and each row 20px. Captures the ResizeObserver callback.
  function layout(regionPx) {
    const observers = [];
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb) { this.cb = cb; this.targets = []; observers.push(this); }
      observe(t) { this.targets.push(t); }
      disconnect() {}
    });
    const size = { regionPx };
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.hasAttribute('data-pool-row')) {
        const i = [...this.parentElement.children].indexOf(this);
        return { top: 40 + 20 * i, height: 20 };
      }
      if (this.hasAttribute('data-pool-list')) return { top: 0, height: 0 };
      if (this.firstElementChild?.firstElementChild?.classList?.contains('scroll-hint')) {
        return { top: 0, height: size.regionPx };
      }
      return { top: 0, height: 0 };
    });
    return { observers, size };
  }

  const named = () => screen.queryAllByText(/^Pool\d+$/).length;

  it('names as many pools as the region holds and re-measures on resize', () => {
    const { observers, size } = layout(40 + 20 * 8);
    render(<ThemeCtx.Provider value={LIGHT}><Sidebar {...props} /></ThemeCtx.Provider>);
    expect(named()).toBe(7);
    expect(screen.getByText('Others (5)')).toBeTruthy();

    // The squeeze an On This Day entry causes: room for 3 rows.
    size.regionPx = 40 + 20 * 3;
    const ro = observers.find(o => o.targets.some(t => t.querySelector?.('[data-pool-list]')));
    expect(ro).toBeTruthy();
    expect(ro.targets.some(t => t.hasAttribute('data-pool-list'))).toBe(true);
    act(() => ro.cb());
    expect(named()).toBe(2);
    expect(screen.getByText('Others (10)')).toBeTruthy();
  });

  it('keeps the top 6 plus Others when nothing can be measured', () => {
    render(<ThemeCtx.Provider value={LIGHT}><Sidebar {...props} /></ThemeCtx.Provider>);
    expect(named()).toBe(6);
    expect(screen.getByText('Others (6)')).toBeTruthy();
  });
});
