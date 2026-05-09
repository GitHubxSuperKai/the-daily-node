function MobileLayout({ btc, chain, miners, news, onToggleDark, dark }) {
  const T = useT();

  const sectionStyle = {
    borderTop: `1px solid ${T.ink3}`,
    paddingTop: 12,
    paddingBottom: 12,
  };

  const labelStyle = {
    fontSize: 10,
    fontFamily: T.sans,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: T.ink2,
    marginBottom: 6,
  };

  const rowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  };

  return (
    <div style={{
      width: '100%',
      minHeight: '100vh',
      background: T.paper,
      color: T.ink,
      fontFamily: T.body,
      padding: '12px 16px',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      maxWidth: 480,
      margin: '0 auto',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: `2px solid ${T.ink}` }}>
        <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 700 }}>The Daily Node</div>
        <button
          onClick={onToggleDark}
          style={{ minWidth: 44, minHeight: 44, background: 'transparent', color: T.ink, border: `1px solid ${T.ink3}`, borderRadius: 4, cursor: 'pointer', fontSize: 16 }}
          aria-label="Toggle dark mode"
        >{dark ? '☀' : '☾'}</button>
      </div>

      {/* Price */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Bitcoin</div>
        <div style={{ fontSize: 36, fontWeight: 700, fontFamily: T.display, lineHeight: 1 }}>
          {fmtPrice(btc.data && btc.data.price)}
        </div>
        {btc.data && (
          <div style={{ fontSize: 14, color: btc.data.changePct >= 0 ? T.green : T.red, marginTop: 4 }}>
            {fmtPct(btc.data.changePct)} today
          </div>
        )}
      </div>

      {/* Chain */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Chain</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 13, fontFamily: T.sans }}>
          <div><span style={{ color: T.ink2 }}>Block </span>{chain.data && chain.data.height ? chain.data.height.toLocaleString() : '—'}</div>
          <div><span style={{ color: T.ink2 }}>Hashrate </span>{chain.data ? fmtHashrate(chain.data.hashrate) : '—'}</div>
          <div><span style={{ color: T.ink2 }}>Fast fee </span>{chain.data ? chain.data.fastFee + ' sat/vB' : '—'}</div>
          <div><span style={{ color: T.ink2 }}>Mempool </span>{chain.data && chain.data.mempoolBytes ? (chain.data.mempoolBytes / 1e6).toFixed(1) + ' MB' : '—'}</div>
        </div>
      </div>

      {/* Miners */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Miners</div>
        {miners.loading && <div style={{ color: T.ink2, fontSize: 13 }}>Loading…</div>}
        {!miners.loading && miners.data && miners.data.length > 0
          ? miners.data.map(function(m) {
              return (
                <div key={m.ip} style={{ ...rowStyle, fontSize: 13, fontFamily: T.sans }}>
                  <span style={{ color: T.ink }}>{m.data && m.data.hostname ? m.data.hostname : m.ip}</span>
                  <span style={{ color: m.online ? T.green : T.red }}>
                    {m.online ? fmtHashrate(m.data && m.data.hashRate_1m) : 'offline'}
                  </span>
                </div>
              );
            })
          : !miners.loading && <div style={{ color: T.ink2, fontSize: 13 }}>No miners configured</div>
        }
      </div>

      {/* News */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Headlines</div>
        {news.loading && <div style={{ color: T.ink2, fontSize: 13 }}>Loading…</div>}
        {!news.loading && (!news.data || news.data.length === 0) && (
          <div style={{ color: T.ink2, fontSize: 13 }}>No headlines available</div>
        )}
        {!news.loading && news.data && news.data.slice(0, 6).map(function(item, i) {
          return (
            <a
              key={i}
              href={item.link || '#'}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 0',
                color: T.ink,
                textDecoration: 'none',
                borderBottom: `1px solid ${T.ink3}`,
                fontSize: 14,
                lineHeight: 1.4,
                minHeight: 44,
              }}
            >{item.title}</a>
          );
        })}
      </div>

      {/* Desktop-only notice */}
      <div style={{
        marginTop: 24, padding: '12px 14px',
        borderTop: `1px solid ${T.ink3}`,
        fontSize: 11, color: T.ink3, textAlign: 'center',
      }}>
        Open on desktop to configure miners and preferences.
      </div>

    </div>
  );
}
MobileLayout = React.memo(MobileLayout);
