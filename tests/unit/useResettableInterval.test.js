import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResettableInterval } from '../../src/hooks/useResettableInterval.js';

describe('useResettableInterval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires callback immediately on mount', () => {
    const cb = vi.fn();
    renderHook(() => useResettableInterval(cb, 1000));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('fires callback again after delay', () => {
    const cb = vi.fn();
    renderHook(() => useResettableInterval(cb, 1000));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('does NOT set up a repeating interval when delay is 0', () => {
    const cb = vi.fn();
    renderHook(() => useResettableInterval(cb, 0));
    expect(cb).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does NOT set up a repeating interval when delay is negative', () => {
    const cb = vi.fn();
    renderHook(() => useResettableInterval(cb, -1));
    expect(cb).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('cleans up interval on unmount', () => {
    const cb = vi.fn();
    const { unmount } = renderHook(() => useResettableInterval(cb, 500));
    unmount();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  // Settings Save relies on this: App rewrites CONFIG.REFRESH_INTERVALS and re-renders,
  // so each data hook passes a new delay and its timer restarts without a page reload.
  it('a new delay fetches at once and replaces the old cadence', () => {
    const cb = vi.fn();
    const { rerender } = renderHook(({ d }) => useResettableInterval(cb, d), { initialProps: { d: 1000 } });
    act(() => { vi.advanceTimersByTime(500); });
    cb.mockClear();
    rerender({ d: 3000 });
    expect(cb).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(2999); });
    expect(cb).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(1); });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('reset() fires callback immediately and restarts interval with valid delay', () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useResettableInterval(cb, 1000));
    cb.mockClear();
    act(() => { result.current.reset(); });
    expect(cb).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('does NOT set up interval when delay is NaN', () => {
    const cb = vi.fn();
    renderHook(() => useResettableInterval(cb, NaN));
    expect(cb).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('reset() with delay=0 fires callback once but starts no interval', () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useResettableInterval(cb, 0));
    cb.mockClear();
    act(() => { result.current.reset(); });
    expect(cb).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
