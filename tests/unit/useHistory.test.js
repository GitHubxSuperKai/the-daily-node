import React from 'react';
globalThis.React = React;

// Shim for the build-time global: call callback on mount, return reset=callback
globalThis.useResettableInterval = function(callback, _delay) {
  // eslint-disable-next-line react-hooks/rules-of-hooks, react-hooks/exhaustive-deps -- test shim that runs callback once on mount
  React.useEffect(() => { callback(); }, []);
  return { reset: callback };
};

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHistory } from '../../src/hooks/useHistory.js';

describe('useHistory', () => {
  afterEach(() => vi.restoreAllMocks());

  it('starts in loading state with empty data', () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => new Promise(() => {}),
    });
    const { result } = renderHook(() => useHistory('price', '24h'));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toEqual([]);
  });

  it('returns data on successful fetch', async () => {
    const mockData = [{ ts: 1700000000, usd: 50000, vol: 100 }];
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });
    const { result } = renderHook(() => useHistory('price', '24h'));
    await act(async () => {});
    expect(result.current.data).toEqual(mockData);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('returns error string on non-ok response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 503 });
    const { result } = renderHook(() => useHistory('price', '24h'));
    await act(async () => {});
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toMatch(/503/);
    expect(result.current.loading).toBe(false);
  });

  it('returns error string on network failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useHistory('price', '24h'));
    await act(async () => {});
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBe('Network error');
  });

  it('calls correct URL for 24h range with min bucket', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, json: () => Promise.resolve([]),
    });
    renderHook(() => useHistory('fees', '24h'));
    await act(async () => {});
    expect(spy.mock.calls[0][0]).toContain('127.0.0.1:3002/history/fees');
    expect(spy.mock.calls[0][0]).toContain('bucket=min');
  });

  it('uses hour bucket for 7d range', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, json: () => Promise.resolve([]),
    });
    renderHook(() => useHistory('hashrate', '7d'));
    await act(async () => {});
    expect(spy.mock.calls[0][0]).toContain('bucket=hour');
  });
});
