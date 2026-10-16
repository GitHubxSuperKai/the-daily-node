import React from 'react';
globalThis.React = React;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../src/theme.js';
import LineChart from '../../src/components/LineChart.jsx';
import { fmtChipTime } from '../../src/utils/chartSeries.js';

const W = 600;
const H = 100;
const MIN = 60000;
const T0 = new Date(2026, 9, 16, 8, 0).getTime();
const RECT = { left: 0, top: 0, width: W, height: H, right: W, bottom: H };

const origRO = global.ResizeObserver;

beforeEach(() => {
  global.ResizeObserver = class {
    constructor(cb) { this._cb = cb; }
    observe() { this._cb([{ contentRect: { width: W, height: H } }]); }
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  global.ResizeObserver = origRO;
});

function mount(props) {
  const ui = (p) => (
    <ThemeCtx.Provider value={LIGHT}>
      <LineChart {...p} />
    </ThemeCtx.Provider>
  );
  const utils = render(ui(props));
  const box = utils.container.firstChild;
  box.getBoundingClientRect = () => RECT;
  return {
    ...utils,
    box,
    rerenderChart: (p) => utils.rerender(ui(p)),
  };
}

// Five evenly spaced points: x = 0, 150, 300, 450, 600.
const even = [0, 1, 2, 3, 4].map(i => [T0 + i * MIN, 100 + i * 10]);

const linePath = (container) => container.querySelector('path[fill="none"]');
const parsePath = (d) => d.split(/[ML]/).filter(Boolean).map(s => s.split(',').map(Number));
const q = (container, id) => container.querySelector(`[data-testid="${id}"]`);
const move = (el, clientX, pointerType = 'mouse') =>
  fireEvent.pointerMove(el, { clientX, pointerType });

describe('LineChart time positioning', () => {
  it('positions points by time, not index', () => {
    const { container } = mount({
      points: [[T0, 100], [T0 + MIN, 110], [T0 + 60 * MIN, 120]],
    });
    const p = parsePath(linePath(container).getAttribute('d'));
    expect(p).toHaveLength(3);
    expect(p[0][0]).toBeCloseTo(0, 1);
    expect(p[1][0]).toBeCloseTo(10, 1);
    expect(p[2][0]).toBeCloseTo(600, 1);
  });

  it('merges desktop series by time', () => {
    const historyPoints = [];
    for (let i = 0; i <= 60; i++) historyPoints.push({ ts: T0 / 1000 + i * 60, usd: 100 });
    const points = [[T0 + 30 * MIN, 500], [T0 + 90 * MIN, 100]];
    const { container } = mount({ historyPoints, points });
    const p = parsePath(linePath(container).getAttribute('d'));
    expect(p).toHaveLength(62);
    // price 500 would be the max and sit at the top clamp (y = 4); everything is 100 here.
    expect(p.some(([, y]) => y === 4)).toBe(false);
    expect(p[p.length - 1][0]).toBeCloseTo(600, 1);
    expect(p[60][0]).toBeCloseTo(400, 1);
  });
});

describe('LineChart hover', () => {
  it('hover snaps and reports the nearest point', () => {
    const onHover = vi.fn();
    const { box, container } = mount({ points: even, onHover });
    move(box, 300);
    expect(onHover).toHaveBeenCalledTimes(1);
    expect(onHover).toHaveBeenCalledWith({ t: even[2][0], price: even[2][1] });
    expect(q(container, 'chart-crosshair')).not.toBeNull();
    expect(q(container, 'chart-hover-dot')).not.toBeNull();
  });

  it('hover dot carries data-t', () => {
    const { box, container } = mount({ points: even });
    move(box, 300);
    expect(q(container, 'chart-hover-dot').getAttribute('data-t')).toBe(String(even[2][0]));
  });

  it('onHover fires only when the snapped point changes', () => {
    const onHover = vi.fn();
    const { box } = mount({ points: even, onHover });
    move(box, 300);
    move(box, 310);
    expect(onHover).toHaveBeenCalledTimes(1);
  });

  it('mouse leave clears', () => {
    const onHover = vi.fn();
    const { box, container } = mount({ points: even, onHover });
    move(box, 300);
    fireEvent.pointerLeave(box, { pointerType: 'mouse' });
    expect(onHover).toHaveBeenLastCalledWith(null);
    expect(q(container, 'chart-crosshair')).toBeNull();
  });

  it('touch lift clears', () => {
    const onHover = vi.fn();
    const { box, container } = mount({ points: even, onHover });
    fireEvent.pointerDown(box, { clientX: 150, pointerType: 'touch' });
    move(box, 300, 'touch');
    expect(onHover).toHaveBeenLastCalledWith({ t: even[2][0], price: even[2][1] });
    fireEvent.pointerUp(box, { clientX: 300, pointerType: 'touch' });
    expect(onHover).toHaveBeenLastCalledWith(null);
    expect(q(container, 'chart-crosshair')).toBeNull();
  });

  it('touch move without a prior pointerdown does not scrub', () => {
    const onHover = vi.fn();
    const { box } = mount({ points: even, onHover });
    move(box, 300, 'touch');
    expect(onHover).not.toHaveBeenCalled();
  });

  it('pointercancel clears', () => {
    const onHover = vi.fn();
    const { box, container } = mount({ points: even, onHover });
    fireEvent.pointerDown(box, { clientX: 300, pointerType: 'touch' });
    fireEvent.pointerCancel(box, { pointerType: 'touch' });
    expect(onHover).toHaveBeenLastCalledWith(null);
    expect(q(container, 'chart-crosshair')).toBeNull();
  });

  it('mouse pointerup keeps the readout', () => {
    const onHover = vi.fn();
    const { box, container } = mount({ points: even, onHover });
    move(box, 300);
    fireEvent.pointerUp(box, { clientX: 300, pointerType: 'mouse' });
    expect(onHover).not.toHaveBeenCalledWith(null);
    expect(q(container, 'chart-crosshair')).not.toBeNull();
  });

  it('clamps pointer beyond edges to first/last point', () => {
    const onHover = vi.fn();
    const { box } = mount({ points: even, onHover });
    move(box, -50);
    expect(onHover).toHaveBeenLastCalledWith({ t: even[0][0], price: even[0][1] });
    move(box, 900);
    expect(onHover).toHaveBeenLastCalledWith({ t: even[4][0], price: even[4][1] });
  });

  it('clears hover when the series changes', () => {
    const onHover = vi.fn();
    const { box, container, rerenderChart } = mount({ points: even, onHover });
    move(box, 300);
    onHover.mockClear();
    rerenderChart({ points: even.map(p => [p[0], p[1] + 1]), onHover });
    expect(onHover).toHaveBeenCalledWith(null);
    expect(q(container, 'chart-crosshair')).toBeNull();
  });

  it('shrinking series while hovering does not throw', () => {
    const onHover = vi.fn();
    const historyPoints = [];
    for (let i = 0; i < 1440; i++) historyPoints.push({ ts: T0 / 1000 + i * 60, usd: 100 + (i % 7) });
    const { box, container, rerenderChart } = mount({ historyPoints, onHover });
    move(box, 595);
    expect(q(container, 'chart-crosshair')).not.toBeNull();
    onHover.mockClear();
    const small = Array.from({ length: 25 }, (_, i) => [T0 + i * MIN, 100 + i]);
    expect(() => rerenderChart({ historyPoints: [], points: small, onHover })).not.toThrow();
    expect(q(container, 'chart-crosshair')).toBeNull();
    expect(onHover).toHaveBeenCalledWith(null);
  });

  it('hover survives a new onHover identity', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { box, container, rerenderChart } = mount({ points: even, onHover: first });
    move(box, 300);
    rerenderChart({ points: even, onHover: second });
    expect(q(container, 'chart-crosshair')).not.toBeNull();
    expect(first).not.toHaveBeenCalledWith(null);
    expect(second).not.toHaveBeenCalled();
    fireEvent.pointerLeave(box, { pointerType: 'mouse' });
    expect(second).toHaveBeenCalledWith(null);
  });

  it('works without onHover', () => {
    const { box, container } = mount({ points: even });
    expect(() => move(box, 300)).not.toThrow();
    expect(q(container, 'chart-crosshair')).not.toBeNull();
  });
});

