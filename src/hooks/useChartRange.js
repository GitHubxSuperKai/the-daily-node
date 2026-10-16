import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import CONFIG from '../config.js';
import { RANGES, normKrakenOHLC, windowSeries } from '../utils/chartRange.js';
import { useResettableInterval } from './useResettableInterval.js';
import { log } from '../utils/log.js';

/**
 * useChartRange
 * Kraken OHLC series for the selected chart range, cached per Kraken interval
 * (7d and 30d share the 60-minute interval).
 *
 * Returns: {
 *   points: array of [ms, price] windowed to the range, or null,
 *   domain: [startMs, endMs] or null,
 *   stale: true while showing the previous range's points (selected interval not loaded yet),
 *   failed: true if the latest fetch for the selected interval failed,
 *   refresh: () => void  (bypasses the freshness check)
 * }
 *
 * Identity: the returned object, `points` and `domain` only change when the
 * cache or a failure flag changes (`version`) or the range changes, so the
 * 1 Hz App re-render never hands LineChart a new series.
 */
export function useChartRange(rangeKey) {
  const cache = useRef(new Map()); // interval -> { pts, fetchedAt (request start), windows: rangeKey -> { points, domain } }
  const failedMap = useRef(new Map()); // interval -> boolean
  const inFlight = useRef(new Set());
  const lastGood = useRef({ points: null, domain: null });
  const mounted = useRef(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async (key, force) => {
    const { interval, refreshMs } = RANGES[key];
    if (inFlight.current.has(interval)) return;
    const entry = cache.current.get(interval);
    if (!force && entry && Date.now() - entry.fetchedAt < refreshMs / 2) return;
    inFlight.current.add(interval);
    const fetchedAt = Date.now();
    let changed = false;
    try {
      const r = await fetch(`${CONFIG.KRAKEN_OHLC}${interval}`, { signal: AbortSignal.timeout(CONFIG.FETCH_TIMEOUT) });
      if (!r.ok) throw new Error(`${r.status}`);
      const pts = normKrakenOHLC(await r.json());
      cache.current.set(interval, { pts, fetchedAt, windows: {} });
      failedMap.current.set(interval, false);
      changed = true;
    } catch (e) {
      log.error('chart range fetch failed', interval, e);
      if (!failedMap.current.get(interval)) {
        failedMap.current.set(interval, true);
        changed = true;
      }
    } finally {
      inFlight.current.delete(interval);
    }
    if (changed && mounted.current) setVersion((v) => v + 1);
  }, []);

  const fetchSelected = () => load(rangeKey, false);
  const { reset } = useResettableInterval(fetchSelected, RANGES[rangeKey].refreshMs);

  useEffect(() => {
    load(rangeKey, false);
  }, [rangeKey, load]);

  // The forced load registers as in flight synchronously, so reset()'s immediate callback is
  // deduped; reset() restarts the timer so a tick right after a refresh is not skipped as fresh.
  const refresh = useCallback(() => { load(rangeKey, true); reset(); }, [rangeKey, load, reset]);

  return useMemo(() => {
    const { interval, spanMs } = RANGES[rangeKey];
    const failed = !!failedMap.current.get(interval);
    const entry = cache.current.get(interval);
    if (entry) {
      // Window once per (entry, range): 7d and 30d share an entry but not a span, and a
      // failure-flag bump must not re-window into a new array.
      if (!entry.windows[rangeKey]) {
        const domain = [entry.fetchedAt - spanMs, entry.fetchedAt];
        entry.windows[rangeKey] = { points: windowSeries(entry.pts, domain), domain };
      }
      lastGood.current = entry.windows[rangeKey];
      return { ...entry.windows[rangeKey], stale: false, failed, refresh };
    }
    const prev = lastGood.current;
    return { points: prev.points, domain: prev.domain, stale: prev.points != null, failed, refresh };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: `version` is the cache/failure-flag change signal; the refs are read when it bumps
  }, [version, rangeKey, refresh]);
}
