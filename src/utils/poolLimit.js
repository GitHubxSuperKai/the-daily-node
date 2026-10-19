// How many pools the sidebar's Mining Pools list can name before folding the rest
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
