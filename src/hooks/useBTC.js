import { useState, useEffect, useCallback } from 'react';
import CONFIG from '../config.js';
import { fetchBTCPrice } from '../utils/api.js';

/**
 * useBTC Hook
 * Fetches BTC price from Kraken (primary) and 24h chart from CoinGecko (silent-fail)
 *
 * Returns: {
 *   data: object with { price, chgAbs, chgPct, hi, lo, vwap, volBtc, cap } or null,
 *   chartPts: array of [timestamp, price] or null,
 *   loading: boolean,
 *   error: boolean,
 *   lastOk: number (timestamp) or null
 * }
 */
export function useBTC() {
  const [data, setData] = useState(null);
  const [cap, setCap] = useState(null);
  const [chartPts, setChartPts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastOk, setLastOk] = useState(null);

  const fetch24hChart = useCallback(async () => {
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1&interval=hourly', {
        signal: AbortSignal.timeout(CONFIG.FETCH_TIMEOUT),
      });
      if (!r.ok) throw new Error('chart');
      const j = await r.json();
      setChartPts(j.prices || null);
      // market_caps is also returned; grab the latest value for display
      if (j.market_caps && j.market_caps.length) {
        setCap(j.market_caps[j.market_caps.length - 1][1]);
      }
    } catch (err) {
      console.error('fetch24hChart error:', err);
    }
  }, []);

  const fetchPrice = useCallback(async () => {
    try {
      const priceData = await fetchBTCPrice();
      if (Object.keys(priceData).length === 0) {
        throw new Error('fetchBTCPrice returned empty');
      }
      setData(priceData);
      setError(false);
      setLastOk(Date.now());
      setLoading(false);
    } catch (err) {
      console.error('fetchPrice error:', err);
      setError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrice();
    fetch24hChart();

    const id1 = setInterval(fetchPrice, CONFIG.REFRESH_INTERVALS.price);
    const id2 = setInterval(fetch24hChart, CONFIG.REFRESH_INTERVALS.price * 2);

    return () => {
      clearInterval(id1);
      clearInterval(id2);
    };
  }, [fetchPrice, fetch24hChart]);

  const mergedData = data ? { ...data, cap } : null;

  return {
    data: mergedData,
    chartPts,
    loading,
    error,
    lastOk,
  };
}
