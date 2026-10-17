import React from 'react';
globalThis.React = React;

import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../../src/theme.js';

let capturedOnHover = null;
let capturedProps = null;
vi.mock('../../../src/components/LineChart.jsx', () => ({
  default: (props) => {
    capturedOnHover = props.onHover;
    capturedProps = props;
    return <div data-testid="line-chart" />;
  },
}));

import { BitcoinPanel } from '../../../src/components/mobile/BitcoinPanel.jsx';

function wrap(ui) {
  return render(<ThemeCtx.Provider value={LIGHT}>{ui}</ThemeCtx.Provider>);
}

const btcProps = {
  data: { price: 67000, chgPct: 2.1, hi: 68000, lo: 65000, cap: 1.3e12 },
  chartPts: [],
};

const chainProps = {
  data: {
    hashrate: 800e18,
    difficulty: 95e12,
    blockTimeMs: 600000,
    mempoolBytes: 9_000_000,
    feeFast: 30,
    feeEco: 8,
    height: 900000,
    progressPercent: 71.3,
    remainingBlocks: 591,
    circulating: '19.86M BTC',
    nextHalvingDate: 'Apr 2028',
  },
  recentBlocks: [],
  mempoolBlocks: [],
};

describe('BitcoinPanel — Halving', () => {
  it('renders circulating supply', () => {
    wrap(<BitcoinPanel btc={btcProps} chain={chainProps} />);
    expect(screen.getByText('19.86M BTC')).toBeDefined();
  });

  it('renders next halving date', () => {
    wrap(<BitcoinPanel btc={btcProps} chain={chainProps} />);
    expect(screen.getByText('Apr 2028')).toBeDefined();
  });

  it('renders halving blocks remaining', () => {
    // height 900000 → next multiple of 210000 is 1050000 → 150000 blk remaining
    wrap(<BitcoinPanel btc={btcProps} chain={chainProps} />);
    expect(screen.getByText('150,000 blk')).toBeDefined();
  });

  it('halving section is hidden when chain.data is null', () => {
    wrap(<BitcoinPanel btc={btcProps} chain={{ data: null, recentBlocks: [], mempoolBlocks: [] }} />);
    expect(screen.queryByText('19.86M BTC')).toBeNull();
  });
});

describe('BitcoinPanel — chart readout', () => {
  const live = { price: 81607, chgPct: -0.64, hi: 82500, lo: 80100, cap: 1.6e12, volBtc: 20000, vwap: 81000 };
  const mount = (data = live) =>
    wrap(<BitcoinPanel btc={{ data, chartPts: [] }} chain={chainProps} />);
  const hover = (p) => act(() => { capturedOnHover(p); });
  const headline = (text) => screen.getByText(text, { selector: 'span' });
  const rgb = (hex) => {
    const m = /^#(..)(..)(..)$/.exec(hex);
    return `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})`;
  };

  it('live by default', () => {
    mount();
    expect(headline('$81,607')).toBeDefined();
    expect(screen.getByText('-0.64%')).toBeDefined();
  });

  it('hover swaps headline and slot', () => {
    mount();
    hover({ t: 1, price: 80912 });
    expect(headline('$80,912')).toBeDefined();
    const slot = screen.getByText(/\+0\.86%/);
    expect(slot.textContent).toContain('▲');
    expect(slot.textContent).toContain('since');
  });

  it('downward move is red with ▼', () => {
    mount();
    hover({ t: 1, price: 82000 });
    const slot = screen.getByText(/-0\.48%/);
    expect(slot.textContent).toContain('▼');
    expect(slot.style.color).toBe(rgb(LIGHT.red));
  });

  it('onHover(null) restores live', () => {
    mount();
    hover({ t: 1, price: 80912 });
    hover(null);
    expect(headline('$81,607')).toBeDefined();
    expect(screen.getByText('-0.64%')).toBeDefined();
  });

  it('no live price shows — in the slot', () => {
    mount({ ...live, price: undefined });
    hover({ t: 1, price: 80912 });
    expect(headline('$80,912')).toBeDefined();
    const slot = screen.getByText((_, el) => el.tagName === 'SPAN' && el.textContent.startsWith('—') && el.textContent.includes('since'));
    expect(slot).toBeDefined();
  });

  it('no data and no hover shows a bare —', () => {
    mount(null);
    expect(screen.queryByText('$—')).toBeNull();
    expect(headline('—')).toBeDefined();
  });

  it('chart wrapper has a 120px height', () => {
    mount();
    expect(screen.getByTestId('line-chart').parentElement.style.height).toBe('120px');
  });
});

