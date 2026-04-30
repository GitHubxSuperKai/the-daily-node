import { useState, useEffect } from 'react';
import CONFIG from '../config.js';

/**
 * useWeather Hook
 * Fetches weather from Open-Meteo API
 *
 * Returns: {
 *   data: object with { temp, feels, wxCond, wxCode, wxWindSpeed, wxWind, wxHum, wxHi, wxLo, wxSunriseHr, wxSunsetHr, hourly },
 *   err: boolean,
 *   lastOk: timestamp or null,
 *   interval: number (for feed health tracking)
 * }
 */
export function useWeather(lat, lng, tempUnit) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [lastOk, setLastOk] = useState(null);

  const fetchWeather = async () => {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m&hourly=temperature_2m,weather_code,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&temperature_unit=${tempUnit}&wind_speed_unit=mph&forecast_days=1&timezone=auto`;
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
        hourly: hourly.slice(0, 8),
      });
      setErr(false);
      setLastOk(Date.now());
    } catch {
      setErr(true);
    }
  };

  useEffect(() => {
    fetchWeather();
    const id = setInterval(fetchWeather, CONFIG.REFRESH_INTERVALS.weather);
    return () => clearInterval(id);
  }, [lat, lng, tempUnit]);

  return {
    data,
    err,
    lastOk,
    interval: CONFIG.REFRESH_INTERVALS.weather,
  };
}
