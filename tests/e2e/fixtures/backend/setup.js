// Synthetic /api/setup. The glob answers both methods: GET in bitaxe_api.py returns
// { bitaxe_ips, configured } and a successful POST returns { bitaxe_ips }, so one body
// carrying both keys serves either. The addresses match miners.js.
module.exports = {
  match: '**/api/setup',
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    bitaxe_ips: ['192.0.2.11', '192.0.2.12', '192.0.2.13'],
    configured: true,
  }),
};
