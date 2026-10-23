import { useState, useEffect, useRef } from 'react';

/**
 * Builds the feed list App hands to useFeedHealth. Exported so tests use the
 * same list instead of a hand copy. useChain reports content staleness as
 * `stale`; useFeedHealth reads `contentStale`.
 */
export function feedHealthInputs({ btc, chain, weather, rss, bitaxe }) {
  return [btc, { ...chain, contentStale: chain.stale }, weather, rss, bitaxe];
}

/**
 * useFeedHealth Hook
 * Monitors health of all feeds (loading, live, degraded, offline)
 *
 * Returns status string: 'loading' | 'live' | 'degraded' | 'offline'
 *
 * Logic:
 * - 'loading': Initial state
 * - 'live': All feeds are recent (lastOk within 2x interval)
 * - 'degraded': Some feeds are stale but not all
 * - 'offline': All feeds are stale
 */
export function useFeedHealth(feeds) {
  const [status, setStatus] = useState('loading');
  const ref = useRef(feeds);
  ref.current = feeds;

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const stale = ref.current.filter(f =>
        !f.lastOk ||
        now - f.lastOk > (f.interval || 60000) * 2 ||
        f.contentStale === true
      ).length;
      if (stale === 0) setStatus('live');
      else if (stale < ref.current.length) setStatus('degraded');
      else setStatus('offline');
    };
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, []);

  return status;
}
