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
 *   aged: true while showing this range's own cache that was already due a refetch when the
 *     range was selected (dims it until the refetch lands; timer refetches never set it),
 *   failed: true if a fetch for the selected interval failed since the range was selected
 *     (an older failure is ignored while the re-select's retry is in flight),
 *   refresh: () => void  (bypasses the freshness check)
 * }
 *
 * Identity: the returned object, `points` and `domain` only change when the
 * cache or a failure flag changes (`version`) or the range changes, so the
 * 1 Hz App re-render never hands LineChart a new series.
 */
export function useChartRange(rangeKey) {
  const cache = useRef(new Map()); // interval -> { pts, fetchedAt (request start), windows: rangeKey -> { points, domain } }
  const failedMap = useRef(new Map()); // interval -> seq of its latest failure, 0 once it loads
  // One counter orders failures against selections: a failure only shows if it came after the
  // current range was selected. `at` is the selection time, for the aged check.
  const seq = useRef(0);
  const selected = useRef({ key: rangeKey, seq: 0, at: Date.now() });
  if (selected.current.key !== rangeKey) {
    selected.current = { key: rangeKey, seq: ++seq.current, at: Date.now() };
  }
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
      failedMap.current.set(interval, 0);
      changed = true;
    } catch (e) {
      log.error('chart range fetch failed', interval, e);
      // Re-render only when the failure becomes visible: it was clear, or hidden by a re-select.
      if (!(failedMap.current.get(interval) > selected.current.seq)) changed = true;
      failedMap.current.set(interval, ++seq.current);
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
    const { interval, spanMs, refreshMs } = RANGES[rangeKey];
    const sel = selected.current;
    const failed = (failedMap.current.get(interval) ?? 0) > sel.seq;
    const entry = cache.current.get(interval);
    if (entry) {
      // Window once per (entry, range): 7d and 30d share an entry but not a span, and a
      // failure-flag bump must not re-window into a new array.
      if (!entry.windows[rangeKey]) {
        const domain = [entry.fetchedAt - spanMs, entry.fetchedAt];
        entry.windows[rangeKey] = { points: windowSeries(entry.pts, domain), domain };
      }
      lastGood.current = entry.windows[rangeKey];
      // Same threshold as load(): a cache this old at selection time was refetched by the select.
      const aged = sel.at - entry.fetchedAt >= refreshMs / 2;
      return { ...entry.windows[rangeKey], stale: false, aged, failed, refresh };
    }
    const prev = lastGood.current;
    return { points: prev.points, domain: prev.domain, stale: prev.points != null, aged: false, failed, refresh };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: `version` is the cache/failure-flag change signal; the refs are read when it bumps
  }, [version, rangeKey, refresh]);
}
