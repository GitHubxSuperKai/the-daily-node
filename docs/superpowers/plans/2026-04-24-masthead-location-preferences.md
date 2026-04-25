# The Masthead — Location & Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Fleet Settings" panel with "The Masthead" — a combined fleet + preferences panel that lets users set their location via city search, choose 12h/24h time format, and choose °F/°C, all persisted to `localStorage` and applied immediately.

**Architecture:** Extend `App` state with a `prefs` object `{ lat, lng, cityName, timeFormat, tempUnit }` stored in a new `dailynode-prefs` localStorage key. `useWeather` and `useClock` become parameterized hooks that accept prefs values and re-run when they change. The `SettingsPanel` component is replaced by `MastheadPanel` which adds geocoding search and preference toggles. All changes are in the single file `Command Center.html`.

**Tech Stack:** React (CDN, no build step), Open-Meteo weather API, Open-Meteo geocoding API, browser `localStorage`.

---

## Task 1: Add `loadPrefs` and `prefs` state to `App`

**Files:**
- Modify: `Command Center.html` — `App` function (~line 1040)

- [ ] **Step 1: Add `loadPrefs` helper and `prefs` state**

In `App`, directly after the existing `loadSaved` function, add `loadPrefs`. Then add the `prefs` state below the existing `bitaxeIps` state:

```js
// After: const loadSaved = () => { ... };
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem('dailynode-prefs') || '{}'); } catch { return {}; } };

// After: const [bitaxeIps, setBitaxeIps] = ...
const [prefs, setPrefs] = React.useState(() => {
  const s = loadPrefs();
  return {
    lat:        s.lat        ?? CONFIG.WEATHER_LAT,
    lng:        s.lng        ?? CONFIG.WEATHER_LNG,
    cityName:   s.cityName   ?? '',
    timeFormat: s.timeFormat ?? '12h',
    tempUnit:   s.tempUnit   ?? 'fahrenheit',
  };
});
```

- [ ] **Step 2: Verify in browser**

Open `http://localhost:3000` (or wherever the dashboard runs). Open DevTools console. Run:
```js
JSON.parse(localStorage.getItem('dailynode-prefs') || '{}')
```
Expected: `{}` (no prefs saved yet — the state will fall back to CONFIG defaults). No console errors.

- [ ] **Step 3: Commit**

```bash
git add "Command Center.html"
git commit -m "feat: add loadPrefs and prefs state to App"
```

---

## Task 2: Parameterize `useWeather` + add `fmtHour` helper

**Files:**
- Modify: `Command Center.html` — `useWeather` function (~line 516), and add `fmtHour` helper above it

- [ ] **Step 1: Add `fmtHour` helper**

Add this function immediately before `useWeather` (around line 515):

```js
function fmtHour(hr, timeFormat) {
  if (timeFormat === '24h') return `${String(hr).padStart(2, '0')}:00`;
  if (hr === 0)  return '12am';
  if (hr < 12)   return `${hr}am`;
  if (hr === 12) return '12pm';
  return `${hr - 12}pm`;
}
```

- [ ] **Step 2: Change `useWeather` signature to accept params**

Change the function signature from:
```js
function useWeather() {
```
to:
```js
function useWeather(lat, lng, tempUnit) {
```

- [ ] **Step 3: Update the fetch URL to use params**

Replace the hardcoded URL line inside `fetchWeather`:
```js
// OLD:
const url = `https://api.open-meteo.com/v1/forecast?latitude=${CONFIG.WEATHER_LAT}&longitude=${CONFIG.WEATHER_LNG}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=1&timezone=auto`;

// NEW:
const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&temperature_unit=${tempUnit}&wind_speed_unit=mph&forecast_days=1&timezone=auto`;
```

- [ ] **Step 4: Change hourly slot shape — store raw `hr` integer instead of formatted label**

Inside the hourly-building loop, replace:
```js
// OLD:
const hr = t.getHours();
const label = hr === 0 ? '12am' : hr < 12 ? `${hr}am` : hr === 12 ? '12pm' : `${hr - 12}pm`;
hourly.push({
  h: label,
  t: Math.round(j.hourly.temperature_2m[idx]),
  g: wmoGlyph(j.hourly.weather_code[idx]),
});
```
with:
```js
// NEW:
const hr = t.getHours();
hourly.push({
  hr,
  t: Math.round(j.hourly.temperature_2m[idx]),
  g: wmoGlyph(j.hourly.weather_code[idx]),
});
```

