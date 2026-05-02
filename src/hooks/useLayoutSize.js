import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 900;

export function useLayoutSize() {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    isMobile: window.innerWidth < MOBILE_BREAKPOINT,
  }));

  useEffect(() => {
    const obs = new ResizeObserver(() => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setSize({ width: w, height: h, isMobile: w < MOBILE_BREAKPOINT });
    });
    obs.observe(document.documentElement);
    return () => obs.disconnect();
  }, []);

  return size;
}
