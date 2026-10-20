import React from 'react';
globalThis.React = React;

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { fitRowCount, useFitRows } from '../../src/utils/fitRows.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Header 40px, rows 20px: a region of 40 + 20n holds exactly n rows.
const fit = (rows, count, extra = 0) =>
  fitRowCount({ regionPx: 40 + 20 * rows + extra, headerPx: 40, rowPx: 20, count });

describe('fitRowCount', () => {
  it('shows every row when they all fit', () => {
    expect(fit(4, 4)).toBe(4);
    expect(fit(10, 3)).toBe(3);
  });

  it('shows only the rows that fit', () => {
    expect(fit(2, 5)).toBe(2);
    expect(fit(4, 9)).toBe(4);
  });

  it('rounds partial rows down', () => {
    expect(fit(2, 5, 19)).toBe(2);
    expect(fit(2, 5, -1)).toBe(1);
  });

  it('returns 0 when not even one row fits', () => {
    expect(fit(0, 5)).toBe(0);
    expect(fit(0, 5, -30)).toBe(0);
  });

  it('falls back to every row on unusable measurements (no layout)', () => {
    const base = { headerPx: 40, rowPx: 20, count: 9 };
    expect(fitRowCount({ ...base, regionPx: 0 })).toBe(9);
    expect(fitRowCount({ ...base, regionPx: 300, rowPx: 0 })).toBe(9);
    expect(fitRowCount({ ...base, regionPx: NaN })).toBe(9);
    expect(fitRowCount({ ...base, regionPx: 300, headerPx: undefined })).toBe(9);
    expect(fitRowCount({ ...base, regionPx: 0, fallback: 2 })).toBe(2);
  });

  it('never yields more rows than fit, nor fewer than there are room for', () => {
    for (let rows = 0; rows <= 8; rows++) {
      for (let count = 0; count <= 10; count++) {
        expect(fit(rows, count), `rows=${rows} count=${count}`).toBe(Math.min(count, rows));
      }
    }
  });
});

// A region whose rows follow the useFitRows contract: the first row stays laid out
// (hidden) when none fit.
// `first` keys the first row, so changing it replaces that element (as a new alert does).
function Region({ count, first = 0 }) {
  const ref = React.useRef(null);
  const n = useFitRows(ref, count);
  return (
    <div ref={ref} data-region>
      <div>header</div>
      {Array.from({ length: count }, (_, i) => (i < Math.max(n, 1) ? (
        <div key={i === 0 ? `first-${first}` : i} data-fit-row style={{ visibility: n === 0 ? 'hidden' : 'visible' }}>row{i}</div>
      ) : null))}
    </div>
  );
}

describe('useFitRows', () => {
  // Fake layout: the region is `regionPx` tall, the header 40px, each row 20px.
  // Captures the ResizeObserver callback.
  function layout(regionPx) {
    const observers = [];
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb) { this.cb = cb; this.targets = []; observers.push(this); }
      observe(t) { this.targets.push(t); }
      unobserve(t) { this.targets = this.targets.filter(x => x !== t); }
      disconnect() { this.targets = []; }
    });
    const size = { regionPx, rowPx: 20 };
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.hasAttribute('data-fit-row')) {
        const i = [...this.parentElement.querySelectorAll('[data-fit-row]')].indexOf(this);
        return { top: 40 + size.rowPx * i, height: size.rowPx };
      }
      if (this.hasAttribute('data-region')) return { top: 0, height: size.regionPx };
      return { top: 0, height: 0 };
    });
    return { observers, size };
  }

  const shown = () => screen.queryAllByText(/^row\d+$/).filter(el => el.style.visibility !== 'hidden').length;

  it('renders as many rows as the region holds and re-measures on resize', () => {
    const { observers, size } = layout(40 + 20 * 4);
    render(<Region count={6} />);
    expect(shown()).toBe(4);

    // The squeeze an On This Day entry causes: room for 2 rows.
    size.regionPx = 40 + 20 * 2;
    const ro = observers.find(o => o.targets.some(t => t.hasAttribute?.('data-region')));
    expect(ro).toBeTruthy();
    act(() => ro.cb());
    expect(shown()).toBe(2);

    // Room for none: the first row stays in the DOM, hidden, so it can be measured again.
    size.regionPx = 40 + 10;
    act(() => ro.cb());
    expect(shown()).toBe(0);
    expect(screen.getByText('row0').style.visibility).toBe('hidden');

    size.regionPx = 40 + 20 * 3;
    act(() => ro.cb());
    expect(shown()).toBe(3);
  });

  it('re-measures when the first row changes height while the region does not (a font swap)', () => {
    const { observers, size } = layout(40 + 20 * 4);
    const { rerender } = render(<Region count={6} />);
    expect(shown()).toBe(4);
    const ro = observers.find(o => o.targets.some(t => t.hasAttribute?.('data-region')));
    const firstRow = () => screen.getByText('row0');
    expect(ro.targets).toContain(firstRow());

    // The web font swaps in: rows grow from 20 to 40px, the region stays the same.
    size.rowPx = 40;
    act(() => ro.cb());
    expect(shown()).toBe(2);

    // A new first row replaces the old element: it is observed instead.
    const old = firstRow();
    rerender(<Region count={6} first={1} />);
    expect(firstRow()).not.toBe(old);
    expect(ro.targets).toContain(firstRow());
    expect(ro.targets).not.toContain(old);
  });

  it('shows every row when nothing can be measured', () => {
    render(<Region count={5} />);
    expect(shown()).toBe(5);
  });
});
