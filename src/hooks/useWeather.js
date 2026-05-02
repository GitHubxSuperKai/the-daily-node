import { useState, useEffect, useRef, useCallback } from 'react';
import CONFIG from '../config.js';
import { useResettableInterval } from './useResettableInterval.js';

/**
 * useWeather Hook
 * Fetches weather from Open-Meteo API
 *
 * Returns: {
 *   data: object with { temp, feels, wxCond, wxCode, wxWindSpeed, wxWind, wxHum, wxHi, wxLo, wxSunriseHr, wxSunsetHr, hourly, wxUVIndexTomorrow },
 *   err: boolean,
 *   lastOk: timestamp or null,
 *   interval: number (for feed health tracking)
 * }
 */
export function useWeather(lat, lng, tempUnit) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [lastOk, setLastOk] = useState(null);

  const fetchWeather = useCallback(async () => {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,wind_gusts_10m,pressure_msl,dew_point_2m&hourly=temperature_2m,weather_code,precipitation_probability,precipitation&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,uv_index_max,wind_speed_10m_max&temperature_unit=${tempUnit}&wind_speed_unit=mph&forecast_days=2&timezone=auto`;
      const r = await fetch(url);
      if (!r.ok) throw new Error('weather');
      const j = await r.json();

      const cur = j.current;
      const windDirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const windDir = windDirs[Math.round(cur.wind_direction_10m / 45) % 8];
      const now = new Date();
      const curHour = now.getHours();

      // Build 8 hourly slots starting from current hour
      const hourly = [];
      for (let i = 0; i < 8; i++) {
        const idx = j.hourly.time.findIndex(t => {
          const h = new Date(t).getHours();
          return h === (curHour + i) % 24;
        });
        if (idx >= 0) {
          const t = new Date(j.hourly.time[idx]);
          const hr = t.getHours();
          hourly.push({
            hr,
            t: Math.round(j.hourly.temperature_2m[idx]),
            code: j.hourly.weather_code[idx],
            pop: j.hourly.precipitation_probability[idx] ?? 0,
            precip: j.hourly.precipitation?.[idx] ?? 0,
          });
        }
      }

      setData({
        temp: Math.round(cur.temperature_2m),
        feels: Math.round(cur.apparent_temperature),
        wxCond: wmoDesc(cur.weather_code),
        wxCode: cur.weather_code,
        wxWindSpeed: Math.round(cur.wind_speed_10m),
        wxWind: `${windDir} ${Math.round(cur.wind_speed_10m)} mph`,
        wxHum: `${cur.relative_humidity_2m}%`,
        wxHi: Math.round(j.daily.temperature_2m_max[0]),
        wxLo: Math.round(j.daily.temperature_2m_min[0]),
        wxSunriseHr: parseInt(j.daily.sunrise[0].split('T')[1]),
        wxSunsetHr: parseInt(j.daily.sunset[0].split('T')[1]),
        wxSunrise: j.daily.sunrise[0].split('T')[1]?.slice(0, 5),
        wxSunset: j.daily.sunset[0].split('T')[1]?.slice(0, 5),
        wxPrecipTotal: j.daily.precipitation_sum?.[0] != null ? j.daily.precipitation_sum[0].toFixed(1) : null,
        wxUVIndex: j.daily.uv_index_max?.[0] != null ? Math.round(j.daily.uv_index_max[0]) : null,
        wxUVIndexTomorrow: j.daily.uv_index_max?.[1] != null ? Math.round(j.daily.uv_index_max[1]) : null,
        wxDailyWindMax: j.daily.wind_speed_10m_max?.[0] != null ? Math.round(j.daily.wind_speed_10m_max[0]) : null,
        wxGusts: cur.wind_gusts_10m != null ? Math.round(cur.wind_gusts_10m) : null,
        wxPressure: cur.pressure_msl != null ? Math.round(cur.pressure_msl) : null,
        wxDewPoint: cur.dew_point_2m != null ? Math.round(cur.dew_point_2m) : null,
        hourly: hourly.slice(0, 8),
      });
      setErr(false);
      setLastOk(Date.now());
    } catch {
      setErr(true);
    }
  }, [lat, lng, tempUnit]);

  const { reset: resetWeather } = useResettableInterval(fetchWeather, CONFIG.REFRESH_INTERVALS.weather);

  // Re-fetch immediately when location or units change (preserves original behavior)
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) { hasMountedRef.current = true; return; }
    resetWeather();
  }, [lat, lng, tempUnit]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    data,
    err,
    lastOk,
    interval: CONFIG.REFRESH_INTERVALS.weather,
    refresh: resetWeather,
  };
}
