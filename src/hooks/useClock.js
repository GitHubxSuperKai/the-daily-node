import { useState, useEffect } from 'react';
import CONFIG from '../config.js';

/**
 * useClock Hook
 * Returns formatted time string that updates every second
 *
 * Returns: {
 *   timeHM: string (e.g., "14:30" or "2:30"),
 *   timeSec: string (e.g., ":45"),
 *   amPm: string (e.g., "PM" or ""),
 *   dayStr: string (e.g., "Monday, January 15"),
 *   dateShort: string (e.g., "2026-01-15"),
 *   loading: boolean,
 *   error: boolean
 * }
 */
export function useClock(timeFormat = '24h') {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), CONFIG.REFRESH_INTERVALS.clock);
    return () => clearInterval(id);
  }, []);

  const pad = (n) => String(n).padStart(2, '0');
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const h = now.getHours();
  const m = now.getMinutes();
  const amPm = timeFormat === '12h' ? (h < 12 ? 'AM' : 'PM') : '';
  const dispH = timeFormat === '12h' ? String(h % 12 || 12) : pad(h);

  return {
    timeHM: `${dispH}:${pad(m)}`,
    timeSec: `:${pad(now.getSeconds())}`,
    amPm,
    dayStr: `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`,
    dateShort: now.toISOString().slice(0, 10),
    loading: false,
    error: false,
  };
}
