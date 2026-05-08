function TweaksNumInput({ path, min, max, get, setPath, T }) {
  return (
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
}

function TweaksCheckRow({ path, label, get, setPath }) {
  return (
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
}

function TweaksRow({ label, children, T }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0' }}>
      <span style={{ fontSize: 12, color: T.ink2 }}>{label}</span>
      {children}
    </div>
  );
}

function TweaksSection({ children, T }) {
  return (
    <div style={{ borderTop: `1px solid ${T.ink3}`, paddingTop: 8, marginBottom: 12 }}>
      {children}
    </div>
  );
}

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

      <TweaksSection T={T}>
        <TweaksCheckRow path="alerts.fee.enabled" label="Fee spike" get={get} setPath={setPath} />
        <TweaksRow label="Threshold (sat/vB)" T={T}><TweaksNumInput path="alerts.fee.threshold" min={1} max={500} get={get} setPath={setPath} T={T} /></TweaksRow>
        <TweaksRow label="Cooldown (min)" T={T}><TweaksNumInput path="alerts.fee.cooldownMin" min={5} max={1440} get={get} setPath={setPath} T={T} /></TweaksRow>
      </TweaksSection>

      <TweaksSection T={T}>
        <TweaksCheckRow path="alerts.blockTime.enabled" label="Block time drift (> 15 min without a block)" get={get} setPath={setPath} />
        <TweaksRow label="Cooldown (min)" T={T}><TweaksNumInput path="alerts.blockTime.cooldownMin" min={5} max={1440} get={get} setPath={setPath} T={T} /></TweaksRow>
      </TweaksSection>

      <TweaksSection T={T}>
        <TweaksCheckRow path="alerts.minerOffline.enabled" label="Miner offline" get={get} setPath={setPath} />
        <TweaksRow label="Cooldown (min)" T={T}><TweaksNumInput path="alerts.minerOffline.cooldownMin" min={1} max={1440} get={get} setPath={setPath} T={T} /></TweaksRow>
      </TweaksSection>

      <TweaksSection T={T}>
        <TweaksCheckRow path="alerts.price.enabled" label="Price move (requires history sidecar)" get={get} setPath={setPath} />
        <TweaksRow label="% move" T={T}><TweaksNumInput path="alerts.price.pctThreshold" min={1} max={50} get={get} setPath={setPath} T={T} /></TweaksRow>
        <TweaksRow label="Window (min)" T={T}><TweaksNumInput path="alerts.price.windowMin" min={5} max={240} get={get} setPath={setPath} T={T} /></TweaksRow>
        <TweaksRow label="Cooldown (min)" T={T}><TweaksNumInput path="alerts.price.cooldownMin" min={5} max={1440} get={get} setPath={setPath} T={T} /></TweaksRow>
      </TweaksSection>

      {/* ── RSS Feeds ── */}
      <span style={{ ...sectionLabel, marginTop: 8 }}>RSS FEEDS</span>
      <TweaksSection T={T}>
        {[
          { key: 'feeds.bitcoinMagazine', label: 'Bitcoin Magazine' },
          { key: 'feeds.coindesk',        label: 'CoinDesk' },
          { key: 'feeds.newsBitcoin',     label: 'News.Bitcoin.com' },
        ].map(({ key, label }) => <TweaksCheckRow key={key} path={key} label={label} get={get} setPath={setPath} />)}
      </TweaksSection>

      {/* ── Theme ── */}
      <span style={{ ...sectionLabel, marginTop: 8 }}>THEME</span>
      <TweaksSection T={T}>
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
      </TweaksSection>

      {/* ── Refresh Intervals ── */}
      <span style={{ ...sectionLabel, marginTop: 8 }}>REFRESH INTERVALS</span>
      <div style={{ fontSize: 11, color: T.ink3, marginBottom: 6 }}>Values in seconds. Reload page to apply.</div>
      <TweaksSection T={T}>
        {[
          { key: 'intervals.price',   label: 'BTC price',    min: 15,  max: 300  },
          { key: 'intervals.chain',   label: 'Chain vitals', min: 30,  max: 600  },
          { key: 'intervals.weather', label: 'Weather',      min: 300, max: 3600 },
          { key: 'intervals.rss',     label: 'News',         min: 60,  max: 1800 },
          { key: 'intervals.bitaxe',  label: 'Miners',       min: 10,  max: 300  },
        ].map(({ key, label, min, max }) => (
          <TweaksRow key={key} label={label} T={T}><TweaksNumInput path={key} min={min} max={max} get={get} setPath={setPath} T={T} /></TweaksRow>
        ))}
      </TweaksSection>

      <button onClick={handleSave} style={{
        background: T.orange, color: '#fff', border: 'none', borderRadius: 3,
        padding: '8px 0', cursor: 'pointer', fontSize: 13, fontFamily: T.display,
        letterSpacing: '0.06em', width: '100%', marginTop: 4,
      }}>SAVE</button>
    </div>
  );
}
