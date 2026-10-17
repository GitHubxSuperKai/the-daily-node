import React from 'react';
globalThis.React = React;

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../src/theme.js';
import { axisLabels, RANGES } from '../../src/utils/chartRange.js';
import { fmtPct } from '../../src/utils/formatting.js';

let capturedOnHover = null;
// Latest props the (mocked) LineChart received: assert on these, never on SVG.
let captured = null;
vi.mock('../../src/components/LineChart', () => ({
  default: (props) => {
    capturedOnHover = props.onHover;
    captured = props;
    return <div data-testid="line-chart" />;
  },
}));

import { MarketsColumn } from '../../src/components/MarketsColumn.jsx';

function wrap(ui) {
  return render(<ThemeCtx.Provider value={LIGHT}>{ui}</ThemeCtx.Provider>);
}

const liveData = { price: 81607, chgPct: -0.64, hi: 82500, lo: 80100, cap: 1.6e12, volBtc: 20000, vwap: 81000 };
const chain = { data: null };
const rss = { leadStory: null, err: null };

function mount(data = liveData) {
  return wrap(<MarketsColumn btc={{ data, chartPts: [] }} chain={chain} rss={rss} priceHistoryData={[]} />);
}

// Range-aware mount. rerenderWith keeps the theme wrapper and merges extra props.
function mountRange(props = {}) {
  const base = { btc: { data: liveData, chartPts: [] }, chain, rss, priceHistoryData: [] };
  let current = { ...base, ...props };
  const ui = () => (
    <ThemeCtx.Provider value={LIGHT}>
      <MarketsColumn {...current} />
    </ThemeCtx.Provider>
  );
  const r = render(ui());
  return {
    ...r,
    rerenderWith: (extra) => { current = { ...current, ...extra }; r.rerender(ui()); },
  };
}

function hover(p) {
  act(() => { capturedOnHover(p); });
}

