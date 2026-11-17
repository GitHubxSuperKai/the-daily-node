// Synthetic history daemon (history_daemon.py, CONFIG.HISTORY_BASE on port 3002):
// GET /history/<metric>?from=&to=&bucket= answers a JSON array of rows. This answers
// every metric with no rows, as a daemon with an empty database does. Rows would need
// timestamps inside the requested window, which moves with recorded-at.json, and the
// refresh script never touches backend/, so any fixed rows would fall out of the window
// on the next refresh. With no rows the chart draws from the Kraken OHLC fixtures.
module.exports = {
  match: '**:3002/history/*',
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify([]),
};