describe('LineChart degenerate series', () => {
  it('no crosshair for a single-point series', () => {
    const onHover = vi.fn();
    const { box, container } = mount({ points: [[T0, 100]], onHover });
    move(box, 300);
    expect(q(container, 'chart-crosshair')).toBeNull();
    expect(onHover).not.toHaveBeenCalled();
    container.querySelectorAll('path').forEach(p => expect(p.getAttribute('d')).not.toMatch(/NaN/));
  });

  it('no crosshair on the placeholder line', () => {
    const onHover = vi.fn();
    const { box, container } = mount({ points: null, onHover });
    move(box, 300);
    expect(q(container, 'chart-crosshair')).toBeNull();
    expect(onHover).not.toHaveBeenCalled();
    container.querySelectorAll('path').forEach(p => expect(p.getAttribute('d')).not.toMatch(/NaN/));
  });
});

describe('LineChart labels and chip', () => {
  it('hi/lo labels anchor by x position', () => {
    // Far-right max, far-left min.
    const a = mount({ points: even, showLabels: true });
    const [maxA, minA] = a.container.querySelectorAll('text');
    expect(maxA.getAttribute('text-anchor')).toBe('end');
    expect(minA.getAttribute('text-anchor')).toBe('start');
    a.unmount();

    // Uneven spacing: the max is index 4 of 6 (right half by index) but sits at
    // x ~ 0 by time, so it must anchor 'start'.
    const uneven = [
      [T0, 50], [T0 + MIN, 100], [T0 + 2 * MIN, 100],
      [T0 + 3 * MIN, 100], [T0 + 4 * MIN, 200], [T0 + 1000 * MIN, 150],
    ];
    const b = mount({ points: uneven, showLabels: true });
    const [maxB] = b.container.querySelectorAll('text');
    expect(maxB.getAttribute('text-anchor')).toBe('start');
  });

  it('time chip shows fmtChipTime of the hovered point', () => {
    const { box, container } = mount({ points: even });
    move(box, 300);
    const chip = q(container, 'chart-chip');
    expect(chip.querySelector('text').textContent).toBe(fmtChipTime(even[2][0]));
  });

  it('chip stays within the chart at both edges', () => {
    const { box, container } = mount({ points: even });
    [0, 600].forEach((x) => {
      move(box, x);
      const rect = q(container, 'chart-chip').querySelector('rect');
      const rx = parseFloat(rect.getAttribute('x'));
      const rw = parseFloat(rect.getAttribute('width'));
      expect(rx).toBeGreaterThanOrEqual(0);
      expect(rx + rw).toBeLessThanOrEqual(W);
    });
  });

  it('chip flips to top when the dot is in the bottom quarter', () => {
    const { box, container } = mount({ points: even });
    move(box, 600); // last = max, top of chart: chip stays at the bottom
    const bottomY = parseFloat(q(container, 'chart-chip').querySelector('rect').getAttribute('y'));
    expect(bottomY).toBeGreaterThan(H / 2);
    move(box, 0); // first = min, bottom of chart: chip flips up
    const topY = parseFloat(q(container, 'chart-chip').querySelector('rect').getAttribute('y'));
    expect(topY).toBeLessThan(H / 2);
  });
});

describe('LineChart container', () => {
  it('carries data-chart-scrub and touch-action pan-y', () => {
    const { box } = mount({ points: even });
    expect(box.getAttribute('data-chart-scrub')).toBe('true');
    expect(box.style.touchAction).toBe('pan-y');
  });
});
