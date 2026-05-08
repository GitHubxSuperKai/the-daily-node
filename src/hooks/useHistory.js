const HISTORY_BASE   = 'http://127.0.0.1:3002';
const RANGE_SECONDS  = { '1h': 3600, '24h': 86400, '7d': 604800 };
const RANGE_BUCKET   = { '1h': 'min', '24h': 'min', '7d': 'hour' };

function useHistory(metric, range) {
  const [state, setState] = React.useState({ data: [], loading: true, error: null });

  React.useEffect(() => {
    let cancelled = false;
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
      .then(data => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch(err => { if (!cancelled) setState({ data: [], loading: false, error: err.message }); });

    return () => { cancelled = true; };
  }, [metric, range]);

  return state;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { useHistory };
}
