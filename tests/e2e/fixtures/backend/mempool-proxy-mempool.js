// Synthetic /api/mempool-proxy for path=/api/mempool. bitaxe_api.py forwards that path to the
// self-hosted mempool node set in Settings and passes the body through unchanged, so
// this answers with the recorded public mempool.space body for the same path rather
// than a second, hand-made chain state. The proxy always sends application/json.
const recorded = require('../public/mempool.space-mempool.js');

module.exports = {
  match: '**/api/mempool-proxy?*path=%2Fapi%2Fmempool',
  status: 200,
  contentType: 'application/json',
  body: recorded.body,
};
