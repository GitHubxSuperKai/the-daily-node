import { useState, useEffect } from 'react';

// SYNC: must match isMobile check in index.html updateScale() and @media (max-width:900px)
const MOBILE_BREAKPOINT = 900;

export function useLayoutSize() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);

  useEffect(() => {
    const handle = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);

  return { isMobile };
}
