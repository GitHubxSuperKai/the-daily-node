// Synthetic /api/mempool-proxy for path=/api/blocks/tip/height. bitaxe_api.py forwards that path to the
// self-hosted mempool node set in Settings and passes the body through unchanged, so
// this answers with the recorded public mempool.space body for the same path rather
// than a second, hand-made chain state. The proxy always sends application/json.
const recorded = require('../public/mempool.space-tip-height.js');

module.exports = {
  match: '**/api/mempool-proxy?*path=%2Fapi%2Fblocks%2Ftip%2Fheight',
  status: 200,
  contentType: 'application/json',
  body: recorded.body,
};
