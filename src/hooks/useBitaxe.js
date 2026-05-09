import React from 'react';
import CONFIG from '../config.js';
import { useResettableInterval } from './useResettableInterval.js';

/**
 * useBitaxe — fetches the BitAxe fleet from the same-origin API server.
 *
 * The dashboard is always served by bitaxe_api.py (Docker or local), so /api/miners
 * is reachable same-origin. Direct-poll-by-IP from the browser is no longer supported.
 *
 * Returns: {
 *   miners:   array of { ip, online, data? } from the server
 *   err:      true when the fetch fails or every miner is offline
 *   loading:  true until the first response (success or fail)
 *   lastOk:   timestamp of the last successful fetch (null until first success)
 *   interval: refresh interval in ms (for feed-health tracking)
 *   refresh:  manual refresh trigger
 * }
 */
export function useBitaxe() {
  const [miners, setMiners] = React.useState([]);
  const [err, setErr] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [lastOk, setLastOk] = React.useState(null);

  const fetchBitaxe = React.useCallback(async () => {
    try {
      const r = await fetch('/api/miners', { signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = await r.json();
      const list = Array.isArray(body.miners) ? body.miners : [];
      setMiners(list);
      setErr(list.length > 0 && list.every(m => !m.online));
      setLastOk(Date.now());
    } catch {
      setMiners([]);
      setErr(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const { reset: resetBitaxe } = useResettableInterval(fetchBitaxe, CONFIG.REFRESH_INTERVALS.bitaxe);

  return {
    miners,
    err,
    loading,
    lastOk,
    interval: CONFIG.REFRESH_INTERVALS.bitaxe,
    refresh: resetBitaxe,
  };
}
