// Recorded by scripts/verify-refresh-fixtures.cjs from https://mempool.space/api/v1/fees/recommended
// Do not edit by hand: rerun `npm run verify:refresh-fixtures` and review the diff.
module.exports = {
  match: "https://mempool.space/api/v1/fees/recommended",
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    "fastestFee": 1,
    "halfHourFee": 1,
    "hourFee": 1,
    "economyFee": 1,
    "minimumFee": 1
  }),
};
