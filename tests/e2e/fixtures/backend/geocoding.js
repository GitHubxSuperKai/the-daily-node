// Synthetic Open-Meteo geocoding (geocoding-api.open-meteo.com), used only by the city
// search in src/components/settings/PreferencesSection.jsx. Never recorded: any real
// search returns a real place. Whatever is searched, the one result is at 0,0, the
// app's default location (src/config.js).
module.exports = {
  match: '**/v1/search?*',
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    results: [
      {
        id: 1,
        name: 'Null Island',
        latitude: 0,
        longitude: 0,
        country_code: 'XX',
        admin1: 'Gulf of Guinea',
      },
    ],
    generationtime_ms: 0.1,
  }),
};