- [ ] **Step 5: Rename `tempF` → `temp` in the returned data object**

Replace:
```js
// OLD:
setData({
  tempF:  Math.round(cur.temperature_2m),
```
with:
```js
// NEW:
setData({
  temp:   Math.round(cur.temperature_2m),
```

- [ ] **Step 6: Update the `useEffect` dep array**

Replace the empty dep array with one that watches all three params:
```js
// OLD:
React.useEffect(() => {
  fetchWeather();
  const id = setInterval(fetchWeather, INTERVALS.WEATHER);
  return () => clearInterval(id);
}, []);

// NEW:
React.useEffect(() => {
  fetchWeather();
  const id = setInterval(fetchWeather, INTERVALS.WEATHER);
  return () => clearInterval(id);
}, [lat, lng, tempUnit]);
```

- [ ] **Step 7: Commit**

```bash
git add "Command Center.html"
git commit -m "feat: parameterize useWeather, add fmtHour helper"
```

---

## Task 3: Parameterize `useClock`, update all clock render sites, fix weather temp renders

**Files:**
- Modify: `Command Center.html` — `useClock` (~line 354), `CommandCenter` render (~lines 763, 778, 826, 839, 848)

- [ ] **Step 1: Update `useClock` to accept `timeFormat` and return `amPm`**

Replace the entire `useClock` function:
```js
// OLD:
function useClock() {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), INTERVALS.CLOCK);
    return () => clearInterval(id);
  }, []);
  const pad = n => String(n).padStart(2, '0');
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return {
    timeHM: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    timeSec: `:${pad(now.getSeconds())}`,
    dayStr: `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`,
    dateShort: now.toISOString().slice(0, 10),
  };
}

// NEW:
function useClock(timeFormat) {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), INTERVALS.CLOCK);
    return () => clearInterval(id);
  }, []);
  const pad = n => String(n).padStart(2, '0');
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const h = now.getHours(), m = now.getMinutes();
  const amPm  = timeFormat === '12h' ? (h < 12 ? 'AM' : 'PM') : '';
  const dispH = timeFormat === '12h' ? String(h % 12 || 12) : pad(h);
  return {
    timeHM:   `${dispH}:${pad(m)}`,
    timeSec:  `:${pad(now.getSeconds())}`,
    amPm,
    dayStr:   `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`,
    dateShort: now.toISOString().slice(0, 10),
  };
}
```

- [ ] **Step 2: Update `CommandCenter` props to accept `prefs`, wire `useClock` and `useWeather`**

Change the `CommandCenter` function signature from:
```js
function CommandCenter({ dark, onToggleDark, bitaxeApiUrl, bitaxeIps, settingsOpen, onOpenSettings, onSaveSettings, onCloseSettings }) {
```
to:
```js
function CommandCenter({ dark, onToggleDark, bitaxeApiUrl, bitaxeIps, prefs, settingsOpen, onOpenSettings, onSaveSettings, onCloseSettings }) {
```

Change the hook call lines at the top of `CommandCenter`:
```js
// OLD:
const clock   = useClock();
// ...
const weather = useWeather();

// NEW:
const clock   = useClock(prefs.timeFormat);
// ...
const weather = useWeather(prefs.lat, prefs.lng, prefs.tempUnit);
```

- [ ] **Step 3: Fix `wxSummary` to use `temp` and dynamic unit**

Replace:
```js
// OLD:
const wxSummary = wx ? `${wx.tempF}°F ${wx.wxCond.toLowerCase()}` : '—°F';

// NEW:
const tempUnitLabel = prefs.tempUnit === 'celsius' ? '°C' : '°F';
const wxSummary = wx ? `${wx.temp}${tempUnitLabel} ${wx.wxCond.toLowerCase()}` : `—${tempUnitLabel}`;
```

- [ ] **Step 4: Update top chrome clock span to include `amPm`**

Replace (line ~778):
```js
// OLD:
<span style={{ whiteSpace:'nowrap', textAlign:'right' }}>{clock.timeHM}{clock.timeSec} · {wxSummary}</span>

// NEW:
<span style={{ whiteSpace:'nowrap', textAlign:'right' }}>{clock.timeHM}{clock.timeSec}{clock.amPm ? ` ${clock.amPm}` : ''} · {wxSummary}</span>
```

