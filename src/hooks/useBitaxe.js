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
 *   miners:   array of { ip, online, data? } from the server (last good list kept on fetch error)
 *   err:      true when the fetch fails or every miner is offline
 *   fetchFailed: true when the last fetch failed, so `miners` is the retained (stale) list;
 *             tells a failed fetch apart from a fresh all-offline fleet, which also sets err
 *   loading:  true until the first response (success or fail)
 *   lastOk:   timestamp of the last successful fetch (null until first success)
 *   interval: refresh interval in ms (for feed-health tracking)
 *   latestFirmware: latest ESP-Miner release tag from /api/firmware, or null
 *   refresh:  manual refresh trigger
 * }
 */
export function useBitaxe() {
  const [miners, setMiners] = React.useState([]);
  const [err, setErr] = React.useState(false);
  const [fetchFailed, setFetchFailed] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [lastOk, setLastOk] = React.useState(null);
  const [latestFirmware, setLatestFirmware] = React.useState(null);

  const fetchBitaxe = React.useCallback(async () => {
    try {
      const r = await fetch('/api/miners', { signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = await r.json();
      const list = Array.isArray(body.miners) ? body.miners : [];
      setMiners(list);
      setErr(list.length > 0 && list.every(m => !m.online));
      setFetchFailed(false);
      setLastOk(Date.now());
    } catch {
      // Transient failure: keep the last good miners and lastOk so consumers
      // degrade to stale instead of blanking.
      setErr(true);
      setFetchFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const { reset: resetBitaxe } = useResettableInterval(fetchBitaxe, CONFIG.REFRESH_INTERVALS.bitaxe);

  // Kept out of err/lastOk: a failed release lookup only hides the update badge.
  const fetchFirmware = React.useCallback(async () => {
    try {
      const r = await fetch('/api/firmware', { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return;
      const body = await r.json();
      setLatestFirmware(typeof body.latest === 'string' ? body.latest : null);
    } catch { /* keep the last known value */ }
  }, []);

  useResettableInterval(fetchFirmware, CONFIG.REFRESH_INTERVALS.firmware);

  return {
    miners,
    err,
    fetchFailed,
    loading,
    lastOk,
    interval: CONFIG.REFRESH_INTERVALS.bitaxe,
    refresh: resetBitaxe,
    latestFirmware,
  };
}
