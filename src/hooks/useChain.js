import React from 'react';
import { useResettableInterval } from './useResettableInterval.js';
import CONFIG from '../config.js';
import { fetchChainStats, fetchMiningPools, fetchPoolBlocks, fetchRecentBlocks, fetchMempoolBlocks } from '../utils/api.js';
import { fmtMempoolMB, nextHalving, circulatingBTC } from '../utils/formatting.js';

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

  const fetchChain = React.useCallback(async () => {
    try {
      const chainData = await fetchChainStats({
        baseUrl: mempoolPrefs.baseUrl,
        fallbackToPublic: mempoolPrefs.fallbackToPublic,
      });

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
      console.error('fetchChain error:', err);
      setError(true);
      setLoading(false);
    }
  }, [mempoolPrefs.baseUrl, mempoolPrefs.fallbackToPublic]);

  const fetchExtended = React.useCallback(async () => {
    try {
      const [poolsResult, recentResult, mempoolBlocks] = await Promise.all([
        fetchMiningPools({ baseUrl: mempoolPrefs.baseUrl, fallbackToPublic: mempoolPrefs.fallbackToPublic }),
        fetchRecentBlocks({ baseUrl: mempoolPrefs.baseUrl, fallbackToPublic: mempoolPrefs.fallbackToPublic }),
        fetchMempoolBlocks({ baseUrl: mempoolPrefs.baseUrl, fallbackToPublic: mempoolPrefs.fallbackToPublic }),
      ]);

      const pools = poolsResult;
      const recentBlocks = recentResult.blocks;
      setStale(recentResult.stale);

      let topPoolBlocks = [];
      if (pools.length > 0) {
        topPoolBlocks = await fetchPoolBlocks(pools[0].slug, { baseUrl: mempoolPrefs.baseUrl, fallbackToPublic: mempoolPrefs.fallbackToPublic });
      }

      setExtData({ pools, topPoolBlocks, recentBlocks, mempoolBlocks });
    } catch (err) {
      console.error('fetchExtended error:', err);
    }
  }, [mempoolPrefs.baseUrl, mempoolPrefs.fallbackToPublic]);

  const { reset: resetChain    } = useResettableInterval(fetchChain,    CONFIG.REFRESH_INTERVALS.chain);
  const { reset: resetExtended } = useResettableInterval(fetchExtended, CONFIG.REFRESH_INTERVALS.pools);

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
  };
}
