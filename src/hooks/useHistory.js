const HISTORY_BASE      = 'http://127.0.0.1:3002';
const RANGE_SECONDS     = { '1h': 3600, '24h': 86400, '7d': 604800 };
const RANGE_BUCKET      = { '1h': 'min', '24h': 'min', '7d': 'hour' };
const HISTORY_REFRESH_MS = 10 * 60 * 1000;

function useHistory(metric, range) {
  const [state, setState] = React.useState({ data: [], loading: true, error: null });

  const fetchHistory = React.useCallback(() => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    const to     = Math.floor(Date.now() / 1000);
    const from   = to - (RANGE_SECONDS[range] ?? 86400);
    const bucket = RANGE_BUCKET[range] ?? 'min';
    const url    = `${HISTORY_BASE}/history/${metric}?from=${from}&to=${to}&bucket=${bucket}`;

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then(data => setState({ data, loading: false, error: null }))
      .catch(err => setState({ data: [], loading: false, error: err.message }));
  }, [metric, range]);

  const { reset } = useResettableInterval(fetchHistory, HISTORY_REFRESH_MS);

  const mounted = React.useRef(false);
  React.useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: reset is stable from useResettableInterval; effect re-runs only on metric/range change
  }, [metric, range]);

  return state;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { useHistory };
}
