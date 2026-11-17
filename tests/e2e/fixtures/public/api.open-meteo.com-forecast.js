// Recorded by scripts/verify-refresh-fixtures.cjs from https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,wind_gusts_10m,pressure_msl,dew_point_2m&hourly=temperature_2m,weather_code,precipitation_probability,precipitation&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,uv_index_max,wind_speed_10m_max&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=2&timezone=auto
// Do not edit by hand: rerun `npm run verify:refresh-fixtures` and review the diff.
module.exports = {
  match: "https://api.open-meteo.com/v1/forecast?*",
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    "latitude": 0,
    "longitude": 0,
    "generationtime_ms": 0.7774829864501953,
    "utc_offset_seconds": 0,
    "timezone": "Etc/GMT",
    "timezone_abbreviation": "GMT",
    "elevation": 0,
    "current_units": {
      "time": "iso8601",
      "interval": "seconds",
      "temperature_2m": "°F",
      "apparent_temperature": "°F",
      "weather_code": "wmo code",
      "wind_speed_10m": "mp/h",
      "wind_direction_10m": "°",
      "relative_humidity_2m": "%",
      "wind_gusts_10m": "mp/h",
      "pressure_msl": "hPa",
      "dew_point_2m": "°F"
    },
    "current": {
      "time": "2026-11-17T04:00",
      "interval": 900,
      "temperature_2m": 80.1,
      "apparent_temperature": 85.5,
      "weather_code": 3,
      "wind_speed_10m": 11.4,
      "wind_direction_10m": 164,
      "relative_humidity_2m": 82,
      "wind_gusts_10m": 18.3,
      "pressure_msl": 1011,
      "dew_point_2m": 74.1
    },
    "hourly_units": {
      "time": "iso8601",
      "temperature_2m": "°F",
      "weather_code": "wmo code",
      "precipitation_probability": "%",
      "precipitation": "mm"
    },
    "hourly": {
      "time": ["2026-11-17T00:00", "2026-11-17T01:00", "2026-11-17T02:00", "2026-11-17T03:00", "2026-11-17T04:00", "2026-11-17T05:00", "2026-11-17T06:00", "2026-11-17T07:00", "2026-11-17T08:00", "2026-11-17T09:00", "2026-11-17T10:00", "2026-11-17T11:00", "2026-11-17T12:00", "2026-11-17T13:00", "2026-11-17T14:00", "2026-11-17T15:00", "2026-11-17T16:00", "2026-11-17T17:00", "2026-11-17T18:00", "2026-11-17T19:00", "2026-11-17T20:00", "2026-11-17T21:00", "2026-11-17T22:00", "2026-11-17T23:00", "2026-11-18T00:00", "2026-11-18T01:00", "2026-11-18T02:00", "2026-11-18T03:00", "2026-11-18T04:00", "2026-11-18T05:00", "2026-11-18T06:00", "2026-11-18T07:00", "2026-11-18T08:00", "2026-11-18T09:00", "2026-11-18T10:00", "2026-11-18T11:00", "2026-11-18T12:00", "2026-11-18T13:00", "2026-11-18T14:00", "2026-11-18T15:00", "2026-11-18T16:00", "2026-11-18T17:00", "2026-11-18T18:00", "2026-11-18T19:00", "2026-11-18T20:00", "2026-11-18T21:00", "2026-11-18T22:00", "2026-11-18T23:00"],
      "temperature_2m": [79.5, 79.1, 78.5, 79.3, 80.1, 80, 79.6, 80.2, 81, 81.3, 81.2, 81.4, 81.4, 81.6, 81.4, 81.9, 78.7, 78.9, 79.1, 79.3, 80.2, 80.4, 80.2, 80.3, 80.5, 80.6, 81, 80.4, 78.2, 79.1, 80.1, 80.2, 80.1, 80.5, 81, 80.7, 80.4, 80.6, 80.3, 80.7, 81, 80.8, 81, 81.2, 81.5, 81.6, 81.7, 81.4],
      "weather_code": [51, 51, 51, 1, 3, 1, 51, 1, 3, 2, 2, 51, 1, 2, 51, 51, 80, 81, 53, 51, 1, 2, 1, 1, 0, 1, 1, 51, 80, 51, 1, 1, 51, 51, 51, 51, 51, 1, 2, 0, 0, 1, 1, 0, 0, 0, 0, 2],
      "precipitation_probability": [51, 53, 63, 69, 66, 60, 55, 52, 50, 49, 48, 48, 47, 45, 44, 43, 45, 49, 51, 48, 44, 41, 41, 42, 45, 51, 59, 65, 68, 70, 69, 63, 55, 49, 49, 51, 51, 44, 35, 27, 22, 19, 16, 14, 12, 12, 13, 14],
      "precipitation": [0.1, 0.2, 0.1, 0, 0, 0, 0.1, 0, 0, 0, 0, 0.1, 0, 0, 0.3, 0.2, 1.9, 3.5, 0.9, 0.3, 0, 0, 0, 0, 0, 0, 0, 0.2, 2, 0.4, 0, 0, 0.1, 0.2, 0.2, 0.3, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    "daily_units": {
      "time": "iso8601",
      "temperature_2m_max": "°F",
      "temperature_2m_min": "°F",
      "sunrise": "iso8601",
      "sunset": "iso8601",
      "precipitation_sum": "mm",
      "uv_index_max": "",
      "wind_speed_10m_max": "mp/h"
    },
    "daily": {
      "time": ["2026-11-17", "2026-11-18"],
      "temperature_2m_max": [82, 81.7],
      "temperature_2m_min": [78.4, 78.1],
      "sunrise": ["2026-11-17T05:41", "2026-11-18T05:41"],
      "sunset": ["2026-11-17T17:48", "2026-11-18T17:48"],
      "precipitation_sum": [7.7, 3.5],
      "uv_index_max": [8.9, 8.9],
      "wind_speed_10m_max": [13.6, 10]
    }
  }),
};
