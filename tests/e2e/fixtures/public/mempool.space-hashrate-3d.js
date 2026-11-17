// Recorded by scripts/verify-refresh-fixtures.cjs from https://mempool.space/api/v1/mining/hashrate/3d
// Do not edit by hand: rerun `npm run verify:refresh-fixtures` and review the diff.
module.exports = {
  match: "https://mempool.space/api/v1/mining/hashrate/3d",
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    "hashrates": [
      {
        "timestamp": 1794700800,
        "avgHashrate": 925773422368779800000
      },
      {
        "timestamp": 1794787200,
        "avgHashrate": 1.147471462806631e+21
      },
      {
        "timestamp": 1794873600,
        "avgHashrate": 1.10230448392204e+21
      }
    ],
    "difficulty": [
      {
        "time": 1794632570,
        "height": 975744,
        "difficulty": 134823837323272.7,
        "adjustment": 0.9087330102920532
      }
    ],
    "currentHashrate": 968375511838290600000,
    "currentDifficulty": 134823837323272.7
  }),
};
