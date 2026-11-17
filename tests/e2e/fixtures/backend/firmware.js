// Synthetic /api/firmware: bitaxe_api.py answers { latest: <ESP-Miner release tag> }.
// miner-1 in miners.js runs this version and miner-3 an older one, so the fleet shows
// one firmware-update badge.
module.exports = {
  match: '**/api/firmware',
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ latest: 'v2.15.3' }),
};
