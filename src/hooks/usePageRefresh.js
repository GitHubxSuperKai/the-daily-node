import { useEffect, useRef } from 'react';
import CONFIG from '../config.js';

/**
 * usePageRefresh
 *
 * Triggers an immediate staggered refresh of all feeds on two events:
 *   1. Tab becomes visible after being hidden for >= HIDDEN_STALE_THRESHOLD (30s)
 *   2. Network comes back online (window 'online' event)
 *
 * Staggering prevents a thundering herd against external APIs.
 */
export function usePageRefresh(refreshFns) {
  const hiddenAtRef = useRef(null);
  const fnsRef = useRef(refreshFns);
  fnsRef.current = refreshFns;

  useEffect(() => {
    const threshold = CONFIG.HIDDEN_STALE_THRESHOLD ?? 30_000;
    const stagger   = CONFIG.REFRESH_STAGGER_MS    ?? 100;

    function runAll() {
      fnsRef.current.forEach((fn, i) =>
        setTimeout(() => typeof fn === 'function' && fn(), i * stagger)
      );
    }

    function onVisibility() {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else {
        const was = hiddenAtRef.current;
        hiddenAtRef.current = null;
        if (was !== null && Date.now() - was >= threshold) runAll();
      }
    }

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', runAll);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', runAll);
    };
  }, []);
}
