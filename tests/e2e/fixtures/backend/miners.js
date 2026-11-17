// Synthetic /api/miners, in the shape bitaxe_api.py builds (fetch_all_miners): one entry
// per configured miner; an online entry carries the miner's AxeOS /api/system/info body
// as `data`, an offline one carries `error` and no `data` at all, so the dashboard can
// only name it by its address. The fields are the ones the dashboard reads (MinerRow,
// Miners, FleetSummary, the mobile panels); every value is invented. Addresses are
// RFC 5737 documentation addresses (192.0.2.0/24), never a real network.
const miners = [
  {
    ip: '192.0.2.11',
    online: true,
    data: {
      hostname: 'miner-1',
      hashRate: 1210.5,
      power: 18.4,
      temp: 54.2,
      vrTemp: 58,
      uptimeSeconds: 259200,
      sharesAccepted: 48211,
      sharesRejected: 37,
      powerLimit: 25,
      version: 'v2.15.3',
    },
  },
  {
    ip: '192.0.2.12',
    online: false,
    error: 'timed out',
  },
  {
    ip: '192.0.2.13',
    online: true,
    data: {
      hostname: 'miner-3',
      hashRate: 498.2,
      power: 14.1,
      temp: 49.8,
      vrTemp: 52,
      uptimeSeconds: 7200,
      sharesAccepted: 1422,
      sharesRejected: 2,
      powerLimit: 20,
      version: 'v2.14.1',
    },
  },
];

module.exports = {
  match: '**/api/miners',
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ miners, count: miners.length }),
};