- [ ] **Step 5: Update main clock panel to include `amPm`**

Replace (line ~826):
```js
// OLD:
<Num size="lg" value={clock.timeHM} unit={clock.timeSec} style={{ alignItems:'baseline' }} />

// NEW:
<div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
  <Num size="lg" value={clock.timeHM} unit={clock.timeSec} style={{ alignItems:'baseline' }} />
  {clock.amPm && <span style={{ fontFamily:T.mono, fontSize:16, color:T.ink2, lineHeight:1 }}>{clock.amPm}</span>}
</div>
```

- [ ] **Step 6: Update main weather temperature display to use `temp` and dynamic unit**

Replace (line ~839):
```js
// OLD:
<Num size="lg" value={`${wx.tempF}°`} unit="F" />

// NEW:
<Num size="lg" value={`${wx.temp}°`} unit={prefs.tempUnit === 'celsius' ? 'C' : 'F'} />
```

- [ ] **Step 7: Update hourly forecast labels to use `fmtHour`**

Replace (line ~848):
```js
// OLD:
<div style={{ fontFamily:T.mono, fontSize:10, color:T.ink3 }}>{h.h}</div>

// NEW:
<div style={{ fontFamily:T.mono, fontSize:10, color:T.ink3 }}>{fmtHour(h.hr, prefs.timeFormat)}</div>
```

- [ ] **Step 8: Pass `prefs` from `App` to `CommandCenter`**

In the `App` return JSX, add `prefs={prefs}` to the `<CommandCenter>` element:
```js
// OLD:
<CommandCenter
  dark={dark} onToggleDark={toggleDark}
  bitaxeApiUrl={bitaxeApiUrl} bitaxeIps={bitaxeIps}
  settingsOpen={settingsOpen}
  onOpenSettings={() => setSettingsOpen(true)}
  onSaveSettings={saveSettings}
  onCloseSettings={() => setSettingsOpen(false)}
/>

// NEW:
<CommandCenter
  dark={dark} onToggleDark={toggleDark}
  bitaxeApiUrl={bitaxeApiUrl} bitaxeIps={bitaxeIps}
  prefs={prefs}
  settingsOpen={settingsOpen}
  onOpenSettings={() => setSettingsOpen(true)}
  onSaveSettings={saveSettings}
  onCloseSettings={() => setSettingsOpen(false)}
/>
```

- [ ] **Step 9: Verify in browser**

Reload the dashboard. Check:
- Clock displays correctly in 12h format (default): `7:30:45 AM`
- Top chrome shows the same format
- Weather loads and shows temperature with `°F` label
- Hourly forecast shows `7am`, `8am` etc. (12h labels, unchanged from before)
- No console errors

- [ ] **Step 10: Commit**

```bash
git add "Command Center.html"
git commit -m "feat: parameterize useClock, wire prefs to weather and clock renders"
```

---

## Task 4: Build `MastheadPanel` component

**Files:**
- Modify: `Command Center.html` — replace `SettingsPanel` function (~line 637) entirely

- [ ] **Step 1: Replace `SettingsPanel` with `MastheadPanel`**

Delete the entire `SettingsPanel` function (lines 637–690) and replace it with:

