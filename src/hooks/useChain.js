import { useState, useEffect, useCallback } from 'react';
import CONFIG from '../config.js';
import { fetchChainStats, fetchMiningPools, fetchPoolBlocks, fetchRecentBlocks, fetchMempoolBlocks } from '../utils/api.js';
import { fmtMempoolMB, nextHalving, circulatingBTC } from '../utils/format.js';

/**
 * useChain Hook
 * Fetches Bitcoin chain vitals from Mempool.space
 *
 * Returns: {
 *   data: object with chain stats or null,
 *   pools: [{ name, slug, blockCount, sharePct }],
 *   topPoolBlocks: [{ height, timestamp, txCount }],
 *   recentBlocks: [{ height, timestamp, txCount, size, medianFee, poolName }],
 *   mempoolBlocks: [{ nTx, medianFee, feeRange }],
 *   loading: boolean,
 *   error: boolean,
 *   lastOk: number (timestamp) or null
 * }
 */
export function useChain() {
  const [data, setData] = useState(null);
  const [extData, setExtData] = useState({ pools: [], topPoolBlocks: [], recentBlocks: [], mempoolBlocks: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastOk, setLastOk] = useState(null);

  const fetchChain = useCallback(async () => {
    try {
      const chainData = await fetchChainStats();

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
  }, []);

  const fetchExtended = useCallback(async () => {
    try {
      const [pools, recentBlocks, mempoolBlocks] = await Promise.all([
        fetchMiningPools(),
        fetchRecentBlocks(),
        fetchMempoolBlocks(),
      ]);

      let topPoolBlocks = [];
      if (pools.length > 0) {
        topPoolBlocks = await fetchPoolBlocks(pools[0].slug);
      }

      setExtData({ pools, topPoolBlocks, recentBlocks, mempoolBlocks });
    } catch (err) {
      console.error('fetchExtended error:', err);
    }
  }, []);

  useEffect(() => {
    fetchChain();
    const id = setInterval(fetchChain, CONFIG.REFRESH_INTERVALS.chain);
    return () => clearInterval(id);
  }, [fetchChain]);

  useEffect(() => {
    fetchExtended();
    const id = setInterval(fetchExtended, CONFIG.REFRESH_INTERVALS.pools);
    return () => clearInterval(id);
  }, [fetchExtended]);

  return {
    data,
    ...extData,
    loading,
    error,
    lastOk,
  };
}
