import { useState, useEffect, useCallback } from 'react';
import CONFIG from '../config.js';
import { fetchChainStats } from '../utils/api.js';
import { fmtMempoolMB, nextHalving, circulatingBTC } from '../utils/format.js';

/**
 * useChain Hook
 * Fetches Bitcoin chain vitals from Mempool.space
 *
 * Returns: {
 *   data: object with chain stats or null,
 *   loading: boolean,
 *   error: boolean,
 *   lastOk: number (timestamp) or null
 * }
 */
export function useChain() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastOk, setLastOk] = useState(null);

  const fetchChain = useCallback(async () => {
    try {
      const chainData = await fetchChainStats();

      if (Object.keys(chainData).length === 0) {
        throw new Error('fetchChainStats returned empty');
      }

      // Enrich chain data with calculated fields
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

  useEffect(() => {
    fetchChain();
    const id = setInterval(fetchChain, CONFIG.REFRESH_INTERVALS.chain);
    return () => clearInterval(id);
  }, [fetchChain]);

  return {
    data,
    loading,
    error,
    lastOk,
  };
}
