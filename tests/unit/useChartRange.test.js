import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// React 19 silently drops a setState on an unmounted component (no warning, no re-render), so the
// only way to observe the hook's unmount guard is to count calls to its state setter.
const setterCalls = vi.hoisted(() => ({ n: 0 }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useState: (init) => {
      const [value, set] = actual.useState(init);
      return [value, (...args) => { setterCalls.n += 1; return set(...args); }];
    },
  };
});
import { createElement, Suspense, startTransition, useState } from 'react';
import { render, renderHook, act } from '@testing-library/react';
import { useChartRange } from '../../src/hooks/useChartRange.js';

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const ROWS = 720;

// Kraken OHLC body: ROWS candles of `interval` minutes, newest at NOW.
const body = (interval) => {
  const rows = [];
  for (let k = ROWS - 1; k >= 0; k--) {
    const t = Math.floor(NOW / 1000) - k * interval * 60;
    rows.push([t, '1', '1', '1', String(1000 + interval * 1000 + (ROWS - k)), '1', '1', 1]);
  }
  return { error: [], result: { XXBTZUSD: rows, last: 0 } };
};
const okResponse = (json) => ({ ok: true, json: async () => json });

let held;
let mode;
const intervalOf = (url) => Number(String(url).split('interval=')[1]);
const calls = (n) => global.fetch.mock.calls.filter(([u]) => intervalOf(u) === n);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  held = new Map();
  mode = new Map();
  global.fetch = vi.fn((url) => {
    const n = intervalOf(url);
    const m = mode.get(n);
    if (m === 'error-body') return Promise.resolve(okResponse({ error: ['EGeneral:Too many requests'], result: {} }));
    if (m === 'http503') return Promise.resolve({ ok: false, status: 503, json: async () => body(5) });
    if (m === 'reject') return Promise.reject(new Error('network'));
    if (held.has(n)) return new Promise((res) => { held.get(n).push(res); });
    return Promise.resolve(okResponse(body(n)));
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const flush = () => act(async () => { await Promise.resolve(); });
const hold = (n) => held.set(n, []);
const release = async (n) => {
  const resolvers = held.get(n);
  held.delete(n);
  await act(async () => { resolvers.forEach((res) => res(okResponse(body(n)))); });
};
const mount = (rangeKey) => renderHook(({ rangeKey }) => useChartRange(rangeKey), { initialProps: { rangeKey } });

describe('useChartRange', () => {
  it('fetches interval 5 exactly once on mount at 24h', async () => {
    const { result } = mount('24h');
    await flush();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toMatch(/interval=5$/);
    expect(result.current.points.length).toBe(289);
    expect(result.current.domain[1] - result.current.domain[0]).toBe(86400000);
    expect(result.current.stale).toBe(false);
    expect(result.current.failed).toBe(false);
  });

  it('7d then 30d shares one fetch', async () => {
    const { result, rerender } = mount('24h');
    await flush();
    rerender({ rangeKey: '7d' });
    await flush();
    expect(calls(60).length).toBe(1);
    const p7 = result.current.points;
    rerender({ rangeKey: '30d' });
    await flush();
    expect(calls(60).length).toBe(1);
    const p30 = result.current.points;
    expect(p30[p30.length - 1][0] - p30[0][0]).toBeGreaterThan(p7[p7.length - 1][0] - p7[0][0]);
  });

  it('re-selecting within half the refresh period does not refetch', async () => {
    const { rerender } = mount('24h');
    await flush();
    rerender({ rangeKey: '7d' });
    await flush();
    await act(async () => { vi.advanceTimersByTime(30000); });
    rerender({ rangeKey: '24h' });
    await flush();
    expect(calls(5).length).toBe(1);
  });

  it('timer tick refetches the selected interval', async () => {
    mount('24h');
    await flush();
    expect(calls(5).length).toBe(1);
    await act(async () => { vi.advanceTimersByTime(300000); });
    expect(calls(5).length).toBe(2);
  });

  it('switching to an uncached range keeps the previous points stale until data lands', async () => {
    const { result, rerender } = mount('24h');
    await flush();
    const p24 = result.current.points;
    hold(1440);
    rerender({ rangeKey: '1y' });
    await flush();
    expect(result.current.stale).toBe(true);
    expect(result.current.points).toBe(p24);
    await release(1440);
    expect(result.current.stale).toBe(false);
    expect(result.current.points).not.toBe(p24);
    expect(result.current.domain[1] - result.current.domain[0]).toBe(31536000000);
  });

  it('a late response never shows under a different range', async () => {
    const { result, rerender } = mount('24h');
    await flush();
    const p24 = result.current.points;
    hold(60);
    hold(1440);
    rerender({ rangeKey: '7d' });
    await flush();
    rerender({ rangeKey: '1y' });
    await flush();
    await release(60);
    expect(result.current.stale).toBe(true);
    expect(result.current.points).toBe(p24);
    await release(1440);
    expect(result.current.stale).toBe(false);
    expect(result.current.domain[1] - result.current.domain[0]).toBe(31536000000);
  });

  it('Kraken error array counts as failure', async () => {
    mode.set(5, 'error-body');
    const { result } = mount('24h');
    await flush();
    expect(result.current.points).toBeNull();
    expect(result.current.domain).toBeNull();
    expect(result.current.failed).toBe(true);
  });

  it('failure with a cache keeps drawing the cache', async () => {
    const { result } = mount('24h');
    await flush();
    const pts = result.current.points;
    mode.set(5, 'reject');
    await act(async () => { vi.advanceTimersByTime(300000); });
    await flush();
    expect(calls(5).length).toBe(2);
    expect(result.current.points).toBe(pts);
    expect(result.current.stale).toBe(false);
    expect(result.current.failed).toBe(true);
  });

  it('rerender with the same key keeps identity', async () => {
    const { result, rerender } = mount('24h');
    await flush();
    const a = result.current;
    rerender({ rangeKey: '24h' });
    expect(result.current).toBe(a);
    expect(result.current.points).toBe(a.points);
    expect(result.current.domain).toBe(a.domain);
  });

  it('refresh bypasses the freshness check', async () => {
    const { result } = mount('24h');
    await flush();
    await act(async () => { result.current.refresh(); });
    await flush();
    expect(calls(5).length).toBe(2);
  });

  it('does not update state after unmount', async () => {
    hold(5);
    const { unmount } = mount('24h');
    await flush();
    unmount();
    setterCalls.n = 0;
    await release(5);
    expect(setterCalls.n).toBe(0);
  });

  it('refresh restarts the timer so a tick one period later still fetches', async () => {
    const { result } = mount('24h');
    await flush();
    await act(async () => { vi.advanceTimersByTime(200000); });
    await act(async () => { result.current.refresh(); });
    await flush();
    expect(calls(5).length).toBe(2);
    await act(async () => { vi.advanceTimersByTime(300000); });
    expect(calls(5).length).toBe(3);
  });

  it('an HTTP non-OK response counts as failure', async () => {
    mode.set(5, 'http503');
    const { result } = mount('24h');
    await flush();
    expect(result.current.points).toBeNull();
    expect(result.current.failed).toBe(true);
  });

  it('re-selecting a range with an aged cache dims it until the refetch lands', async () => {
    const { result, rerender } = mount('24h');
    await flush();
    expect(result.current.aged).toBe(false);
    rerender({ rangeKey: '7d' });
    await flush();
    // Past half the 24h refresh period, so re-selecting 24h refetches.
    await act(async () => { vi.advanceTimersByTime(200000); });
    hold(5);
    rerender({ rangeKey: '24h' });
    await flush();
    expect(calls(5).length).toBe(2);
    expect(result.current.points).not.toBeNull();
    expect(result.current.aged).toBe(true);
    expect(result.current.stale).toBe(false);
    await release(5);
    expect(result.current.aged).toBe(false);
  });

  it('re-selecting within half the refresh period is not aged', async () => {
    const { result, rerender } = mount('24h');
    await flush();
    rerender({ rangeKey: '7d' });
    await flush();
    await act(async () => { vi.advanceTimersByTime(30000); });
    rerender({ rangeKey: '24h' });
    await flush();
    expect(result.current.aged).toBe(false);
  });

  it('a failed timer refetch on the selected range does not dim it', async () => {
    const { result } = mount('24h');
    await flush();
    // A failing tick bumps the hook's version, so `aged` is recomputed with the cache now old.
    mode.set(5, 'reject');
    await act(async () => { vi.advanceTimersByTime(300000); });
    await flush();
    expect(calls(5).length).toBe(2);
    expect(result.current.failed).toBe(true);
    expect(result.current.aged).toBe(false);
  });

  it('re-selecting at exactly half the refresh period is aged', async () => {
    const { result, rerender } = mount('24h');
    await flush();
    rerender({ rangeKey: '7d' });
    await flush();
    await act(async () => { vi.advanceTimersByTime(150000); });
    hold(5);
    rerender({ rangeKey: '24h' });
    await flush();
    expect(calls(5).length).toBe(2);
    expect(result.current.aged).toBe(true);
    await release(5);
  });

  it('a successful timer retry clears the failure without a re-select', async () => {
    mode.set(5, 'reject');
    const { result } = mount('24h');
    await flush();
    expect(result.current.failed).toBe(true);
    mode.delete(5);
    await act(async () => { vi.advanceTimersByTime(300000); });
    await flush();
    expect(calls(5).length).toBe(2);
    expect(result.current.failed).toBe(false);
  });

  it('re-selecting a range that failed earlier hides the old failure while the retry is in flight', async () => {
    const { result, rerender } = mount('24h');
    await flush();
    mode.set(1440, 'reject');
    rerender({ rangeKey: '1y' });
    await flush();
    expect(result.current.failed).toBe(true);
    rerender({ rangeKey: '24h' });
    await flush();
    mode.delete(1440);
    hold(1440);
    rerender({ rangeKey: '1y' });
    expect(result.current.failed).toBe(false);
    await flush();
    expect(calls(1440).length).toBe(2);
    expect(result.current.failed).toBe(false);
    expect(result.current.stale).toBe(true);
    await release(1440);
    expect(result.current.stale).toBe(false);
    expect(result.current.failed).toBe(false);
  });

  it('a retry that fails again shows the failure', async () => {
    const { result, rerender } = mount('24h');
    await flush();
    mode.set(1440, 'reject');
    rerender({ rangeKey: '1y' });
    await flush();
    rerender({ rangeKey: '24h' });
    await flush();
    rerender({ rangeKey: '1y' });
    expect(result.current.failed).toBe(false);
    await flush();
    expect(calls(1440).length).toBe(2);
    expect(result.current.failed).toBe(true);
  });

  it('a failed fetch for an uncached range is both stale and failed', async () => {
    const { result, rerender } = mount('24h');
    await flush();
    const p24 = result.current.points;
    mode.set(1440, 'reject');
    rerender({ rangeKey: '1y' });
    await flush();
    expect(result.current.stale).toBe(true);
    expect(result.current.failed).toBe(true);
    expect(result.current.points).toBe(p24);
  });

  // A render React throws away (here a transition that suspends) must leave no trace: the hook
  // body runs for '7d', but 24h stays the committed selection, so a later failed timer refetch
  // must not see a re-select stamped at the discarded render's time and dim the chart as aged.
  it('a discarded render for another range does not restamp the selection', async () => {
    const never = new Promise(() => {});
    const out = { current: null };
    let setProps;
    function Probe({ rangeKey, suspend }) {
      const r = useChartRange(rangeKey);
      if (suspend) throw never;
      out.current = r;
      return null;
    }
    function Host() {
      const [p, set] = useState({ rangeKey: '24h', suspend: false });
      setProps = set;
      return createElement(Suspense, { fallback: null }, createElement(Probe, p));
    }
    render(createElement(Host));
    await flush();
    await act(async () => { vi.advanceTimersByTime(150000); });
    await act(async () => { startTransition(() => setProps({ rangeKey: '7d', suspend: true })); });
    expect(calls(60).length).toBe(0);
    await act(async () => { setProps({ rangeKey: '24h', suspend: false }); });
    mode.set(5, 'reject');
    await act(async () => { vi.advanceTimersByTime(150000); });
    await flush();
    expect(calls(5).length).toBe(2);
    expect(out.current.failed).toBe(true);
    expect(out.current.aged).toBe(false);
  });

  // Same discard, other ref: the stale fallback for an uncached range must be the last range
  // actually shown (24h), not the cached 7d window the discarded render computed.
  it('a discarded render does not change which points an uncached range shows as stale', async () => {
    const never = new Promise(() => {});
    const out = { current: null };
    let setProps;
    function Probe({ rangeKey, suspend }) {
      const r = useChartRange(rangeKey);
      if (suspend) throw never;
      out.current = r;
      return null;
    }
    function Host() {
      const [p, set] = useState({ rangeKey: '24h', suspend: false });
      setProps = set;
      return createElement(Suspense, { fallback: null }, createElement(Probe, p));
    }
    render(createElement(Host));
    await flush();
    await act(async () => { setProps({ rangeKey: '7d', suspend: false }); });
    await flush();
    await act(async () => { setProps({ rangeKey: '24h', suspend: false }); });
    await flush();
    const p24 = out.current.points;
    await act(async () => { startTransition(() => setProps({ rangeKey: '7d', suspend: true })); });
    await act(async () => { setProps({ rangeKey: '24h', suspend: false }); });
    mode.set(1440, 'reject');
    await act(async () => { setProps({ rangeKey: '1y', suspend: false }); });
    await flush();
    expect(out.current.stale).toBe(true);
    expect(out.current.points).toBe(p24);
  });
});
