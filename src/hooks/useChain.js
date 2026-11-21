import React from 'react';
import { useResettableInterval } from './useResettableInterval.js';
import CONFIG from '../config.js';
import { fetchChainStats, fetchMiningPools, fetchPoolBlocks, fetchRecentBlocks, fetchMempoolBlocks } from '../utils/api.js';
import { fmtMempoolMB, nextHalving, circulatingBTC } from '../utils/formatting.js';
import { log } from '../utils/log.js';

/**
 * useChain Hook
 * Fetches Bitcoin chain vitals from Mempool.space
 *
 * @param {object} mempoolPrefs - { baseUrl: string, fallbackToPublic: boolean }
 *
 * Returns: {
 *   data: object with chain stats or null,
 *   pools: [{ name, slug, blockCount, sharePct }],
 *   topPoolBlocks: [{ height, timestamp, txCount }],
 *   recentBlocks: [{ height, timestamp, txCount, size, medianFee, poolName }],
 *   mempoolBlocks: [{ nTx, medianFee, feeRange }],
 *   stale: boolean,
 *   loading: boolean,
 *   error: boolean,
 *   lastOk: number (timestamp) or null
 * }
 */
export function useChain(mempoolPrefs = {}) {
  const [data, setData] = React.useState(null);
  const [extData, setExtData] = React.useState({ pools: [], topPoolBlocks: [], recentBlocks: [], mempoolBlocks: [] });
  const [stale, setStale] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [lastOk, setLastOk] = React.useState(null);

  // The mempool prefs the dashboard uses now. A fetch drops its result if a Save
  // changed them while it was out. The api.js fetchers catch their own errors and
  // return defaults, so a stale fetch reaches the catch blocks below only through
  // code after these checks.
  const prefsKey = JSON.stringify([mempoolPrefs.baseUrl, mempoolPrefs.fallbackToPublic]);
  const currentPrefs = React.useRef(prefsKey);
  currentPrefs.current = prefsKey;

  const fetchChain = React.useCallback(async () => {
    const fetchedFor = JSON.stringify([mempoolPrefs.baseUrl, mempoolPrefs.fallbackToPublic]);
    try {
      const chainData = await fetchChainStats({
        baseUrl: mempoolPrefs.baseUrl,
        fallbackToPublic: mempoolPrefs.fallbackToPublic,
      });
      if (currentPrefs.current !== fetchedFor) return;

      if (Object.keys(chainData).length === 0) {
        throw new Error('fetchChainStats returned empty');
      }

      const enrichedData = {
        ...chainData,
        mempoolMB: fmtMempoolMB(chainData.mempoolBytes),
        nextHalvingDate: nextHalving(chainData.height),
        circulating: circulatingBTC(chainData.height),
      };

      setData(enrichedData);
      setError(false);
      setLastOk(Date.now());
      setLoading(false);
    } catch (err) {
      log.error('fetchChain error:', err);
      setError(true);
      setLoading(false);
    }
  }, [mempoolPrefs.baseUrl, mempoolPrefs.fallbackToPublic]);

  const fetchExtended = React.useCallback(async () => {
    const fetchedFor = JSON.stringify([mempoolPrefs.baseUrl, mempoolPrefs.fallbackToPublic]);
    try {
      const [poolsResult, recentResult, mempoolBlocks] = await Promise.all([
        fetchMiningPools({ baseUrl: mempoolPrefs.baseUrl, fallbackToPublic: mempoolPrefs.fallbackToPublic }),
        fetchRecentBlocks({ baseUrl: mempoolPrefs.baseUrl, fallbackToPublic: mempoolPrefs.fallbackToPublic }),
        fetchMempoolBlocks({ baseUrl: mempoolPrefs.baseUrl, fallbackToPublic: mempoolPrefs.fallbackToPublic }),
      ]);
      if (currentPrefs.current !== fetchedFor) return;

      const pools = poolsResult;
      const recentBlocks = recentResult.blocks;
      setStale(recentResult.stale);

      let topPoolBlocks = [];
      if (pools.length > 0) {
        topPoolBlocks = await fetchPoolBlocks(pools[0].slug, { baseUrl: mempoolPrefs.baseUrl, fallbackToPublic: mempoolPrefs.fallbackToPublic });
        if (currentPrefs.current !== fetchedFor) return;
      }

      setExtData({ pools, topPoolBlocks, recentBlocks, mempoolBlocks });
    } catch (err) {
      log.error('fetchExtended error:', err);
      setStale(false);
    }
  }, [mempoolPrefs.baseUrl, mempoolPrefs.fallbackToPublic]);

  const chainInterval = CONFIG.REFRESH_INTERVALS.chain;
  const poolsInterval = CONFIG.REFRESH_INTERVALS.pools;
  const { reset: resetChain    } = useResettableInterval(fetchChain,    chainInterval);
  const { reset: resetExtended } = useResettableInterval(fetchExtended, poolsInterval);

  // Re-fetch immediately when mempoolPrefs change (new baseUrl saved in settings).
  // The mount fetch is useResettableInterval's. When the same Save also changed an
  // interval, that interval's useResettableInterval has already fetched with the new
  // prefs, so skip that fetch here. The intervals are recorded before the early
  // return, so an interval-only Save does not leave the refs stale.
  const lastPrefsKey = React.useRef(prefsKey);
  const lastChainInterval = React.useRef(chainInterval);
  const lastPoolsInterval = React.useRef(poolsInterval);
  React.useEffect(() => {
    const chainChanged = lastChainInterval.current !== chainInterval;
    const poolsChanged = lastPoolsInterval.current !== poolsInterval;
    lastChainInterval.current = chainInterval;
    lastPoolsInterval.current = poolsInterval;
    if (lastPrefsKey.current === prefsKey) return;
    lastPrefsKey.current = prefsKey;
    if (!chainChanged) fetchChain();
    if (!poolsChanged) fetchExtended();
  }, [prefsKey, chainInterval, poolsInterval, fetchChain, fetchExtended]);

  const refresh = React.useCallback(() => {
    resetChain();
    resetExtended();
  }, [resetChain, resetExtended]);

  return {
    data,
    ...extData,
    stale,
    loading,
    error,
    lastOk,
    refresh,
    interval: chainInterval,
  };
}
