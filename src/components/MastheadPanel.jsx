import React from 'react';
import { useT } from '../theme';
import { Kicker } from './Kicker';

export function MastheadPanel({ apiUrl, ips, prefs, onSave, onClose }) {
  const T = useT();
  const [url, setUrl] = React.useState(apiUrl);
  const [ipsText, setIpsText] = React.useState(ips.join(', '));

  const [cityQuery, setCityQuery] = React.useState(prefs.cityName);
  const [geoResults, setGeoResults] = React.useState(null);
  const [geoLoading, setGeoLoading] = React.useState(false);
  const [pendingLat, setPendingLat] = React.useState(prefs.lat);
  const [pendingLng, setPendingLng] = React.useState(prefs.lng);
  const [pendingCityName, setPendingCityName] = React.useState(prefs.cityName);
  const [timeFormat, setTimeFormat] = React.useState(prefs.timeFormat);
  const [tempUnit, setTempUnit] = React.useState(prefs.tempUnit);

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
    const newIps = ipsText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    onSave(url.trim(), newIps, {
      lat: pendingLat,
      lng: pendingLng,
      cityName: pendingCityName,
      timeFormat,
      tempUnit,
    });
  };

  const inp = {
    fontFamily: T.mono,
    fontSize: u(13),
    color: T.ink,
    background: T.paper2,
    border: `1px solid ${T.rule2}`,
    padding: `${u(8)} ${u(10)}`,
    outline: 'none',
    boxSizing: 'border-box',
    display: 'block',
    width: '100%',
  };

  const btnPrimary = {
    fontFamily: T.sans,
    fontSize: u(10),
    fontWeight: 700,
    letterSpacing: u(1.8),
    textTransform: 'uppercase',
    padding: `${u(9)} ${u(22)}`,
    cursor: 'pointer',
    border: 'none',
    background: T.ink,
    color: T.paper,
  };

  const btnSecondary = {
    fontFamily: T.sans,
    fontSize: u(10),
    fontWeight: 700,
    letterSpacing: u(1.8),
    textTransform: 'uppercase',
    padding: `${u(9)} ${u(22)}`,
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    color: T.ink3,
  };

  const toggleBtn = (active) => ({
    fontFamily: T.mono,
    fontSize: u(12),
    letterSpacing: u(1),
    padding: `${u(7)} ${u(14)}`,
    cursor: 'pointer',
    border: 'none',
    background: active ? T.ink : T.paper2,
    color: active ? T.paper : T.ink3,
  });

  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 10 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Right-side drawer — clamps to full width on mobile */}
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: `min(${u(480)}, 100%)`,
        background: T.paper,
        borderLeft: `1px solid ${T.rule}`,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        boxShadow: `${u(-8)} 0 ${u(32)} rgba(0,0,0,0.14)`,
      }}>
        {/* Masthead header */}
        <div style={{ padding: `${u(22)} ${u(28)} 0`, flexShrink: 0 }}>
          <div style={{ borderTop: `${u(3)} solid ${T.rule}`, borderBottom: `1px solid ${T.rule}`, height: u(6), marginBottom: u(14) }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: T.sans, fontSize: u(9), fontWeight: 600, letterSpacing: u(3), textTransform: 'uppercase', color: T.ink3, marginBottom: u(4) }}>
                Configuration
              </div>
              <div style={{ fontFamily: T.serif, fontSize: u(26), fontWeight: 800, letterSpacing: u(-0.8), color: T.ink, lineHeight: 1 }}>
                The Masthead
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

        <div style={{ padding: `${u(18)} ${u(28)} ${u(28)}`, display: 'flex', flexDirection: 'column', gap: 0 }}>
          <Kicker>Home Fleet</Kicker>
          <div style={{ height: u(10) }} />

          <Kicker>BitAxe API URL</Kicker>
          <div style={{ fontFamily: T.body, fontStyle: 'italic', fontSize: u(11), color: T.ink3, marginTop: u(3), marginBottom: u(6) }}>
            Run bitaxe_api.py on a local server. Leave blank to poll miners directly.
          </div>
          <input
            style={inp}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://192.168.1.59:3001/api/miners"
            spellCheck={false}
          />

          <div style={{ height: u(14) }} />
          <Kicker>Miner IPs (direct polling fallback)</Kicker>
          <div style={{ fontFamily: T.body, fontStyle: 'italic', fontSize: u(11), color: T.ink3, marginTop: u(3), marginBottom: u(6) }}>
            Used when API URL is blank or unreachable. Comma-separated.
          </div>
          <input
            style={inp}
            value={ipsText}
            onChange={(e) => setIpsText(e.target.value)}
            placeholder="192.168.1.6, 192.168.1.7"
            spellCheck={false}
          />

          <div style={{ borderTop: `1px solid ${T.rule2}`, margin: `${u(20)} 0 ${u(16)}` }} />
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
                fontFamily: T.mono,
                fontSize: u(11),
                letterSpacing: u(1),
                padding: `0 ${u(14)}`,
                background: T.ink,
                color: T.paper,
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
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
            <div style={{ border: `1px solid ${T.rule2}`, borderTop: 'none' }}>
              {geoResults.map((r, i) => {
                const label = [r.name, r.admin1, r.country_code].filter(Boolean).join(', ');
                return (
                  <div
                    key={i}
                    onClick={() => handleSelectCity(r)}
                    style={{
                      padding: `${u(7)} ${u(10)}`,
                      borderTop: i > 0 ? `1px solid ${T.rule3}` : 'none',
                      cursor: 'pointer',
                      fontFamily: T.mono,
                      fontSize: u(12),
                      color: T.ink,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
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
              <div style={{ display: 'flex', border: `1px solid ${T.rule2}`, marginTop: u(8), width: 'fit-content' }}>
                <button style={toggleBtn(timeFormat === '12h')} onClick={() => setTimeFormat('12h')}>12h AM/PM</button>
                <button style={toggleBtn(timeFormat === '24h')} onClick={() => setTimeFormat('24h')}>24h</button>
              </div>
            </div>
            <div>
              <Kicker>Temperature</Kicker>
              <div style={{ display: 'flex', border: `1px solid ${T.rule2}`, marginTop: u(8), width: 'fit-content' }}>
                <button style={toggleBtn(tempUnit === 'fahrenheit')} onClick={() => setTempUnit('fahrenheit')}>°F</button>
                <button style={toggleBtn(tempUnit === 'celsius')} onClick={() => setTempUnit('celsius')}>°C</button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: u(10), marginTop: u(24), borderTop: `1px solid ${T.rule2}`, paddingTop: u(18) }}>
            <button style={btnPrimary} onClick={handleSave}>Save</button>
            <button style={btnSecondary} onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
