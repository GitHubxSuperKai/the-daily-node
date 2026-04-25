# The Masthead — Location & Preferences Design

**Date:** 2026-04-24
**Feature:** Location-based weather, user preferences (time format, temperature units), renamed settings panel

---

## Overview

Replace the existing "Fleet Settings" panel with a unified "The Masthead" panel that combines BitAxe fleet configuration with user preferences: location (for weather), time format, and temperature units. Location is entered by city name search powered by the Open-Meteo geocoding API. All preferences are saved to `localStorage` and take effect immediately without a page reload.

---

## Architecture

**Pattern:** Extend `App` state — the same approach used for BitAxe config today. A new `prefs` state object lives in `App`, flows down as props to `CommandCenter`, and is passed into the hooks that need it. No new contexts or abstractions.

**New `App` state:**
```js
const [prefs, setPrefs] = React.useState(() => {
  const s = loadPrefs(); // reads 'dailynode-prefs' from localStorage
  return {
    lat:        s.lat        ?? CONFIG.WEATHER_LAT,
    lng:        s.lng        ?? CONFIG.WEATHER_LNG,
    cityName:   s.cityName   ?? '',
    timeFormat: s.timeFormat ?? '12h',
    tempUnit:   s.tempUnit   ?? 'fahrenheit',
  };
});
```

**localStorage keys:**
- `dailynode-bitaxe` — unchanged: `{ apiUrl, ips }`
- `dailynode-prefs` — new: `{ lat, lng, cityName, timeFormat, tempUnit }`

**First-load defaults:** `CONFIG.WEATHER_LAT/LNG`, `12h`, `fahrenheit`, empty `cityName` (input shows placeholder).

---

## Hook Changes

### `useWeather(lat, lng, tempUnit)`

Parameterized — currently reads from `CONFIG` directly. After this change it accepts `lat`, `lng`, `tempUnit` as arguments. The `useEffect` dep array includes all three, so any change triggers an immediate re-fetch (same mechanism as `useBitaxe`).

The `temperature_unit` query param becomes `tempUnit === 'celsius' ? 'celsius' : 'fahrenheit'`. Wind speed stays in mph regardless (not a user preference).

**Hourly slot shape change:** Currently `{ h: label, t, g }` where `h` is a pre-formatted AM/PM string. Changed to `{ hr, t, g }` where `hr` is the raw 0–23 integer. Formatting moves to the render layer so the component can apply the user's time format preference without re-fetching.

### `useClock(timeFormat)`

Accepts `timeFormat` (`'12h'` | `'24h'`). Returns:
- `timeHM` — hours and minutes only, no AM/PM suffix: `7:30` or `14:30`
- `timeSec` — unchanged: `:45`
- `amPm` — `'AM'` | `'PM'` in 12h mode, `''` in 24h mode

12h: `h % 12 || 12` for hours, `h < 12 ? 'AM' : 'PM'` for `amPm`.
24h: `pad(h)` for hours, `amPm = ''`.

The JSX renders `{clock.timeHM}{clock.timeSec} {clock.amPm}` — producing `7:30:45 AM` (12h) or `14:30:45` (24h). `dayStr` is unchanged.

### Hourly label formatting helper (render layer)

A small pure function used wherever hourly weather labels are rendered:
```js
function fmtHour(hr, timeFormat) {
  if (timeFormat === '24h') return `${String(hr).padStart(2, '0')}:00`;
  if (hr === 0)  return '12am';
  if (hr < 12)   return `${hr}am`;
  if (hr === 12) return '12pm';
  return `${hr - 12}pm`;
}
```

---

## The Masthead Panel

### Rename & button

The existing `SettingsPanel` component is renamed to `MastheadPanel`. The `⚙ Fleet` button in the top chrome becomes `⚙ Masthead` with a warm filled chip style: `background: T.paper2` (theme-aware warm tone in light mode, dark surface in dark mode), dark text. No second button — one button, one panel.

### Panel structure

```
⚙ The Masthead
─────────────────────────────
HOME FLEET
  BitAxe API URL   [input]
  Miner IPs        [input]
─────────────────────────────
PREFERENCES
  Location         [text input] [Search button]
                   [dropdown results — up to 5]
  Time Format      [12h AM/PM] [24h]  (segmented toggle)
  Temperature      [°F] [°C]          (segmented toggle)
─────────────────────────────
[Save]  [Cancel]
```

Modal sizing: `min-width: 480px`, `max-width: 560px`, height wraps content. Centered over canvas with a dimmed backdrop. All colors use theme tokens (`T.paper`, `T.paper2`, `T.rule`, `T.ink`, `T.ink2`, `T.ink3`) so the panel adapts correctly in both light and dark mode.

### Geocoding search

API: `https://geocoding-api.open-meteo.com/v1/search?name=<query>&count=5&language=en&format=json`
No API key required. Same provider as weather (Open-Meteo).

Response shape: `{ results: [{ name, admin1, country_code, latitude, longitude }] }`

Display label per result: `${name}, ${admin1}, ${country_code}` with `lat, lng` shown in muted text.

Search triggers on: Search button click **and** Enter key in the location input.

On selection: dropdown closes, input shows the selected city label, `pendingLat/pendingLng/pendingCityName` are set in panel local state. Nothing is committed to App state until Save is clicked.

Error states: "No results found" if API returns empty results. "Search unavailable" if fetch fails. Shown inline below the input, no modal-level error.

### Local state in `MastheadPanel`

```js
const [url, setUrl]                     // BitAxe API URL (string)
const [ipsText, setIpsText]             // Miner IPs (comma string)
const [cityQuery, setCityQuery]         // geocode search input text
const [geoResults, setGeoResults]       // array of result objects | null | 'error'
const [geoLoading, setGeoLoading]       // bool
const [pendingLat, setPendingLat]       // number
const [pendingLng, setPendingLng]       // number
const [pendingCityName, setPendingCityName] // display string
const [timeFormat, setTimeFormat]       // '12h' | '24h'
const [tempUnit, setTempUnit]           // 'fahrenheit' | 'celsius'
```

All pending fields initialise from the current `prefs` prop passed in from `App`.

### Save callback signature

`onSave(url, ips, prefs)` where `prefs = { lat, lng, cityName, timeFormat, tempUnit }`.

`App.saveSettings` writes both localStorage keys, updates both state objects, and closes the panel.

---

## Data Flow Summary

```
App
 ├─ prefs state  ──────────────────────────────► MastheadPanel (initial values)
 │                                                    └─ onSave(url, ips, prefs)
 │                                                         └─ updates App state + localStorage
 └─ CommandCenter(prefs, ...)
      ├─ useClock(prefs.timeFormat)
      ├─ useWeather(prefs.lat, prefs.lng, prefs.tempUnit)
      │    └─ re-fetches immediately when any param changes
      └─ fmtHour(hr, prefs.timeFormat) used in hourly forecast render
```

---

## What Is Not Changing

- `INTERVALS.WEATHER` (15 min polling) — unchanged
- `dailynode-bitaxe` localStorage key — unchanged
- `CONFIG.WEATHER_LAT/LNG` — still used as fallback defaults, not removed
- Wind speed units (always mph)
- All other dashboard panels, hooks, and components
- The single-file, no-build-step architecture
