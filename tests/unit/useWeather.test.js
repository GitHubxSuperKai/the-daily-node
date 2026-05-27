import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useWeather } from '../../src/hooks/useWeather.js';

const hourlyTimes = Array.from({ length: 48 }, (_, i) => {
  const d = new Date(2026, 4, 26, i, 0, 0);
  return d.toISOString().slice(0, 16);
});

const wxOk = {
  ok: true,
  json: async () => ({
    current: {
      temperature_2m: 72,
      apparent_temperature: 70,
      weather_code: 0,
      wind_speed_10m: 5,
      wind_direction_10m: 180,
      relative_humidity_2m: 50,
      wind_gusts_10m: 8,
      pressure_msl: 1015,
      dew_point_2m: 55,
    },
    hourly: {
      time: hourlyTimes,
      temperature_2m: hourlyTimes.map(() => 70),
      weather_code: hourlyTimes.map(() => 0),
      precipitation_probability: hourlyTimes.map(() => 0),
      precipitation: hourlyTimes.map(() => 0),
    },
    daily: {
      sunrise: ['2026-05-26T06:00', '2026-05-27T06:00'],
      sunset: ['2026-05-26T20:30', '2026-05-27T20:30'],
      temperature_2m_max: [75, 76],
      temperature_2m_min: [60, 61],
      precipitation_sum: [0, 0],
      uv_index_max: [5, 6],
      wind_speed_10m_max: [10, 12],
      weather_code: [0, 0],
    },
  }),
};

describe('useWeather', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // useWeather references wmoDesc as a build-time global (concatenated from
    // src/utils/formatting.js by build.js). Stub it for unit tests.
    globalThis.wmoDesc = (code) => `code-${code}`;
  });

  it('exposes current weather + sunset times', async () => {
    global.fetch = vi.fn().mockResolvedValue(wxOk);
    const { result } = renderHook(() => useWeather(37.7, -122.4, 'fahrenheit'));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(result.current.data.temp).toBe(72);
    expect(result.current.data.feels).toBe(70);
    expect(result.current.data.wxHi).toBe(75);
    expect(result.current.data.wxLo).toBe(60);
    expect(result.current.data.wxSunrise).toBe('06:00');
    expect(result.current.data.wxSunset).toBe('20:30');
    // data.hourly is intentionally not asserted — useWeather builds it from
    // new Date().getHours(), so any assertion on it would be clock-dependent.
    expect(result.current.err).toBe(false);
    expect(result.current.lastOk).toBeGreaterThan(0);
  });

  it('sets err=true on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('network'));
    const { result } = renderHook(() => useWeather(37.7, -122.4, 'fahrenheit'));
    await waitFor(() => expect(result.current.err).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
