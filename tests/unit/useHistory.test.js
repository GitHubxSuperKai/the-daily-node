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
    expect(spy.mock.calls[0][0]).toContain('/history/fees');
    expect(spy.mock.calls[0][0]).toContain(':3002');
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

// Regression: CI flake (Unhandled Rejection "window is not defined" from
// dispatchSetState at useHistory's .catch). A fetch that settles after the
// component unmounts — and after vitest tears down jsdom, deleting `window` —
// must not reach setState: React 19 reads window.event to pick an update lane.
describe('useHistory — request settling after unmount', () => {
  afterEach(() => vi.restoreAllMocks());

  async function settleAfterTeardown(settle) {
    let pending;
    const spy = vi.spyOn(global, 'fetch').mockImplementation(
      () => new Promise((resolve, reject) => { pending = { resolve, reject }; }),
    );
    const { unmount } = renderHook(() => useHistory('price', '24h'));
    unmount();

    const errors = [];
    const onRejection = (e) => errors.push(e);
    process.on('unhandledRejection', onRejection);
    const win = Object.getOwnPropertyDescriptor(globalThis, 'window');
    delete globalThis.window;  // what vitest's jsdom teardown does
    try {
      settle(pending);
      await new Promise((r) => setTimeout(r, 0));  // let rejection tracking run
    } finally {
      Object.defineProperty(globalThis, 'window', win);
      process.off('unhandledRejection', onRejection);
    }
    return { errors, signal: spy.mock.calls[0][1]?.signal };
  }

  it('aborts the in-flight request on unmount', async () => {
    const { signal } = await settleAfterTeardown((p) => p.resolve({ ok: true, json: async () => [] }));
    expect(signal?.aborted).toBe(true);
  });

  it('does not setState when the request rejects after teardown', async () => {
    const { errors } = await settleAfterTeardown((p) => p.reject(new TypeError('fetch failed')));
    expect(errors.map(String)).toEqual([]);
  });

  it('does not setState when the request resolves after teardown', async () => {
    const { errors } = await settleAfterTeardown((p) => p.resolve({ ok: true, json: async () => [] }));
    expect(errors.map(String)).toEqual([]);
  });
});
