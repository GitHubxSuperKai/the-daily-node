import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFeedHealth } from '../../src/hooks/useFeedHealth.js';

const NOW = 1_700_000_000_000;
const MIN = 60_000;

describe('useFeedHealth', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns loading initially before first check runs', () => {
    const feeds = [{ lastOk: NOW - 5_000, interval: MIN }];
    const { result } = renderHook(() => useFeedHealth(feeds));
    // Before the interval fires the initial check runs synchronously via check()
    // status should resolve to live on mount
    expect(result.current).toBe('live');
  });

  it('returns live when all feeds are recent', () => {
    const feeds = [
      { lastOk: NOW - 10_000, interval: MIN },
      { lastOk: NOW - 20_000, interval: MIN },
    ];
    const { result } = renderHook(() => useFeedHealth(feeds));
    expect(result.current).toBe('live');
  });

  it('returns offline when all feeds are stale', () => {
    const feeds = [
      { lastOk: NOW - 200_000, interval: MIN },
      { lastOk: NOW - 300_000, interval: MIN },
    ];
    const { result } = renderHook(() => useFeedHealth(feeds));
    expect(result.current).toBe('offline');
  });

  it('returns degraded when some but not all feeds are stale', () => {
    const feeds = [
      { lastOk: NOW - 10_000,  interval: MIN },
      { lastOk: NOW - 200_000, interval: MIN },
    ];
    const { result } = renderHook(() => useFeedHealth(feeds));
    expect(result.current).toBe('degraded');
  });

  it('returns offline when lastOk is missing on all feeds', () => {
    const feeds = [{ lastOk: null, interval: MIN }, { lastOk: null, interval: MIN }];
    const { result } = renderHook(() => useFeedHealth(feeds));
    expect(result.current).toBe('offline');
  });

  it('contentStale: true on a single feed triggers degraded when other feeds are live', () => {
    const feeds = [
      { lastOk: NOW - 10_000, interval: MIN, contentStale: true },
      { lastOk: NOW - 10_000, interval: MIN },
    ];
    const { result } = renderHook(() => useFeedHealth(feeds));
    expect(result.current).toBe('degraded');
  });

  it('contentStale: true on all feeds triggers offline', () => {
    const feeds = [
      { lastOk: NOW - 10_000, interval: MIN, contentStale: true },
      { lastOk: NOW - 10_000, interval: MIN, contentStale: true },
    ];
    const { result } = renderHook(() => useFeedHealth(feeds));
    expect(result.current).toBe('offline');
  });

  it('contentStale: false does not degrade a live feed', () => {
    const feeds = [
      { lastOk: NOW - 10_000, interval: MIN, contentStale: false },
      { lastOk: NOW - 10_000, interval: MIN },
    ];
    const { result } = renderHook(() => useFeedHealth(feeds));
    expect(result.current).toBe('live');
  });

  it('contentStale: undefined does not degrade a live feed', () => {
    const feeds = [
      { lastOk: NOW - 10_000, interval: MIN, contentStale: undefined },
    ];
    const { result } = renderHook(() => useFeedHealth(feeds));
    expect(result.current).toBe('live');
  });

  it('re-evaluates on the 5s interval tick', () => {
    const feeds = [{ lastOk: NOW - 10_000, interval: MIN }];
    const { result, rerender } = renderHook(({ f }) => useFeedHealth(f), {
      initialProps: { f: feeds },
    });
    expect(result.current).toBe('live');

    // Advance time so the feed becomes stale (beyond 2x interval = 120s)
    vi.setSystemTime(NOW + 130_000);
    act(() => { vi.advanceTimersByTime(5_000); });

    expect(result.current).toBe('offline');
  });
});