describe('BitcoinPanel — chart range', () => {
  const live = { price: 84000, chgPct: -0.64, hi: 85000, lo: 80000, cap: 1.6e12, volBtc: 20000, vwap: 81000 };
  const DAY = 86_400_000;
  const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
  const domain30 = [NOW - 30 * DAY, NOW];
  const chartOf = (over = {}) => ({
    points: [[NOW - 29 * DAY, 80000], [NOW - 10 * DAY, 82000], [NOW, 84000]],
    domain: domain30,
    stale: false,
    failed: false,
    ...over,
  });
  const panel = (props = {}) => (
    <ThemeCtx.Provider value={LIGHT}>
      <BitcoinPanel btc={{ data: live, chartPts: [] }} chain={chainProps} {...props} />
    </ThemeCtx.Provider>
  );
  const mount = (props = {}) => render(panel(props));

  it('renders the five range buttons, each at least 32px tall', () => {
    mount({ chart: chartOf(), range: '24h', onRangeChange: () => {} });
    const buttons = screen.getAllByRole('button').filter((b) => b.dataset.range);
    expect(buttons.map((b) => b.dataset.range)).toEqual(['1h', '24h', '7d', '30d', '1y']);
    for (const b of buttons) expect(b.style.minHeight).toBe('32px');
  });

  it('range buttons sit directly above the 120px chart wrapper', () => {
    mount({ chart: chartOf(), range: '24h', onRangeChange: () => {} });
    const group = screen.getByRole('group', { name: 'Chart range' });
    expect(group.nextElementSibling).toBe(screen.getByTestId('line-chart').parentElement);
  });

  it('clicking a range button calls onRangeChange with its key', () => {
    const onRangeChange = vi.fn();
    mount({ chart: chartOf(), range: '24h', onRangeChange });
    fireEvent.click(screen.getByRole('button', { name: '7D' }));
    expect(onRangeChange).toHaveBeenCalledWith('7d');
  });

  it('renders and clicks safely with no onRangeChange', () => {
    mount({ chart: chartOf(), range: '24h' });
    expect(() => fireEvent.click(screen.getByRole('button', { name: '7D' }))).not.toThrow();
  });

  it('renders with no chart prop at all (older callers)', () => {
    mount();
    expect(capturedProps.points).toEqual([]);
    expect(capturedProps.domain[1] - capturedProps.domain[0]).toBe(DAY);
  });

  it('passes the windowed series, domain and chipFormat to the chart, and no vwap', () => {
    const chart = chartOf();
    mount({ chart, range: '30d', onRangeChange: () => {} });
    expect(capturedProps.points).toEqual(chart.points);
    expect(capturedProps.domain).toBe(domain30);
    expect(typeof capturedProps.chipFormat).toBe('function');
    expect(capturedProps.vwap).toBeUndefined();
    expect(capturedProps.dimmed).toBe(false);
    expect(capturedProps.showLabels).toBe(true);
  });

  it('never passes the legacy btc.chartPts to the chart', () => {
    mount({ btc: { data: live, chartPts: [[NOW, 1]] }, chart: chartOf(), range: '30d' });
    expect(capturedProps.points).toEqual(chartOf().points);
  });

  it('drops points outside the domain', () => {
    const chart = chartOf({ points: [[NOW - 40 * DAY, 1], [NOW - 5 * DAY, 2], [NOW + DAY, 3]] });
    mount({ chart, range: '30d' });
    expect(capturedProps.points).toEqual([[NOW - 5 * DAY, 2]]);
  });

  it('dims the chart when the series is stale', () => {
    mount({ chart: chartOf({ stale: true }), range: '30d' });
    expect(capturedProps.dimmed).toBe(true);
  });

  it('dims the chart when its cache is aged', () => {
    mount({ chart: chartOf({ aged: true }), range: '30d' });
    expect(capturedProps.dimmed).toBe(true);
  });

  it('keeps points, domain and chipFormat identity across a re-render with the same chart (null domain)', () => {
    // App re-renders every second; LineChart clears hover/scrub when its series changes.
    const chart = { points: [[Date.now() - 1000, 80000], [Date.now(), 84000]], domain: null, stale: false, failed: false };
    const r = mount({ chart, range: '1h', onRangeChange: () => {} });
    const first = capturedProps;
    r.rerender(panel({ chart, range: '1h', onRangeChange: () => {}, chain: { ...chainProps } }));
    expect(capturedProps).not.toBe(first);
    expect(capturedProps.points).toBe(first.points);
    expect(capturedProps.domain).toBe(first.domain);
    expect(capturedProps.chipFormat).toBe(first.chipFormat);
  });

  it('keeps points, domain and chipFormat identity across a re-render with the same chart (fixed domain)', () => {
    const chart = chartOf();
    const r = mount({ chart, range: '30d' });
    const first = capturedProps;
    r.rerender(panel({ chart, range: '30d', chain: { ...chainProps } }));
    expect(capturedProps.points).toBe(first.points);
    expect(capturedProps.domain).toBe(first.domain);
    expect(capturedProps.chipFormat).toBe(first.chipFormat);
  });

  it('recomputes the fallback domain when the range changes', () => {
    const chart = { points: null, domain: null, stale: false, failed: false };
    const r = mount({ chart, range: '1h' });
    const d1 = capturedProps.domain;
    expect(d1[1] - d1[0]).toBe(3_600_000);
    r.rerender(panel({ chart, range: '7d' }));
    const d2 = capturedProps.domain;
    expect(d2).not.toBe(d1);
    expect(d2[1] - d2[0]).toBe(7 * DAY);
  });

  it('idle % at 30d is the move since the series start, with a 30d suffix', () => {
    mount({ chart: chartOf(), range: '30d' });
    // 80000 -> 84000 = +5%
    const slot = screen.getByText(/\+5\.00%/);
    expect(slot.textContent).toContain('▲');
    const suffix = within(slot).getByText('30d');
    expect(suffix.style.fontSize).toBe('11px');
    expect(screen.queryByText('-0.64%')).toBeNull();
  });

  it('idle % at 24h is the exchange 24h change with no suffix and no arrow', () => {
    mount({ chart: chartOf(), range: '24h' });
    const slot = screen.getByText('-0.64%');
    expect(slot.textContent).not.toContain('▲');
    expect(slot.textContent).not.toContain('▼');
    expect(slot.textContent).not.toMatch(/24h/);
  });

  it('stale series at 30d shows a bare — with no suffix', () => {
    mount({ chart: chartOf({ stale: true }), range: '30d' });
    const slot = screen.getByText((_, el) => el.tagName === 'SPAN' && el.textContent === '—');
    expect(slot).toBeDefined();
    expect(screen.queryByText('30d')).toBeNull();
    expect(screen.queryByText(/\+5\.00%/)).toBeNull();
  });

  it('unknown idle % at 30d (no points) shows — with no suffix', () => {
    mount({ chart: { points: null, domain: null, stale: false, failed: false }, range: '30d' });
    expect(screen.queryByText('30d')).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('hover at 30d shows "since", not the range suffix', () => {
    mount({ chart: chartOf(), range: '30d' });
    act(() => { capturedOnHover({ t: 1, price: 82000 }); });
    const slot = screen.getByText(/\+2\.44%/);
    expect(slot.textContent).toContain('since');
    expect(screen.queryByText('30d')).toBeNull();
  });

  it('shows "no data" next to the buttons only when nothing fresh is drawn', () => {
    const r1 = mount({ chart: chartOf({ failed: true }), range: '30d' });
    expect(screen.queryByTestId('range-note')).toBeNull();
    r1.unmount();
    const r2 = mount({ chart: chartOf({ failed: true, stale: true }), range: '30d' });
    expect(screen.getByTestId('range-note').textContent).toBe('no data');
    r2.unmount();
    mount({ chart: { points: null, domain: null, stale: false, failed: true }, range: '30d' });
    expect(screen.getByTestId('range-note').textContent).toBe('no data');
  });
});
