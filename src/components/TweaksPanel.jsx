function TweaksPanel({ prefs, onSave, onClose }) {
  const T = useT();
  const [local, setLocal] = React.useState(prefs);

  const setPath = React.useCallback((path, value) => {
    setLocal(prev => {
      const parts = path.split('.');
      const next = { ...prev };
      let obj = next;
      for (let i = 0; i < parts.length - 1; i++) {
        obj[parts[i]] = { ...obj[parts[i]] };
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = value;
      return next;
    });
  }, []);

  const get = (path) => path.split('.').reduce((o, k) => o?.[k], local);

  const handleSave = () => { onSave(local); onClose(); };

  const NumInput = ({ path, min, max }) => (
    <input
      type="number"
      value={get(path) ?? ''}
      min={min}
      max={max}
      onChange={e => setPath(path, Number(e.target.value))}
      style={{
        width: 64, background: T.paper, color: T.ink, fontSize: 13,
        border: `1px solid ${T.ink3}`, borderRadius: 3, padding: '2px 5px',
        textAlign: 'right',
      }}
    />
  );

  const CheckRow = ({ path, label }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={!!get(path)}
        onChange={e => setPath(path, e.target.checked)}
        style={{ width: 14, height: 14 }}
      />
      <span style={{ fontSize: 13 }}>{label}</span>
    </label>
  );

  const Row = ({ label, children }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0' }}>
      <span style={{ fontSize: 12, color: T.ink2 }}>{label}</span>
      {children}
    </div>
  );

  const Section = ({ children }) => (
    <div style={{ borderTop: `1px solid ${T.ink3}`, paddingTop: 8, marginBottom: 12 }}>
      {children}
    </div>
  );

  const sectionLabel = { fontFamily: T.display, fontSize: 11, letterSpacing: '0.08em', color: T.ink3, marginBottom: 4, display: 'block' };

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10, overflowY: 'auto',
      background: T.paper, color: T.ink, fontFamily: T.body,
      padding: 16, boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontFamily: T.display, fontSize: 16, fontWeight: 700, letterSpacing: '0.05em' }}>TWEAKS</span>
        <button onClick={onClose} style={{
          background: 'transparent', color: T.ink2, border: `1px solid ${T.ink3}`,
          borderRadius: 3, padding: '3px 9px', cursor: 'pointer', fontSize: 12,
        }}>✕ Close</button>
      </div>

      {/* ── Alerts ── */}
      <span style={sectionLabel}>ALERTS</span>
      <div style={{ fontSize: 11, color: T.ink3, marginBottom: 6 }}>
        Browser permission required.{' '}
        <button
          onClick={() => typeof Notification !== 'undefined' && Notification.requestPermission()}
          style={{ background: 'transparent', color: T.orange, border: 'none', cursor: 'pointer', fontSize: 11, padding: 0 }}
        >Grant</button>
      </div>

      <Section>
        <CheckRow path="alerts.fee.enabled" label="Fee spike" />
        <Row label="Threshold (sat/vB)"><NumInput path="alerts.fee.threshold" min={1} max={500} /></Row>
        <Row label="Cooldown (min)"><NumInput path="alerts.fee.cooldownMin" min={5} max={1440} /></Row>
      </Section>

      <Section>
        <CheckRow path="alerts.blockTime.enabled" label="Block time drift (> 15 min without a block)" />
        <Row label="Cooldown (min)"><NumInput path="alerts.blockTime.cooldownMin" min={5} max={1440} /></Row>
      </Section>

      <Section>
        <CheckRow path="alerts.minerOffline.enabled" label="Miner offline" />
        <Row label="Cooldown (min)"><NumInput path="alerts.minerOffline.cooldownMin" min={1} max={1440} /></Row>
      </Section>

      <Section>
        <CheckRow path="alerts.price.enabled" label="Price move (requires history sidecar)" />
        <Row label="% move"><NumInput path="alerts.price.pctThreshold" min={1} max={50} /></Row>
        <Row label="Window (min)"><NumInput path="alerts.price.windowMin" min={5} max={240} /></Row>
        <Row label="Cooldown (min)"><NumInput path="alerts.price.cooldownMin" min={5} max={1440} /></Row>
      </Section>

      {/* ── RSS Feeds ── */}
      <span style={{ ...sectionLabel, marginTop: 8 }}>RSS FEEDS</span>
      <Section>
        {[
          { key: 'feeds.bitcoinMagazine', label: 'Bitcoin Magazine' },
          { key: 'feeds.coindesk',        label: 'CoinDesk' },
          { key: 'feeds.newsBitcoin',     label: 'News.Bitcoin.com' },
        ].map(({ key, label }) => <CheckRow key={key} path={key} label={label} />)}
      </Section>

      {/* ── Theme ── */}
      <span style={{ ...sectionLabel, marginTop: 8 }}>THEME</span>
      <Section>
        {[['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto (by sunset)']].map(([val, label]) => (
          <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
            <input
              type="radio"
              name="tweak-theme"
              value={val}
              checked={local.theme === val}
              onChange={() => setPath('theme', val)}
              style={{ width: 14, height: 14 }}
            />
            <span style={{ fontSize: 13 }}>{label}</span>
          </label>
        ))}
      </Section>

      {/* ── Refresh Intervals ── */}
      <span style={{ ...sectionLabel, marginTop: 8 }}>REFRESH INTERVALS</span>
      <div style={{ fontSize: 11, color: T.ink3, marginBottom: 6 }}>Values in seconds. Reload page to apply.</div>
      <Section>
        {[
          { key: 'intervals.price',   label: 'BTC price',    min: 15,  max: 300  },
          { key: 'intervals.chain',   label: 'Chain vitals', min: 30,  max: 600  },
          { key: 'intervals.weather', label: 'Weather',      min: 300, max: 3600 },
          { key: 'intervals.rss',     label: 'News',         min: 60,  max: 1800 },
          { key: 'intervals.bitaxe',  label: 'Miners',       min: 10,  max: 300  },
        ].map(({ key, label, min, max }) => (
          <Row key={key} label={label}><NumInput path={key} min={min} max={max} /></Row>
        ))}
      </Section>

      <button onClick={handleSave} style={{
        background: T.orange, color: '#fff', border: 'none', borderRadius: 3,
        padding: '8px 0', cursor: 'pointer', fontSize: 13, fontFamily: T.display,
        letterSpacing: '0.06em', width: '100%', marginTop: 4,
      }}>SAVE</button>
    </div>
  );
}
