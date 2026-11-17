// Recorded by scripts/verify-refresh-fixtures.cjs from https://api.kraken.com/0/public/Ticker?pair=XBTUSD
// Do not edit by hand: rerun `npm run verify:refresh-fixtures` and review the diff.
module.exports = {
  match: "https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    "error": [],
    "result": {
      "XXBTZUSD": {
        "a": ["64913.90000", "1", "1.000"],
        "b": ["64913.80000", "1", "1.000"],
        "c": ["64913.90000", "0.00127061"],
        "v": ["980.84671531", "4620.78411900"],
        "p": ["64618.44303", "64727.25389"],
        "t": [28003, 193027],
        "l": ["64318.90000", "63840.00000"],
        "h": ["65118.00000", "65633.50000"],
        "o": "64813.70000"
      }
    }
  }),
};
