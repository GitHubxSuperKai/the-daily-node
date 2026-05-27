import React from 'react';
import { useT } from '../theme';
import Kicker from './Kicker';
import { u } from '../utils/scale';
import { TweaksSection, TweaksRow, TweaksNumInput, TweaksCheckRow } from './settings/helpers';
import { MinersSection } from './settings/MinersSection';

export function SettingsPanel({ prefs, v2prefs, miners, onRefresh, onSave, onSaveV2, onClose }) {
  const T = useT();

  // ── Preferences section state ──
  const [cityQuery, setCityQuery]             = React.useState(prefs.cityName);
  const [geoResults, setGeoResults]           = React.useState(null);
  const [geoLoading, setGeoLoading]           = React.useState(false);
  const [pendingLat, setPendingLat]           = React.useState(prefs.lat);
  const [pendingLng, setPendingLng]           = React.useState(prefs.lng);
  const [pendingCityName, setPendingCityName] = React.useState(prefs.cityName);
  const [timeFormat, setTimeFormat]           = React.useState(prefs.timeFormat);
  const [tempUnit, setTempUnit]               = React.useState(prefs.tempUnit);

  // ── v2 preferences (Alerts, Feeds, Intervals, Theme) ──
  const [v2local, setV2Local] = React.useState(v2prefs);
  const setV2Path = React.useCallback((path, value) => {
    setV2Local(prev => {
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
  const v2get = (path) => path.split('.').reduce((o, k) => o?.[k], v2local);

  const handleSearch = async () => {
    if (!cityQuery.trim()) return;
    setGeoLoading(true);
    setGeoResults(null);
    try {
      const r = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityQuery.trim())}&count=5&language=en&format=json`
      );
      if (!r.ok) throw new Error('geo');
      const j = await r.json();
      setGeoResults(Array.isArray(j.results) && j.results.length > 0 ? j.results : []);
    } catch {
      setGeoResults('error');
    } finally {
      setGeoLoading(false);
    }
  };

  const handleSelectCity = (result) => {
    const label = [result.name, result.admin1, result.country_code].filter(Boolean).join(', ');
    setCityQuery(label);
    setPendingLat(result.latitude);
    setPendingLng(result.longitude);
    setPendingCityName(label);
    setGeoResults(null);
  };

  const handleSave = () => {
    onSave({ lat: pendingLat, lng: pendingLng, cityName: pendingCityName, timeFormat, tempUnit });
    onSaveV2(v2local);
    onClose();
  };

  const inp = {
    fontFamily: T.mono, fontSize: u(13), color: T.ink, background: T.paper2,
    border: '1px solid ' + T.rule2, padding: u(8) + ' ' + u(10), outline: 'none',
    boxSizing: 'border-box', display: 'block', width: '100%',
  };
  const btnPrimary = {
    fontFamily: T.sans, fontSize: u(10), fontWeight: 700, letterSpacing: u(1.8),
    textTransform: 'uppercase', padding: u(9) + ' ' + u(22), cursor: 'pointer',
    border: 'none', background: T.ink, color: T.paper,
  };
  const toggleBtn = (active) => ({
    fontFamily: T.mono, fontSize: u(12), letterSpacing: u(1),
    padding: u(7) + ' ' + u(14), cursor: 'pointer', border: 'none',
    background: active ? T.ink : T.paper2, color: active ? T.paper : T.ink3,
  });

  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 10 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0,
        width: 'min(' + u(480) + ', 100%)', background: T.paper,
        borderLeft: '1px solid ' + T.rule, display: 'flex', flexDirection: 'column',
        overflowY: 'auto', boxShadow: u(-8) + ' 0 ' + u(32) + ' rgba(0,0,0,0.14)',
      }}>
        {/* Header */}
        <div style={{ padding: u(22) + ' ' + u(28) + ' 0', flexShrink: 0 }}>
          <div style={{ borderTop: u(3) + ' solid ' + T.rule, borderBottom: '1px solid ' + T.rule, height: u(6), marginBottom: u(14) }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: T.sans, fontSize: u(9), fontWeight: 600, letterSpacing: u(3), textTransform: 'uppercase', color: T.ink3, marginBottom: u(4) }}>
                Configuration
              </div>
              <div style={{ fontFamily: T.serif, fontSize: u(26), fontWeight: 800, letterSpacing: u(-0.8), color: T.ink, lineHeight: 1 }}>
                Settings
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.mono, fontSize: u(16), color: T.ink3, padding: u(4) }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ padding: u(18) + ' ' + u(28) + ' ' + u(28), display: 'flex', flexDirection: 'column' }}>

          {/* ── MINERS ── */}
          <Kicker>Miners</Kicker>
          <MinersSection miners={miners} onRefresh={onRefresh} inp={inp} />

          <div style={{ borderTop: '1px solid ' + T.rule2, margin: u(20) + ' 0 ' + u(16) }} />
          <Kicker>Preferences</Kicker>
          <div style={{ height: u(10) }} />

          <Kicker>Location</Kicker>
          <div style={{ fontFamily: T.body, fontStyle: 'italic', fontSize: u(11), color: T.ink3, marginTop: u(3), marginBottom: u(6) }}>
            Type a city name and select from results.
          </div>
          <div style={{ display: 'flex' }}>
            <input
              style={{ ...inp, flex: 1, width: 'auto' }}
              value={cityQuery}
              onChange={(e) => { setCityQuery(e.target.value); setGeoResults(null); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="e.g. San Francisco"
              spellCheck={false}
            />
            <button
              onClick={handleSearch}
              disabled={geoLoading}
              style={{
                fontFamily: T.mono, fontSize: u(11), letterSpacing: u(1),
                padding: '0 ' + u(14), background: T.ink, color: T.paper,
                border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {geoLoading ? '…' : 'Search'}
            </button>
          </div>
          {geoResults === 'error' && (
            <div style={{ fontFamily: T.mono, fontSize: u(11), color: T.red, marginTop: u(4) }}>Search unavailable</div>
          )}
          {Array.isArray(geoResults) && geoResults.length === 0 && (
            <div style={{ fontFamily: T.mono, fontSize: u(11), color: T.ink3, marginTop: u(4) }}>No results found</div>
          )}
          {Array.isArray(geoResults) && geoResults.length > 0 && (
            <div style={{ border: '1px solid ' + T.rule2, borderTop: 'none' }}>
              {geoResults.map((r, i) => {
                const label = [r.name, r.admin1, r.country_code].filter(Boolean).join(', ');
                return (
                  <div
                    key={i}
                    onClick={() => handleSelectCity(r)}
                    style={{
                      padding: u(7) + ' ' + u(10),
                      borderTop: i > 0 ? '1px solid ' + T.rule3 : 'none',
                      cursor: 'pointer', fontFamily: T.mono, fontSize: u(12), color: T.ink,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: T.paper,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = T.paper2)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = T.paper)}
                  >
                    <span>{label}</span>
                    <span style={{ color: T.ink3, fontSize: u(10) }}>
                      {r.latitude.toFixed(2)}, {r.longitude.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {pendingCityName && (
            <div style={{ fontFamily: T.mono, fontSize: u(10), color: T.ink3, marginTop: u(5) }}>
              Active: {pendingCityName} ({pendingLat.toFixed(4)}, {pendingLng.toFixed(4)})
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: u(16), marginTop: u(16) }}>
            <div>
              <Kicker>Time Format</Kicker>
              <div style={{ display: 'flex', border: '1px solid ' + T.rule2, marginTop: u(8), width: 'fit-content' }}>
                <button style={toggleBtn(timeFormat === '12h')} onClick={() => setTimeFormat('12h')}>12h AM/PM</button>
                <button style={toggleBtn(timeFormat === '24h')} onClick={() => setTimeFormat('24h')}>24h</button>
              </div>
            </div>
            <div>
              <Kicker>Temperature</Kicker>
              <div style={{ display: 'flex', border: '1px solid ' + T.rule2, marginTop: u(8), width: 'fit-content' }}>
                <button style={toggleBtn(tempUnit === 'fahrenheit')} onClick={() => setTempUnit('fahrenheit')}>°F</button>
                <button style={toggleBtn(tempUnit === 'celsius')} onClick={() => setTempUnit('celsius')}>°C</button>
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid ' + T.rule2, margin: u(20) + ' 0 ' + u(16) }} />
          <Kicker>Alerts</Kicker>
          <div style={{ fontSize: 11, color: T.ink3, marginBottom: 6 }}>
            Browser permission required.{' '}
            <button
              onClick={() => typeof Notification !== 'undefined' && Notification.requestPermission()}
              style={{ background: 'transparent', color: T.orange, border: 'none', cursor: 'pointer', fontSize: 11, padding: 0 }}
            >Grant</button>
          </div>

          <TweaksSection T={T}>
            <TweaksCheckRow path="alerts.fee.enabled" label="Fee spike" get={v2get} setPath={setV2Path} />
            <TweaksRow label="Threshold (sat/vB)" T={T}><TweaksNumInput path="alerts.fee.threshold" min={1} max={500} get={v2get} setPath={setV2Path} T={T} /></TweaksRow>
            <TweaksRow label="Cooldown (min)" T={T}><TweaksNumInput path="alerts.fee.cooldownMin" min={5} max={1440} get={v2get} setPath={setV2Path} T={T} /></TweaksRow>
          </TweaksSection>

          <TweaksSection T={T}>
            <TweaksCheckRow path="alerts.blockTime.enabled" label="Block time drift (&gt; 15 min without a block)" get={v2get} setPath={setV2Path} />
            <TweaksRow label="Cooldown (min)" T={T}><TweaksNumInput path="alerts.blockTime.cooldownMin" min={5} max={1440} get={v2get} setPath={setV2Path} T={T} /></TweaksRow>
          </TweaksSection>

          <TweaksSection T={T}>
            <TweaksCheckRow path="alerts.minerOffline.enabled" label="Miner offline" get={v2get} setPath={setV2Path} />
            <TweaksRow label="Cooldown (min)" T={T}><TweaksNumInput path="alerts.minerOffline.cooldownMin" min={1} max={1440} get={v2get} setPath={setV2Path} T={T} /></TweaksRow>
          </TweaksSection>

          <TweaksSection T={T}>
            <TweaksCheckRow path="alerts.price.enabled" label="Price move (requires history sidecar)" get={v2get} setPath={setV2Path} />
            <TweaksRow label="% move" T={T}><TweaksNumInput path="alerts.price.pctThreshold" min={1} max={50} get={v2get} setPath={setV2Path} T={T} /></TweaksRow>
            <TweaksRow label="Window (min)" T={T}><TweaksNumInput path="alerts.price.windowMin" min={5} max={240} get={v2get} setPath={setV2Path} T={T} /></TweaksRow>
            <TweaksRow label="Cooldown (min)" T={T}><TweaksNumInput path="alerts.price.cooldownMin" min={5} max={1440} get={v2get} setPath={setV2Path} T={T} /></TweaksRow>
          </TweaksSection>

          {/* ── RSS Feeds ── */}
          <span style={{ fontFamily: T.display || T.sans, fontSize: 11, letterSpacing: '0.08em', color: T.ink3, marginBottom: 4, display: 'block', marginTop: 8 }}>RSS FEEDS</span>
          <TweaksSection T={T}>
            {[
              { key: 'feeds.bitcoinMagazine', label: 'Bitcoin Magazine' },
              { key: 'feeds.coindesk',        label: 'CoinDesk' },
              { key: 'feeds.newsBitcoin',     label: 'News.Bitcoin.com' },
            ].map(({ key, label }) => <TweaksCheckRow key={key} path={key} label={label} get={v2get} setPath={setV2Path} />)}
          </TweaksSection>

          {/* ── Theme ── */}
          <span style={{ fontFamily: T.display || T.sans, fontSize: 11, letterSpacing: '0.08em', color: T.ink3, marginBottom: 4, display: 'block', marginTop: 8 }}>THEME</span>
          <TweaksSection T={T}>
            {[['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto (by sunset)']].map(([val, label]) => (
              <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="tweak-theme"
                  value={val}
                  checked={v2local.theme === val}
                  onChange={() => setV2Path('theme', val)}
                  style={{ width: 14, height: 14 }}
                />
                <span style={{ fontSize: 13 }}>{label}</span>
              </label>
            ))}
          </TweaksSection>

          {/* ── Refresh Intervals ── */}
          <span style={{ fontFamily: T.display || T.sans, fontSize: 11, letterSpacing: '0.08em', color: T.ink3, marginBottom: 4, display: 'block', marginTop: 8 }}>REFRESH INTERVALS</span>
          <div style={{ fontSize: 11, color: T.ink3, marginBottom: 6 }}>Values in seconds. Reload page to apply.</div>
          <TweaksSection T={T}>
            {[
              { key: 'intervals.price',   label: 'BTC price',    min: 15,  max: 300  },
              { key: 'intervals.chain',   label: 'Chain vitals', min: 30,  max: 600  },
              { key: 'intervals.weather', label: 'Weather',      min: 300, max: 3600 },
              { key: 'intervals.rss',     label: 'News',         min: 60,  max: 1800 },
              { key: 'intervals.bitaxe',  label: 'Miners',       min: 10,  max: 300  },
            ].map(({ key, label, min, max }) => (
              <TweaksRow key={key} label={label} T={T}><TweaksNumInput path={key} min={min} max={max} get={v2get} setPath={setV2Path} T={T} /></TweaksRow>
            ))}
          </TweaksSection>

          {/* ── Data Sources ── */}
          <span style={{ fontFamily: T.display || T.sans, fontSize: 11, letterSpacing: '0.08em', color: T.ink3, marginBottom: 4, display: 'block', marginTop: 8 }}>DATA SOURCES</span>
          <TweaksSection T={T}>
            <TweaksRow label="Mempool endpoint" T={T}>
              <input
                type="text"
                value={v2local.mempool?.baseUrl ?? ''}
                onChange={e => setV2Path('mempool.baseUrl', e.target.value.trim())}
                placeholder="https://mempool.space (default)"
                spellCheck={false}
                style={{
                  width: 220, background: T.paper, color: T.ink, fontSize: 13,
                  border: '1px solid ' + T.ink3, borderRadius: 3, padding: '2px 5px',
                }}
              />
            </TweaksRow>
            {!!(v2local.mempool?.baseUrl) && (
              <TweaksCheckRow
                path="mempool.fallbackToPublic"
                label="Fall back to public mempool.space if self-hosted fails"
                get={v2get}
                setPath={setV2Path}
              />
            )}
          </TweaksSection>

          <div style={{ display: 'flex', gap: u(10), marginTop: u(24), borderTop: '1px solid ' + T.rule2, paddingTop: u(18) }}>
            <button style={btnPrimary} onClick={handleSave}>Save</button>
            <button style={{ ...btnPrimary, background: 'transparent', color: T.ink3 }} onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
