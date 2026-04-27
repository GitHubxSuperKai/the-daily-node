import { useState, useEffect, useRef } from 'react';

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
      const stale = ref.current.filter(f => !f.lastOk || now - f.lastOk > (f.interval || 60000) * 2).length;
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
