// Recorded by scripts/verify-refresh-fixtures.cjs from https://mempool.space/api/v1/difficulty-adjustment
// Do not edit by hand: rerun `npm run verify:refresh-fixtures` and review the diff.
module.exports = {
  match: "https://mempool.space/api/v1/difficulty-adjustment",
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    "progressPercent": 23.561507936507937,
    "difficultyChange": 7.943121387311147,
    "estimatedRetargetDate": 1795746473573,
    "remainingBlocks": 1541,
    "remainingTime": 858264573,
    "previousRetarget": -9.126656385443539,
    "previousTime": 1794632570,
    "nextRetargetHeight": 977760,
    "timeAvg": 538187,
    "adjustedTimeAvg": 556953,
    "timeOffset": 0,
    "expectedBlocks": 426.065
  }),
};
