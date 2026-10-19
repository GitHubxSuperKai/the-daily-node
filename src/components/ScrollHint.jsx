import React from 'react';
import { useT } from '../theme';

// A scroll region with the scrollbar hidden. Overflow is signalled instead by a
// fade on whichever edge has more content (a CSS mask, so it works in both themes)
// and a small "More" cue that scrolls down when clicked. The edges are measured,
// not guessed: on mount, on scroll, and whenever the region or its content resizes.
// Sizes live in the .scroll-hint / .scroll-more CSS (index.html), not u(), because
// SettingsPanel renders this in the mobile layout too.
export function ScrollHint({ children, style, label = 'More' }) {
  const T = useT();
  const scrollRef = React.useRef(null);
  const contentRef = React.useRef(null);
  const [edges, setEdges] = React.useState({ above: false, below: false });

  const measure = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const above = el.scrollTop > 2;
    const below = el.scrollHeight - el.scrollTop - el.clientHeight > 2;
    setEdges(prev => (prev.above === above && prev.below === below ? prev : { above, below }));
  }, []);

  React.useEffect(() => {
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(scrollRef.current);
    ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const scrollMore = () => {
    const el = scrollRef.current;
    if (el) el.scrollBy({ top: el.clientHeight * 0.8, behavior: 'smooth' });
  };

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, ...style }}>
      <div
        ref={scrollRef}
        className="scroll-hint"
        tabIndex={0}
        data-more-above={edges.above ? '' : undefined}
        data-more-below={edges.below ? '' : undefined}
        onScroll={measure}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
      >
        <div ref={contentRef}>{children}</div>
      </div>
      {edges.below && (
        <button
          type="button"
          className="scroll-more"
          tabIndex={-1}
          onClick={scrollMore}
          style={{ color: T.ink3, background: T.paper, fontFamily: T.sans }}
        >
          {label} ↓
        </button>
      )}
    </div>
  );
}

export default ScrollHint;
