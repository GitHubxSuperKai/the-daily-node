import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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
    await release(5);
    expect(console.error).not.toHaveBeenCalled();
  });
});
