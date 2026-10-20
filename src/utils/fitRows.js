import React from 'react';

// How many rows of a list fit in a region whose height comes from flex, not from its
// content (the desktop sidebar's Alerts list fills whatever the rail has left).
//
// regionPx: the region's height; headerPx: everything above the first row; rowPx: one
// row's height; count: rows available. Returns how many to render, at most `count`.
// Partial rows round down. Unusable measurements (no layout, as in jsdom) return
// `fallback`, which defaults to every row.
export function fitRowCount({ regionPx, headerPx, rowPx, count, fallback = count }) {
  if (![regionPx, headerPx, rowPx].every(Number.isFinite) || regionPx <= 0 || rowPx <= 0) {
    return fallback;
  }
  return Math.max(0, Math.min(count, Math.floor((regionPx - headerPx) / rowPx)));
}

// Measures `ref` (the region) and the first `[data-fit-row]` inside it, and returns how
// many of `count` rows fit (see fitRowCount). Rows must share one height. Rendering fewer
// rows doesn't change the region's height, so the next measurement agrees with this one.
// The caller must keep the first row laid out even when 0 fit (visibility: hidden, not
// display: none), or there is nothing to measure next time.
export function useFitRows(ref, count) {
  const [fit, setFit] = React.useState(count);
  const observer = React.useRef(null);
  const observedRow = React.useRef(null);
  const measure = React.useCallback(() => {
    const region = ref.current;
    const row = region && region.querySelector('[data-fit-row]');
    if (!row) return;
    const rowRect = row.getBoundingClientRect();
    const regionRect = region.getBoundingClientRect();
    const next = fitRowCount({
      regionPx: regionRect.height,
      headerPx: rowRect.top - regionRect.top,
      rowPx: rowRect.height,
      count,
    });
    setFit(prev => (prev === next ? prev : next));
  }, [ref, count]);

  React.useLayoutEffect(() => {
    measure();
    if (typeof ResizeObserver === 'undefined' || !ref.current) return undefined;
    // The region resizes when the rail above it changes (an On This Day entry, Weather
    // loading, a late web-font load), which is when the answer changes.
    const ro = new ResizeObserver(measure);
    ro.observe(ref.current);
    observer.current = ro;
    return () => {
      ro.disconnect();
      observer.current = null;
      observedRow.current = null;
    };
  }, [ref, measure]);

  // A row's height can change while the region's doesn't (a web font swapping in), so the
  // first row is observed too. It is re-checked each render: a new alert replaces it.
  React.useLayoutEffect(() => {
    const ro = observer.current;
    const row = ref.current && ref.current.querySelector('[data-fit-row]');
    if (!ro || row === observedRow.current) return;
    if (observedRow.current) ro.unobserve(observedRow.current);
    if (row) ro.observe(row);
    observedRow.current = row;
  });
  return fit;
}
