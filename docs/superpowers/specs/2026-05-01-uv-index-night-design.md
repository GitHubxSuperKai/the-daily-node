# UV Index Night State Design

## Context

The weather widget shows a daily UV max value (`uv_index_max[0]`) in the stat grid. In the evening/at night this is ambiguous — the user can't tell if the number refers to today's already-passed peak or tomorrow's forecast. The fix: after sunset, flip the UV cell to show tomorrow's forecast and relabel it "UV Tomorrow" so it's always forward-looking and actionable.

## Design

### Behavior

| Time | Label | Value source |
|------|-------|-------------|
| Before sunset (`hour < wxSunsetHr`) | UV Index | `wxUVIndex` (today's max) |
| After sunset (`hour >= wxSunsetHr`) | UV Tomorrow | `wxUVIndexTomorrow` (tomorrow's max) |

Color coding, progress bar, and rating label (Low / Moderate / High / Very High) all reflect whichever value is active. No other visual changes.

### Trigger

`new Date().getHours() >= wx.wxSunsetHr` — the sunset hour is already in the data object and used by the icon renderer for the same day/night distinction.

---

## Changes

### `src/hooks/useWeather.js`

1. **URL**: change `forecast_days=1` → `forecast_days=2` so the API returns two days of daily data.
2. **`setData`**: add one field alongside `wxUVIndex`:
   ```js
   wxUVIndexTomorrow: j.daily.uv_index_max?.[1] != null ? Math.round(j.daily.uv_index_max[1]) : null,
   ```

### `src/components/Weather.jsx`

In the UV cell (lines 47–90), replace the static `uv` derivation with a time-aware one:

```js
const hr = new Date().getHours();
const isNight = hr >= wx.wxSunsetHr;
const uv = isNight ? (wx.wxUVIndexTomorrow ?? 0) : (wx.wxUVIndex ?? 0);
const uvLabel = /* existing threshold logic, unchanged */;
const uvColor = /* existing threshold logic, unchanged */;
const uvCellLabel = isNight ? 'UV Tomorrow' : 'UV Index';
```

Replace the hardcoded `<div style={lbl}>UV Index</div>` with `<div style={lbl}>{uvCellLabel}</div>`.

---

## Verification

1. **Daytime test**: temporarily force `hr = 10` in the component — label should read "UV Index", value from `wxUVIndex`.
2. **Night test**: force `hr = 21` — label should read "UV Tomorrow", value from `wxUVIndexTomorrow`, color/bar reflect tomorrow's value.
3. **Null guard**: if `wxUVIndexTomorrow` is null (edge case at end of forecast window), falls back to `0` — same behavior as the existing `wxUVIndex ?? 0`.
4. **Visual check**: run dev server, confirm the stat grid renders correctly in both states with no layout shifts.
