import React from 'react';
import { useT } from '../../theme';
import Kicker from '../Kicker';
import { u } from '../../utils/scale';

export function PreferencesSection({ prefs, inp, onChange }) {
  const T = useT();

  const [cityQuery, setCityQuery]             = React.useState(prefs.cityName);
  const [geoResults, setGeoResults]           = React.useState(null);
  const [geoLoading, setGeoLoading]           = React.useState(false);
  const [pendingLat, setPendingLat]           = React.useState(prefs.lat);
  const [pendingLng, setPendingLng]           = React.useState(prefs.lng);
  const [pendingCityName, setPendingCityName] = React.useState(prefs.cityName);
  const [timeFormat, setTimeFormat]           = React.useState(prefs.timeFormat);
  const [tempUnit, setTempUnit]               = React.useState(prefs.tempUnit);

  React.useEffect(() => {
    onChange({ lat: pendingLat, lng: pendingLng, cityName: pendingCityName, timeFormat, tempUnit });
  }, [pendingLat, pendingLng, pendingCityName, timeFormat, tempUnit]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const toggleBtn = (active) => ({
    fontFamily: T.mono, fontSize: u(12), letterSpacing: u(1),
    padding: u(7) + ' ' + u(14), cursor: 'pointer', border: 'none',
    background: active ? T.ink : T.paper2, color: active ? T.paper : T.ink3,
  });

  return (
    <>
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
    </>
  );
}
