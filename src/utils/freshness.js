// Pure per-source freshness verdict: 'fresh' | 'stale' | 'down'
//
// down  — no trustworthy data to show (never loaded, or errored with no cache)
// stale — data is showing but old/suspect: last fetch errored, fetch age past
//         2x interval, or the content clock (e.g. chain block timestamp) is old
// fresh — data is showing and current
function sourceFreshness({ hasData, err, lastOk, interval, contentAgeMs, contentMaxMs }, now = Date.now()) {
  if (!hasData) return 'down';

  const fetchAge = lastOk ? now - lastOk : Infinity;
  const fetchStale = fetchAge > (interval || 60000) * 2;
  const contentStale =
    contentAgeMs != null && contentMaxMs != null && contentAgeMs > contentMaxMs;

  if (err || fetchStale || contentStale) return 'stale';
  return 'fresh';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sourceFreshness };
}
