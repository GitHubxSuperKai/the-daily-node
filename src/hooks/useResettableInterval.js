import { useEffect, useRef, useCallback } from 'react';

/**
 * useResettableInterval
 *
 * Like setInterval, but exposes a reset() that clears the current interval,
 * fetches immediately, and starts a fresh one. This prevents double-fetching
 * shortly after a manual refresh.
 */
export function useResettableInterval(callback, delay) {
  const idRef = useRef(null);
  const cbRef = useRef(callback);
  cbRef.current = callback;

  const start = useCallback(() => {
    if (idRef.current) clearInterval(idRef.current);
    idRef.current = setInterval(() => cbRef.current(), delay);
  }, [delay]);

  const reset = useCallback(() => {
    cbRef.current();
    start();
  }, [start]);

  useEffect(() => {
    cbRef.current();
    start();
    return () => { if (idRef.current) clearInterval(idRef.current); };
  }, [start]);

  return { reset };
}
