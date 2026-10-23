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

import { MarketsColumn, DROP_CAP_MIN_CHARS } from '../../src/components/MarketsColumn.jsx';
import { ProofOfRead } from '../../src/components/ProofOfRead.jsx';

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

  it('with no chart domain, the 1h window follows new history rows instead of freezing at mount', () => {
    const t0 = Date.now();
    const rows = (end) => {
      const out = [];
      for (let i = 0; i < 24 * 12; i++) out.push({ ts: (end - i * 300_000) / 1000, usd: 80000 + i });
      return out;
    };
    const m = mountRange({ range: '1h', priceHistoryData: rows(t0), chart: ok(null, null) });
    expect(captured.points.length).toBeGreaterThan(0);
    // Two hours later Kraken still has not loaded; the daemon kept writing rows.
    const t1 = t0 + 2 * 3_600_000;
    m.rerenderWith({ priceHistoryData: rows(t1) });
    const [d0, d1] = captured.domain;
    expect(d1).toBe(t1);
    expect(d1 - d0).toBe(3_600_000);
    expect(captured.points.length).toBeGreaterThan(0);
    expect(captured.points[captured.points.length - 1][0]).toBe(t1);
  });

  it('a history-only 1h chart whose newest row is two hours old does not label its edge "now"', () => {
    const end = Date.now() - 2 * 3_600_000;
    const priceHistoryData = [];
    for (let i = 0; i < 60; i++) priceHistoryData.push({ ts: (end - i * 60_000) / 1000, usd: 80000 + i });
    mountRange({ range: '1h', priceHistoryData, chart: ok(null, null) });
    expect(captured.domain[1]).toBe(end);
    const row = screen.getByText('−45m').parentElement;
    const labels = Array.from(row.children).map((c) => c.textContent);
    expect(labels[0]).toBe('−60m');
    expect(labels[4]).not.toBe('now');
    expect(labels[4]).toMatch(/\d:\d\d [AP]M$/);
  });

  it('the 1h axis edge turns from "now" to a clock time as the history goes stale, with no new data', () => {
    const t0 = new Date(2026, 9, 17, 12, 0).getTime();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(t0);
      const priceHistoryData = [];
      for (let i = 0; i < 60; i++) priceHistoryData.push({ ts: (t0 - i * 60_000) / 1000, usd: 80000 + i });
      const m = mountRange({ range: '1h', priceHistoryData, chart: ok(null, null) });
      const axis = () => Array.from(screen.getByText('−45m').parentElement.children).map((c) => c.textContent);
      expect(axis()[0]).toBe('60m ago');
      expect(axis()[4]).toBe('now');
      // The daemon stalls: 16 minutes on, the same history, re-rendered by App's clock tick.
      vi.setSystemTime(t0 + 16 * 60_000);
      m.rerenderWith({});
      expect(axis()[0]).toBe('−60m');
      expect(axis()[4]).toBe('12:00 PM');
    } finally {
      vi.useRealTimers();
    }
  });

  it('dims the chart when its cache is aged', () => {
    const domain = dom(RANGES['24h'].spanMs);
    const m = mountRange({ range: '24h', chart: ok([[E - 1, 1]], domain) });
    expect(captured.dimmed).toBe(false);
    m.rerenderWith({ chart: ok([[E - 1, 1]], domain, { aged: true }) });
    expect(captured.dimmed).toBe(true);
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

describe('MarketsColumn — lead story', () => {
  const leadWith = (snippet) => ({
    rss: {
      err: null, skipLead: vi.fn(),
      leadStory: { hed: 'Lead headline', topic: 'BITCOIN', src: 'CoinDesk', t: '1h', link: 'https://example.com/lead', img: 'https://example.com/lead.jpg', snippet },
    },
  });
  // The drop cap is the only floated span in the column.
  const dropCapOf = (container) => [...container.querySelectorAll('span')].find(s => s.style.float === 'left') ?? null;
  const dekOf = (container, snippet) =>
    [...container.querySelectorAll('div')].filter(d => d.textContent === snippet).pop();

  it('the threshold is about two lines of dek', () => {
    expect(DROP_CAP_MIN_CHARS).toBe(150);
  });

  it('a short dek renders plain, with no drop cap', () => {
    const snippet = 'Your day-ahead look for Oct. 19, 2026';
    const { container } = mountRange(leadWith(snippet));
    expect(dropCapOf(container)).toBeNull();
    // Whole, not split into a first letter and the rest.
    expect(screen.getByText(snippet)).toBeDefined();
  });

  it('a dek one char short of the threshold renders plain', () => {
    const { container } = mountRange(leadWith('x'.repeat(DROP_CAP_MIN_CHARS - 1)));
    expect(dropCapOf(container)).toBeNull();
  });

  it('a dek at the threshold gets the drop cap, and the body is the rest of the text', () => {
    const snippet = 'B' + 'y'.repeat(DROP_CAP_MIN_CHARS - 1);
    const { container } = mountRange(leadWith(snippet));
    const cap = dropCapOf(container);
    expect(cap).not.toBeNull();
    expect(cap.textContent.trim()).toBe('B');
    // The cap's letter is not repeated in the body.
    expect(dekOf(container, snippet)).toBeDefined();
    expect(container.textContent).not.toContain('B' + snippet);
  });
});

describe('MarketsColumn — lead image and summary layout', () => {
  const lead = (snippet) => ({
    rss: {
      err: null, skipLead: vi.fn(),
      leadStory: { hed: 'Lead headline', topic: 'BITCOIN', src: 'CoinDesk', t: '1h', link: 'https://example.com/lead', img: 'https://example.com/lead.jpg', snippet },
    },
  });
  // ScrollHint spreads the summary's style onto its root, the only div with the dek's font size.
  const summaryRoot = (container) => {
    const roots = [...container.querySelectorAll('div')].filter(d => d.style.fontSize === 'calc(var(--u) * 13.5)');
    expect(roots).toHaveLength(1);
    return roots[0];
  };

  it('the image keeps its own ratio, anchors its crop to the top and yields space first', () => {
    const { container } = mountRange(lead('Short dek.'));
    const img = container.querySelector('img');
    expect(img.style.height).toBe('auto');
    expect(img.style.objectFit).toBe('cover');
    expect(img.style.objectPosition).toBe('top');
    expect(img.style.minHeight).toBe('calc(var(--u) * 160)');
    expect(img.style.maxHeight).toBe('calc(var(--u) * 270)');
    expect(img.style.flex).toBe('0 1000 auto');
  });

  it('a short dek asks only for its own height', () => {
    const { container } = mountRange(lead('Short dek.'));
    const root = summaryRoot(container);
    expect(root.style.flex).toBe('0 1 auto');
    expect(root.style.minHeight).toBe('0px');
  });

  it('a long dek asks for three lines as its basis, with no hard floor', () => {
    const { container } = mountRange(lead('L'.repeat(DROP_CAP_MIN_CHARS)));
    const root = summaryRoot(container);
    expect(root.style.flex).toBe('1 1 calc(var(--u) * 60)');
    expect(root.style.minHeight).toBe('0px');
  });
});

describe('ProofOfRead — date tokens', () => {
  // A date must never wrap mid-value ("~2026-10-" / "30") on the wall panel.
  const chainData = {
    feeFast: 4, diffAdj: 1, remainingBlocks: 500, height: 900000,
    estimatedRetargetDate: Date.UTC(2026, 9, 30, 12), nextHalvingDate: '2028-04-01',
  };
  const props = { btc: { data: null }, hashrate: '1 EH/s', mempoolTx: '1', mempoolMB: '1 MB', feeFast: 4, feeEco: 1 };

  it('renders the retarget date inside one nowrap span', () => {
    const { container } = wrap(<ProofOfRead {...props} chain={{ data: chainData }} />);
    const span = [...container.querySelectorAll('span')].find(s => s.textContent === '~2026-10-30');
    expect(span).toBeTruthy();
    expect(span.style.whiteSpace).toBe('nowrap');
    expect(container.textContent).toContain('Next difficulty retarget ~2026-10-30.');
  });

  it('renders the halving date inside one nowrap span when it comes first', () => {
    const { container } = wrap(<ProofOfRead {...props} chain={{ data: { ...chainData, height: 1049900, remainingBlocks: 2000 } }} />);
    const span = [...container.querySelectorAll('span')].find(s => s.textContent === '2028-04-01');
    expect(span).toBeTruthy();
    expect(span.style.whiteSpace).toBe('nowrap');
  });
});

describe('MarketsColumn — no lead and lead-image fallback', () => {
  const LEAD = { hed: 'Lead headline', topic: 'BITCOIN', src: 'CoinDesk', t: '1h', link: 'https://example.com/lead', img: 'https://example.com/lead.jpg', snippet: '' };

  it('loaded with no lead: "No lead story right now"', () => {
    mountRange({ rss: { leadStory: null, err: null, lastOk: 1 } });
    expect(screen.getByText('No lead story right now')).toBeDefined();
  });

  it('not loaded yet: fetching copy, not the empty state', () => {
    mountRange({ rss: { leadStory: null, err: null, lastOk: null } });
    expect(screen.getByText('Fetching headlines…')).toBeDefined();
    expect(screen.queryByText('No lead story right now')).toBeNull();
  });

  it('a feed error wins over the empty state', () => {
    mountRange({ rss: { leadStory: null, err: true, lastOk: 1 } });
    expect(screen.getByText('All feeds unavailable')).toBeDefined();
    expect(screen.queryByText('No lead story right now')).toBeNull();
  });

  it('a lead image load error calls skipLead with the failing image', () => {
    const skipLead = vi.fn();
    const { container } = mountRange({ rss: { leadStory: LEAD, err: null, lastOk: 1, skipLead } });
    fireEvent.error(container.querySelector('img'));
    expect(skipLead).toHaveBeenCalledTimes(1);
    expect(skipLead).toHaveBeenCalledWith('https://example.com/lead.jpg');
  });

  it('a lead image load error without skipLead does not throw', () => {
    const { container } = mountRange({ rss: { leadStory: LEAD, err: null, lastOk: 1 } });
    // React reports a throwing event handler on window, not to the caller, so
    // .not.toThrow() alone would pass vacuously.
    const errors = [];
    const onWinError = (e) => { errors.push(e.error); e.preventDefault(); };
    window.addEventListener('error', onWinError);
    try {
      fireEvent.error(container.querySelector('img'));
    } finally {
      window.removeEventListener('error', onWinError);
    }
    expect(errors).toEqual([]);
  });
});
