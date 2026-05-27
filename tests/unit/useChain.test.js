import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useChain } from '../../src/hooks/useChain.js';

const ok = (body) => ({ ok: true, json: async () => body });

// Route the various mempool.space endpoints invoked by fetchChainStats +
// fetchMiningPools + fetchRecentBlocks + fetchMempoolBlocks + fetchPoolBlocks.
function defaultRouter(url) {
  const u = String(url);
  if (u.includes('/api/blocks/tip/height')) return ok(800123);
  if (u.includes('/api/v1/mining/hashrate/3d')) return ok({ currentHashrate: 6e20, currentDifficulty: 8e13 });
  if (u.includes('/api/v1/fees/recommended')) return ok({ fastestFee: 12, halfHourFee: 8, economyFee: 2 });
  if (u.includes('/api/mempool') && !u.includes('mempool-blocks') && !u.includes('mempool-proxy'))
    return ok({ count: 1234, vsize: 50_000_000, total_fee: 100000 });
  if (u.includes('/api/v1/difficulty-adjustment'))
    return ok({ progressPercent: 50, difficultyChange: 1.5, remainingBlocks: 1000, timeAvg: 600000, estimatedRetargetDate: Date.now() });
  if (u.includes('/api/v1/mining/pools/1w'))
    return ok({ blockCount: 10, pools: [{ name: 'Foundry', slug: 'foundry', blockCount: 5 }] });
  if (u.includes('/api/v1/mining/pool/') && u.includes('/blocks'))
    return ok([{ height: 800120, timestamp: Date.now() / 1000, tx_count: 3000 }]);
  if (u.includes('/api/v1/blocks'))
    return ok([{ height: 800123, timestamp: Date.now() / 1000, tx_count: 3000, size: 1_000_000, weight: 4_000_000, extras: { medianFee: 5, pool: { name: 'Foundry' } } }]);
  if (u.includes('/api/v1/fees/mempool-blocks'))
    return ok([]);
  return ok({});
}

describe('useChain', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('populates data from mempool.space happy path', async () => {
    global.fetch = vi.fn().mockImplementation((url) => Promise.resolve(defaultRouter(url)));

    const { result } = renderHook(() => useChain({}));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBeTruthy();
    expect(result.current.data.height).toBe(800123);
    expect(result.current.data.mempoolTx).toBe(1234);
    expect(result.current.data.feeFast).toBe(12);
    expect(result.current.error).toBe(false);
    expect(result.current.lastOk).toBeGreaterThan(0);
  });

  it('exposes error=true when chain stats fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const { result } = renderHook(() => useChain({}));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it('routes through /api/mempool-proxy when custom baseUrl is set', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(ok({})));
    renderHook(() => useChain({ baseUrl: 'http://192.168.1.50:3006', fallbackToPublic: false }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const calls = global.fetch.mock.calls.map(([u]) => String(u));
    expect(calls.some(u => u.includes('/api/mempool-proxy'))).toBe(true);
    expect(calls.some(u => u.includes('mempool.space'))).toBe(false);
  });
});