function hexToRgb(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})`;
}

// Headline is the hero number span; the % slot is the sibling div starting with the arrow.
const headline = (text) => screen.getByText(text, { selector: 'span' });
const slotOf = (lead) =>
  screen.getByText((_, el) => el.tagName === 'DIV' && el.textContent.startsWith(lead) && el.style.fontSize !== '' && el.children.length <= 1);

describe('MarketsColumn — chart readout', () => {
  beforeEach(() => { capturedOnHover = null; });

  it('live by default', () => {
    mount();
    expect(headline('$81,607')).toBeDefined();
    expect(slotOf('▼').textContent).toBe('▼ -0.64%');
  });

  it('hover swaps headline and slot', () => {
    mount();
    hover({ t: 1, price: 80912 });
    expect(headline('$80,912')).toBeDefined();
    const slot = slotOf('▲');
    expect(slot.textContent).toContain('+0.86%');
    expect(slot.textContent).toContain('since');
  });

  it('downward move is red with ▼', () => {
    mount();
    hover({ t: 1, price: 82000 });
    const slot = slotOf('▼');
    expect(slot.textContent).toContain('-0.48%');
    expect(slot.style.color).toBe(hexToRgb(LIGHT.red));
  });

  it('onHover(null) restores live', () => {
    mount();
    hover({ t: 1, price: 80912 });
    hover(null);
    expect(headline('$81,607')).toBeDefined();
    expect(slotOf('▼').textContent).toBe('▼ -0.64%');
  });

  it('no live price shows — in the slot', () => {
    mount({ ...liveData, price: undefined });
    hover({ t: 1, price: 80912 });
    expect(headline('$80,912')).toBeDefined();
    expect(slotOf('—').textContent).toContain('—');
  });

  it('no data and no hover shows a bare —', () => {
    mount(null);
    expect(headline('—')).toBeDefined();
    expect(screen.queryByText('$—')).toBeNull();
  });

  it('ProofOfRead keeps the live price while hovering', () => {
    mount();
    hover({ t: 1, price: 80912 });
    expect(headline('$80,912')).toBeDefined();
    expect(screen.getByText(/at \$81,607/)).toBeDefined();
  });
});

describe('MarketsColumn — chart range', () => {
  const E = 1_800_000_000_000; // fixed domain end (ms)
  const dom = (span) => [E - span, E];
  const ok = (points, domain, extra = {}) => ({ points, domain, stale: false, failed: false, ...extra });
  beforeEach(() => { capturedOnHover = null; captured = null; });

  it('renders the range buttons and clicking 7D calls onRangeChange("7d")', () => {
    const onRangeChange = vi.fn();
    mountRange({ range: '24h', onRangeChange, chart: ok([], dom(RANGES['24h'].spanMs)) });
    expect(screen.getByRole('group', { name: 'Chart range' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '7D' }));
    expect(onRangeChange).toHaveBeenCalledWith('7d');
  });

  it('clicking a range with no onRangeChange supplied does not throw', () => {
    mountRange({ range: '24h' });
    expect(() => fireEvent.click(screen.getByRole('button', { name: '30D' }))).not.toThrow();
  });

  it('axis row reads the five axisLabels for the selected range', () => {
    const domain = dom(RANGES['7d'].spanMs);
    mountRange({ range: '7d', chart: ok([], domain) });
    const labels = axisLabels('7d', domain[1]);
    expect(labels).toHaveLength(5);
    const row = screen.getByText(labels[0]).parentElement;
    expect(Array.from(row.children).map((c) => c.textContent)).toEqual(labels);
  });

  it('idle at 7d shows the move since the first series point with a 7d suffix', () => {
    const domain = dom(RANGES['7d'].spanMs);
    mountRange({
      range: '7d',
      btc: { data: { ...liveData, price: 84000 }, chartPts: [] },
      chart: ok([[E - 3_600_000, 80000], [E - 1_800_000, 82000]], domain),
    });
    const slot = slotOf('▲');
    expect(slot.textContent).toBe(`▲ ${fmtPct(5)}%7d`);
    expect(slot.children).toHaveLength(1);
    expect(slot.children[0].textContent).toBe('7d');
  });

  it('idle at 24h shows chgPct with no suffix', () => {
    mountRange({ range: '24h', chart: ok([[E - 3_600_000, 80000]], dom(RANGES['24h'].spanMs)) });
    const slot = slotOf('▼');
    expect(slot.textContent).toBe('▼ -0.64%');
    expect(slot.children).toHaveLength(0);
  });

  it('idle at 7d with a stale chart shows a bare dash and no suffix', () => {
    mountRange({ range: '7d', chart: ok([[E - 3_600_000, 80000]], dom(RANGES['7d'].spanMs), { stale: true }) });
    const slot = slotOf('—');
    expect(slot.textContent).toBe('—');
    expect(slot.children).toHaveLength(0);
  });

  it('hover at 7d still reads "since", not the range suffix', () => {
    mountRange({ range: '7d', chart: ok([[E - 3_600_000, 80000]], dom(RANGES['7d'].spanMs)) });
    hover({ t: 1, price: 80912 });
    const slot = slotOf('▲');
    expect(slot.textContent).toContain('since');
    expect(slot.textContent).not.toContain('7d');
  });

  it('passes vwap to the chart at 24h only', () => {
    const { rerenderWith } = mountRange({ range: '24h', chart: ok([], dom(RANGES['24h'].spanMs)) });
    expect(captured.vwap).toBe(81000);
    rerenderWith({ range: '7d', chart: ok([], dom(RANGES['7d'].spanMs)) });
    expect(captured.vwap).toBeUndefined();
  });

  it('series includes history rows at 1h and excludes them at 7d', () => {
    // 3 history rows (epoch seconds) + 2 Kraken points after the last row (kept by mergeSeries).
    const priceHistoryData = [
      { ts: (E - 3_000_000) / 1000, usd: 80000 },
      { ts: (E - 2_400_000) / 1000, usd: 80100 },
      { ts: (E - 1_800_000) / 1000, usd: 80200 },
    ];
    const points = [[E - 1_200_000, 80300], [E - 600_000, 80400]];
    const m = mountRange({ range: '1h', priceHistoryData, chart: ok(points, dom(RANGES['1h'].spanMs)) });
    expect(captured.points).toHaveLength(5);
    m.rerenderWith({ range: '7d', chart: ok(points, dom(RANGES['7d'].spanMs)) });
    expect(captured.points).toHaveLength(2);
    // The old props are gone: the chart gets one windowed series, not raw feeds.
    expect(captured.historyPoints).toBeUndefined();
  });

  it('1h with no chart domain builds a one-hour domain and windows history inside it', () => {
    const now = Date.now();
    const priceHistoryData = [];
    for (let i = 0; i < 24 * 12; i++) priceHistoryData.push({ ts: (now - i * 300_000) / 1000, usd: 80000 + i });
    mountRange({ range: '1h', priceHistoryData, chart: ok(null, null) });
    const [d0, d1] = captured.domain;
    expect(d1 - d0).toBe(3_600_000);
    expect(captured.points.length).toBeGreaterThan(0);
    expect(captured.points.length).toBeLessThan(priceHistoryData.length);
    for (const [t] of captured.points) {
      expect(t).toBeGreaterThanOrEqual(d0);
      expect(t).toBeLessThanOrEqual(d1);
    }
  });

  it('dims the chart when stale', () => {
    const domain = dom(RANGES['24h'].spanMs);
    const m = mountRange({ range: '24h', chart: ok([], domain) });
    expect(captured.dimmed).toBe(false);
    m.rerenderWith({ chart: ok([], domain, { stale: true }) });
    expect(captured.dimmed).toBe(true);
  });

  it('shows "no data" only when failed and nothing fresh is drawn', () => {
    const domain = dom(RANGES['7d'].spanMs);
    const m = mountRange({ range: '7d', chart: ok([[E - 1, 1]], domain, { failed: true }) });
    expect(screen.queryByTestId('range-note')).toBeNull();
    m.rerenderWith({ chart: ok([[E - 1, 1]], domain, { stale: true, failed: true }) });
    expect(screen.getByTestId('range-note').textContent).toBe('no data');
    m.rerenderWith({ chart: ok(null, domain, { failed: true }) });
    expect(screen.getByTestId('range-note').textContent).toBe('no data');
  });

  it('keeps hi/lo on 24h values and ProofOfRead on the live price at 7d', () => {
    mountRange({ range: '7d', chart: ok([[E - 1, 70000]], dom(RANGES['7d'].spanMs)) });
    expect(screen.getByText('hi $82,500')).toBeDefined();
    expect(screen.getByText('lo $80,100')).toBeDefined();
    expect(screen.getByText(/at \$81,607/)).toBeDefined();
  });

  it('chart props keep their identity across a re-render with the same chart (clock tick)', () => {
    const chart = ok([[E - 1_800_000, 80000]], null);
    const priceHistoryData = [{ ts: (Date.now() - 600_000) / 1000, usd: 80000 }];
    const m = mountRange({ range: '24h', chart, priceHistoryData });
    const first = { points: captured.points, domain: captured.domain, chipFormat: captured.chipFormat };
    // Guard against a vacuous toBe(undefined): the props must really be there.
    expect(Array.isArray(first.points)).toBe(true);
    expect(Array.isArray(first.domain)).toBe(true);
    expect(typeof first.chipFormat).toBe('function');
    // App re-renders every second with a fresh chain object and the same chart.
    m.rerenderWith({ chain: { data: null } });
    expect(captured.points).toBe(first.points);
    expect(captured.domain).toBe(first.domain);
    expect(captured.chipFormat).toBe(first.chipFormat);
  });
});
