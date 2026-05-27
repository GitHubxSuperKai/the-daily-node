import { useState, useCallback } from 'react';
import CONFIG from '../config.js';
import { fetchBTCPrice, fetchBitcoinMeta } from '../utils/api.js';
import { useResettableInterval } from './useResettableInterval.js';
import { log } from '../utils/log.js';

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
  const [btcMeta, setBtcMeta] = useState(null);
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
      if (j.market_caps && j.market_caps.length) {
        setCap(j.market_caps[j.market_caps.length - 1][1]);
      }
    } catch (err) {
      log.error('fetch24hChart error:', err);
    }
  }, []);

  const fetchMeta = useCallback(async () => {
    try {
      const meta = await fetchBitcoinMeta();
      if (Object.keys(meta).length > 0) {
        setBtcMeta(meta);
      }
    } catch (err) {
      log.error('fetchMeta error:', err);
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
      log.error('fetchPrice error:', err);
      setError(true);
      setLoading(false);
    }
  }, []);

  const { reset: resetPrice } = useResettableInterval(fetchPrice,    CONFIG.REFRESH_INTERVALS.price);
  const { reset: resetChart } = useResettableInterval(fetch24hChart, CONFIG.REFRESH_INTERVALS.chart);
  const { reset: resetMeta  } = useResettableInterval(fetchMeta,     CONFIG.REFRESH_INTERVALS.pools);

  const refresh = useCallback(() => {
    resetPrice();
    resetChart();
    resetMeta();
  }, [resetPrice, resetChart, resetMeta]);

  const mergedData = data ? {
    ...data,
    cap,
    ath: btcMeta?.ath ?? null,
    athDate: btcMeta?.athDate ?? null,
    circulatingSupply: btcMeta?.circulatingSupply ?? null,
  } : null;

  return {
    data: mergedData,
    chartPts,
    loading,
    error,
    lastOk,
    refresh,
  };
}
