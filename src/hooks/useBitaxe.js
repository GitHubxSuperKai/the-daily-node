import { useState, useEffect, useRef, useCallback } from 'react';
import CONFIG from '../config.js';
import { useResettableInterval } from './useResettableInterval.js';

/**
 * useBitaxe Hook
 * Fetches BitAxe miner data from API or direct IP polling
 *
 * Returns: {
 *   miners: array of miner objects with { ip, online, data? },
 *   err: boolean (true if all miners are offline),
 *   loading: boolean,
 *   lastOk: timestamp or null,
 *   interval: number (for feed health tracking)
 * }
 */
export function useBitaxe(apiUrl, ips) {
  const [miners, setMiners] = useState([]);
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastOk, setLastOk] = useState(null);

  const fetchBitaxe = useCallback(async () => {
    let next;
    if (apiUrl) {
      try {
        const r = await fetch(apiUrl, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) throw new Error('api');
        const body = await r.json();
        next = body.miners;
      } catch {
        next = ips.map(ip => ({ ip, online: false }));
      }
    } else {
      const results = await Promise.allSettled(
        ips.map(async ip => {
          const r = await fetch(`http://${ip}/api/system/info`, { signal: AbortSignal.timeout(5000) });
          if (!r.ok) throw new Error('bitaxe');
          const data = await r.json();
          return { ip, online: true, data };
        })
      );
      next = results.map((r, i) =>
        r.status === 'fulfilled' ? r.value : { ip: ips[i], online: false }
      );
    }
    setMiners(next);
    setErr(next.every(m => !m.online));
    setLoading(false);
    setLastOk(Date.now());
  }, [apiUrl, ips.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const { reset: resetBitaxe } = useResettableInterval(fetchBitaxe, CONFIG.REFRESH_INTERVALS.bitaxe);

  // Re-fetch immediately when API URL or IPs change (preserves original behavior)
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) { hasMountedRef.current = true; return; }
    resetBitaxe();
  }, [apiUrl, ips.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    miners,
    err,
    loading,
    lastOk,
    interval: CONFIG.REFRESH_INTERVALS.bitaxe,
    refresh: resetBitaxe,
  };
}
