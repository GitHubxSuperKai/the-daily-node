import React from 'react';

// How many pools a Mining Pools list (the desktop sidebar's, until it moved back into
// Network Status) can name before folding the rest
// into "Others", given the measured height of its region. Returns a `limit` for
// MiningPools, which names `limit` pools plus an Others row, or every pool when
// there are at most `limit + 1` (one extra pool shows by name, not as "Others (1)").
//
// regionPx: the region's height; headerPx: the list's label block (everything above
// the first row); rowPx: one row's height; count: number of pools.
// Returns null (name every pool) when they all fit. When even two rows do not fit,
// returns 1 and leaves the overflow to the ScrollHint around the list.
// Unusable measurements (no layout, as in jsdom) return `fallback`.
export function fitPoolLimit({ regionPx, headerPx, rowPx, count, fallback = 6 }) {
  if (![regionPx, headerPx, rowPx].every(Number.isFinite) || regionPx <= 0 || rowPx <= 0) {
    return fallback;
  }
  const capacity = Math.floor((regionPx - headerPx) / rowPx);
  if (count <= capacity) return null;
  return Math.max(1, capacity - 1);
}

// Measures a pools region and the MiningPools list rendered in it, and returns the
// MiningPools limit that fits (see fitPoolLimit). Unused for now: it sized the desktop
// sidebar pool list (PR #221) and is kept for a later fit-to-height list. The region's
// height comes from flex, not from its content, so a new limit doesn't change what is
// measured next time.
export function usePoolLimit(ref, count) {
  const [limit, setLimit] = React.useState(6);
  const measure = React.useCallback(() => {
    const region = ref.current;
    const list = region && region.querySelector('[data-pool-list]');
    const row = list && list.querySelector('[data-pool-row]');
    if (!row) return;
    const rowRect = row.getBoundingClientRect();
    const next = fitPoolLimit({
      regionPx: region.getBoundingClientRect().height,
      headerPx: rowRect.top - list.getBoundingClientRect().top,
      rowPx: rowRect.height,
      count,
    });
    setLimit(prev => (prev === next ? prev : next));
  }, [ref, count]);

  React.useLayoutEffect(() => {
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    // The list is observed too, so a late web-font load that changes the row
    // height re-measures. A new limit resizes the list but measures the same.
    const ro = new ResizeObserver(measure);
    ro.observe(ref.current);
    const list = ref.current.querySelector('[data-pool-list]');
    if (list) ro.observe(list);
    return () => ro.disconnect();
  }, [ref, measure]);
  return limit;
}
