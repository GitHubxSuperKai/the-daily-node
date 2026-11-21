import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useChain } from '../../src/hooks/useChain.js';
import CONFIG from '../../src/config.js';

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

    // fetchExtended runs in parallel; wait for it to populate pools.
    await waitFor(() => expect(result.current.pools.length).toBeGreaterThan(0));
    expect(result.current.pools[0].slug).toBe('foundry');
    expect(result.current.recentBlocks.length).toBeGreaterThan(0);
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

  // Two self-hosted nodes. Requests go through /api/mempool-proxy with the node in
  // `base` and the mempool path in `path`; each node answers with its own tip
  // height and top pool, so a test can tell whose answer landed.
  const NODE_A = 'https://node-a.example';
  const NODE_B = 'https://node-b.example';
  const TIP = { [NODE_A]: 800001, [NODE_B]: 800002 };
  const nodeRouter = (url) => {
    const u = new URL(String(url), 'http://localhost');
    const base = u.searchParams.get('base');
    const path = u.searchParams.get('path') || String(url);
    if (path.includes('/api/blocks/tip/height')) return ok(TIP[base]);
    if (path.includes('/api/v1/mining/pools/1w'))
      return ok({ blockCount: 10, pools: [{ name: `Pool ${base}`, slug: 'foundry', blockCount: 5 }] });
    if (path.includes('/api/v1/blocks')) {
      // Node A's newest block is two hours old, so A's answer reads as stale.
      const ageS = base === NODE_A ? 7200 : 0;
      return ok([{ height: TIP[base], timestamp: Date.now() / 1000 - ageS, tx_count: 3000, size: 1_000_000, weight: 4_000_000, extras: { medianFee: 5, pool: { name: 'Foundry' } } }]);
    }
    return defaultRouter(path);
  };
  const countPath = (needle) =>
    global.fetch.mock.calls.filter(([u]) => decodeURIComponent(String(u)).includes(needle)).length;
  const prefs = base => ({ baseUrl: base, fallbackToPublic: false });

  it('a Save that changes both the mempool URL and the chain interval fetches chain stats once', async () => {
    const savedInterval = CONFIG.REFRESH_INTERVALS.chain;
    try {
      global.fetch = vi.fn().mockImplementation(async url => nodeRouter(url));
      const { result, rerender } = renderHook(({ p }) => useChain(p), { initialProps: { p: prefs(NODE_A) } });
      await waitFor(() => expect(result.current.data?.height).toBe(TIP[NODE_A]));
      const before = countPath('/api/blocks/tip/height');
      expect(before).toBe(1);

      CONFIG.REFRESH_INTERVALS.chain = savedInterval * 2;
      rerender({ p: prefs(NODE_B) });
      await waitFor(() => expect(result.current.data?.height).toBe(TIP[NODE_B]));
      await new Promise(r => setTimeout(r, 50));
      expect(countPath('/api/blocks/tip/height') - before).toBe(1);
    } finally {
      CONFIG.REFRESH_INTERVALS.chain = savedInterval;
    }
  });

  it('a Save that changes both the mempool URL and the pools interval fetches the pools once', async () => {
    const savedInterval = CONFIG.REFRESH_INTERVALS.pools;
    try {
      global.fetch = vi.fn().mockImplementation(async url => nodeRouter(url));
      const { result, rerender } = renderHook(({ p }) => useChain(p), { initialProps: { p: prefs(NODE_A) } });
      await waitFor(() => expect(result.current.pools[0]?.name).toBe(`Pool ${NODE_A}`));
      const before = countPath('/api/v1/mining/pools/1w');
      expect(before).toBe(1);

      CONFIG.REFRESH_INTERVALS.pools = savedInterval * 2;
      rerender({ p: prefs(NODE_B) });
      await waitFor(() => expect(result.current.pools[0]?.name).toBe(`Pool ${NODE_B}`));
      await new Promise(r => setTimeout(r, 50));
      expect(countPath('/api/v1/mining/pools/1w') - before).toBe(1);
    } finally {
      CONFIG.REFRESH_INTERVALS.pools = savedInterval;
    }
  });

  it('after an interval-only Save, a URL-only Save still fetches both from the new node', async () => {
    const saved = { ...CONFIG.REFRESH_INTERVALS };
    try {
      global.fetch = vi.fn().mockImplementation(async url => nodeRouter(url));
      const { result, rerender } = renderHook(({ p }) => useChain(p), { initialProps: { p: prefs(NODE_A) } });
      await waitFor(() => expect(result.current.pools.length).toBe(1));

      CONFIG.REFRESH_INTERVALS.chain = saved.chain * 2;
      CONFIG.REFRESH_INTERVALS.pools = saved.pools * 2;
      rerender({ p: prefs(NODE_A) });
      await waitFor(() => expect(countPath('/api/v1/mining/pools/1w')).toBe(2));

      const chainBefore = countPath('/api/blocks/tip/height');
      const poolsBefore = countPath('/api/v1/mining/pools/1w');
      rerender({ p: prefs(NODE_B) });
      await waitFor(() => expect(result.current.data?.height).toBe(TIP[NODE_B]));
      await waitFor(() => expect(result.current.pools[0]?.name).toBe(`Pool ${NODE_B}`));
      expect(countPath('/api/blocks/tip/height') - chainBefore).toBe(1);
      expect(countPath('/api/v1/mining/pools/1w') - poolsBefore).toBe(1);
    } finally {
      Object.assign(CONFIG.REFRESH_INTERVALS, saved);
    }
  });

  // A refresh against node A hangs on the network, a Save switches to node B and
  // B answers at once, then A's answers land late. `fail` makes A's answers errors;
  // `only` holds back just the requests whose path contains it.
  async function lateOldNode({ fail = false, only = '' } = {}) {
    let hold = false;
    const held = [];
    global.fetch = vi.fn().mockImplementation(async (url) => {
      const resp = nodeRouter(url);
      if (!hold || !decodeURIComponent(String(url)).includes(only)) return resp;
      return new Promise((res, rej) => held.push(() => (fail ? rej(new TypeError('network')) : res(resp))));
    });
    const hook = renderHook(({ p }) => useChain(p), { initialProps: { p: prefs(NODE_A) } });
    const { result, rerender } = hook;
    await waitFor(() => expect(result.current.pools[0]?.name).toBe(`Pool ${NODE_A}`));

    hold = true;
    act(() => { result.current.refresh(); });
    await waitFor(() => expect(held.length).toBeGreaterThan(0));
    await new Promise(r => setTimeout(r, 20));

    hold = false;
    rerender({ p: prefs(NODE_B) });
    await waitFor(() => expect(result.current.data?.height).toBe(TIP[NODE_B]));
    await waitFor(() => expect(result.current.pools[0]?.name).toBe(`Pool ${NODE_B}`));

    await act(async () => { held.forEach(f => f()); await new Promise(r => setTimeout(r, 50)); });
    return result;
  }

  it('chain stats from the old node still in flight at Save cannot overwrite the new node', async () => {
    const result = await lateOldNode();
    expect(result.current.data.height).toBe(TIP[NODE_B]);
  });

  it('pools from the old node still in flight at Save cannot overwrite the new node', async () => {
    const result = await lateOldNode();
    expect(result.current.pools[0].name).toBe(`Pool ${NODE_B}`);
    expect(result.current.stale).toBe(false);
  });

  it('a Save during the old node\'s pool-blocks request cannot overwrite the new node', async () => {
    const result = await lateOldNode({ only: '/api/v1/mining/pool/foundry/blocks' });
    expect(result.current.pools[0].name).toBe(`Pool ${NODE_B}`);
  });

  it('a late failure from the old node does not mark the new node as failed', async () => {
    const result = await lateOldNode({ fail: true });
    expect(result.current.error).toBe(false);
  });
});