```js
function MastheadPanel({ apiUrl, ips, prefs, onSave, onClose }) {
  const T = useT();
  const [url, setUrl]           = React.useState(apiUrl);
  const [ipsText, setIpsText]   = React.useState(ips.join(', '));

  const [cityQuery, setCityQuery]           = React.useState(prefs.cityName);
  const [geoResults, setGeoResults]         = React.useState(null); // null | [] | [{...}] | 'error'
  const [geoLoading, setGeoLoading]         = React.useState(false);
  const [pendingLat, setPendingLat]         = React.useState(prefs.lat);
  const [pendingLng, setPendingLng]         = React.useState(prefs.lng);
  const [pendingCityName, setPendingCityName] = React.useState(prefs.cityName);
  const [timeFormat, setTimeFormat]         = React.useState(prefs.timeFormat);
  const [tempUnit, setTempUnit]             = React.useState(prefs.tempUnit);

  const handleSearch = async () => {
    if (!cityQuery.trim()) return;
    setGeoLoading(true);
    setGeoResults(null);
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityQuery.trim())}&count=5&language=en&format=json`);
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
    const newIps = ipsText.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    onSave(url.trim(), newIps, {
      lat: pendingLat,
      lng: pendingLng,
      cityName: pendingCityName,
      timeFormat,
      tempUnit,
    });
  };

  const inp = {
    fontFamily: T.mono, fontSize: 13, color: T.ink,
    background: T.paper2, border: `1px solid ${T.rule2}`,
    padding: '8px 10px', outline: 'none', boxSizing: 'border-box',
  };

  const btnPrimary = {
    fontFamily: T.sans, fontSize: 10, fontWeight: 700,
    letterSpacing: 1.8, textTransform: 'uppercase',
    padding: '9px 22px', cursor: 'pointer', border: 'none',
    background: T.ink, color: T.paper,
  };

  const btnSecondary = {
    fontFamily: T.sans, fontSize: 10, fontWeight: 700,
    letterSpacing: 1.8, textTransform: 'uppercase',
    padding: '9px 22px', cursor: 'pointer', border: 'none',
    background: 'transparent', color: T.ink3,
  };

  const toggleBtn = (active) => ({
    fontFamily: T.mono, fontSize: 12, letterSpacing: 1,
    padding: '7px 14px', cursor: 'pointer', border: 'none',
    background: active ? T.ink : T.paper2,
    color: active ? T.paper : T.ink3,
  });

  return (
    <div style={{ position:'absolute', inset:0, zIndex:10, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:T.paper, border:`1px solid ${T.rule}`, padding:'28px 32px 24px', minWidth:480, maxWidth:560, boxShadow:'0 8px 32px rgba(0,0,0,0.22)' }}>
        <div style={{ borderTop:'3px solid '+T.rule, borderBottom:'1px solid '+T.rule, height:6, marginBottom:18 }} />
        <div style={{ fontFamily:T.serif, fontSize:20, fontWeight:700, letterSpacing:-0.5, marginBottom:20, color:T.ink }}>⚙ The Masthead</div>

        {/* ── Home Fleet ── */}
        <Kicker>Home Fleet</Kicker>
        <div style={{ height:10 }} />

        <Kicker>BitAxe API URL</Kicker>
        <div style={{ fontFamily:T.body, fontStyle:'italic', fontSize:11, color:T.ink3, marginTop:3, marginBottom:6 }}>
          Run bitaxe_api.py on a local server. Leave blank to poll miners directly.
        </div>
        <input style={{ ...inp, display:'block', width:'100%' }}
          value={url} onChange={e => setUrl(e.target.value)}
          placeholder="http://192.168.1.59:3001/api/miners" spellCheck={false} />

        <div style={{ height:14 }} />
        <Kicker>Miner IPs (direct polling fallback)</Kicker>
        <div style={{ fontFamily:T.body, fontStyle:'italic', fontSize:11, color:T.ink3, marginTop:3, marginBottom:6 }}>
          Used when API URL is blank or unreachable. Comma-separated.
        </div>
        <input style={{ ...inp, display:'block', width:'100%' }}
          value={ipsText} onChange={e => setIpsText(e.target.value)}
          placeholder="192.168.1.6, 192.168.1.7" spellCheck={false} />

        {/* ── Preferences ── */}
        <div style={{ borderTop:`1px solid ${T.rule2}`, margin:'20px 0 16px' }} />
        <Kicker>Preferences</Kicker>
        <div style={{ height:10 }} />

        <Kicker>Location</Kicker>
        <div style={{ fontFamily:T.body, fontStyle:'italic', fontSize:11, color:T.ink3, marginTop:3, marginBottom:6 }}>
          Type a city name and select from results.
        </div>
        <div style={{ display:'flex' }}>
          <input
            style={{ ...inp, flex:1 }}
            value={cityQuery}
            onChange={e => { setCityQuery(e.target.value); setGeoResults(null); }}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="e.g. San Francisco"
            spellCheck={false}
          />
          <button
            onClick={handleSearch}
            disabled={geoLoading}
            style={{ fontFamily:T.mono, fontSize:11, letterSpacing:1, padding:'0 14px', background:T.ink, color:T.paper, border:'none', cursor:'pointer', whiteSpace:'nowrap' }}
          >{geoLoading ? '…' : 'Search'}</button>
        </div>
        {geoResults === 'error' && (
          <div style={{ fontFamily:T.mono, fontSize:11, color:T.red, marginTop:4 }}>Search unavailable</div>
        )}
        {Array.isArray(geoResults) && geoResults.length === 0 && (
          <div style={{ fontFamily:T.mono, fontSize:11, color:T.ink3, marginTop:4 }}>No results found</div>
        )}
        {Array.isArray(geoResults) && geoResults.length > 0 && (
          <div style={{ border:`1px solid ${T.rule2}`, borderTop:'none' }}>
            {geoResults.map((r, i) => {
              const label = [r.name, r.admin1, r.country_code].filter(Boolean).join(', ');
              return (
                <div key={i}
                  onClick={() => handleSelectCity(r)}
                  style={{ padding:'7px 10px', borderTop: i > 0 ? `1px solid ${T.rule3}` : 'none', cursor:'pointer', fontFamily:T.mono, fontSize:12, color:T.ink, display:'flex', justifyContent:'space-between', alignItems:'center', background: T.paper }}
                  onMouseEnter={e => e.currentTarget.style.background = T.paper2}
                  onMouseLeave={e => e.currentTarget.style.background = T.paper}
                >
                  <span>{label}</span>
                  <span style={{ color:T.ink3, fontSize:10 }}>{r.latitude.toFixed(2)}, {r.longitude.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        )}
        {pendingCityName && (
          <div style={{ fontFamily:T.mono, fontSize:10, color:T.ink3, marginTop:5 }}>
            Active: {pendingCityName} ({pendingLat.toFixed(4)}, {pendingLng.toFixed(4)})
          </div>
        )}

        {/* Time + Temp toggles */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginTop:16 }}>
          <div>
            <Kicker>Time Format</Kicker>
            <div style={{ display:'flex', border:`1px solid ${T.rule2}`, marginTop:8, width:'fit-content' }}>
              <button style={toggleBtn(timeFormat === '12h')} onClick={() => setTimeFormat('12h')}>12h AM/PM</button>
              <button style={toggleBtn(timeFormat === '24h')} onClick={() => setTimeFormat('24h')}>24h</button>
            </div>
          </div>
          <div>
            <Kicker>Temperature</Kicker>
            <div style={{ display:'flex', border:`1px solid ${T.rule2}`, marginTop:8, width:'fit-content' }}>
              <button style={toggleBtn(tempUnit === 'fahrenheit')} onClick={() => setTempUnit('fahrenheit')}>°F</button>
              <button style={toggleBtn(tempUnit === 'celsius')} onClick={() => setTempUnit('celsius')}>°C</button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:10, marginTop:24, borderTop:`1px solid ${T.rule2}`, paddingTop:18 }}>
          <button style={btnPrimary} onClick={handleSave}>Save</button>
          <button style={btnSecondary} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "Command Center.html"
git commit -m "feat: add MastheadPanel with geocoding search and preference toggles"
```

---

## Task 5: Wire `App` save handler, update button, connect `MastheadPanel`

**Files:**
- Modify: `Command Center.html` — `App` function (~line 1040), `CommandCenter` render (~lines 779–784, 1035)

- [ ] **Step 1: Update `saveSettings` in `App` to handle prefs**

Replace the existing `saveSettings` function:
```js
// OLD:
const saveSettings = (url, ips) => {
  setBitaxeApiUrl(url);
  setBitaxeIps(ips);
  localStorage.setItem('dailynode-bitaxe', JSON.stringify({ apiUrl: url, ips }));
  setSettingsOpen(false);
};

// NEW:
const saveSettings = (url, ips, newPrefs) => {
  setBitaxeApiUrl(url);
  setBitaxeIps(ips);
  localStorage.setItem('dailynode-bitaxe', JSON.stringify({ apiUrl: url, ips }));
  setPrefs(newPrefs);
  localStorage.setItem('dailynode-prefs', JSON.stringify(newPrefs));
  setSettingsOpen(false);
};
```

- [ ] **Step 2: Update the `⚙ Fleet` button to `⚙ Masthead` with warm chip style**

Replace (line ~780):
```js
// OLD:
<button onClick={onOpenSettings} style={{ background:'none', border:'none', cursor:'pointer', fontFamily:T.sans, fontSize:10, fontWeight:600, letterSpacing:1.8, textTransform:'uppercase', color:T.ink3, padding:0 }}>⚙ Fleet</button>

// NEW:
<button onClick={onOpenSettings} style={{ fontFamily:T.sans, fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', padding:'4px 12px', cursor:'pointer', border:'none', background:T.paper2, color:T.ink }}>⚙ Masthead</button>
```

- [ ] **Step 3: Update the `MastheadPanel` render call in `CommandCenter`**

Replace the panel render at the bottom of `CommandCenter` (line ~1035):
```js
// OLD:
{settingsOpen && <SettingsPanel apiUrl={bitaxeApiUrl} ips={bitaxeIps} onSave={onSaveSettings} onClose={onCloseSettings} />}

// NEW:
{settingsOpen && <MastheadPanel apiUrl={bitaxeApiUrl} ips={bitaxeIps} prefs={prefs} onSave={onSaveSettings} onClose={onCloseSettings} />}
```

- [ ] **Step 4: Verify — open The Masthead panel**

Reload the dashboard. Click the `⚙ Masthead` button. Confirm:
- Button has warm chip appearance (light mode: warm beige fill; dark mode: darker fill)
- Modal opens content-sized, centered, with dimmed backdrop
- "Home Fleet" section shows the two existing BitAxe inputs with current values
- "Preferences" section shows Location search, Time Format toggle (12h selected by default), Temperature toggle (°F selected by default)
- Cancel closes the modal with no changes

- [ ] **Step 5: Verify — geocoding search**

In the Location field, type `London` and click Search (or press Enter). Confirm:
- A dropdown appears with up to 5 results (London, England, GB etc.)
- Clicking a result closes the dropdown, updates the input to show the city label, and shows "Active: London, England, GB (51.5074, -0.1278)" below
- No console errors

- [ ] **Step 6: Verify — save preferences and immediate re-fetch**

1. Search for and select a city different from the default (e.g., `Tokyo`)
2. Switch temperature to `°C`
3. Switch time format to `24h`
4. Click Save
5. Confirm:
   - Modal closes
   - Clock updates to 24h format immediately (`14:30:45`, no AM/PM)
   - Weather widget shows temperature in °C
   - Hourly forecast shows `14:00`, `15:00` etc.
   - Top chrome clock shows 24h format
   - Refreshing the page preserves all preferences (loaded from `dailynode-prefs`)
6. Run in DevTools console to confirm persistence:
```js
JSON.parse(localStorage.getItem('dailynode-prefs'))
// Expected: { lat: 35.6762, lng: 139.6503, cityName: "Tokyo, Tokyo, JP", timeFormat: "24h", tempUnit: "celsius" }
```

- [ ] **Step 7: Verify dark mode**

Toggle dark mode. Confirm:
- `⚙ Masthead` button style adapts (darker fill in dark mode)
- Open the panel — it uses dark theme colors throughout (dark background, light text)

- [ ] **Step 8: Commit**

```bash
git add "Command Center.html"
git commit -m "feat: wire MastheadPanel — save handler, button style, prefs persistence"
```

---

## Task 6: Final smoke check

**Files:** None — verification only.

- [ ] **Step 1: Full reload from scratch**

Close and reopen the browser tab (not just refresh — ensure no cached state). Confirm:
- Dashboard loads with saved preferences applied (correct city weather, correct time format)
- No console errors or warnings

- [ ] **Step 2: Round-trip both preference states**

Open The Masthead, switch to 12h + °F, save. Confirm clock and weather update. Open again, switch to 24h + °C, save. Confirm again. Open a third time — confirm the panel's toggles reflect the current saved state (not hard-coded defaults).

- [ ] **Step 3: Empty location search edge cases**

Open The Masthead. Clear the location input and click Search. Confirm: nothing happens (empty query guard). Type a nonsense string like `xyzqwerty123` and search. Confirm: "No results found" appears. Confirm: the previously selected location is still shown as "Active:" and clicking Save preserves it.

- [ ] **Step 4: Final commit message if any cleanup needed**

If any minor fixes were made during verification:
```bash
git add "Command Center.html"
git commit -m "fix: masthead edge cases and final polish"
```
