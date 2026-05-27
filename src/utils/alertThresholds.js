function checkFeeThreshold(fastFee, threshold) {
  return typeof fastFee === 'number' && typeof threshold === 'number' && fastFee > threshold;
}

function checkBlockTimeThreshold(msSinceLastBlock) {
  return typeof msSinceLastBlock === 'number' && msSinceLastBlock > 15 * 60 * 1000;
}

function checkMinerOfflineThreshold(offlineCount) {
  return typeof offlineCount === 'number' && offlineCount > 0;
}

// historyPoints must be sorted oldest-first (ascending ts), as returned by the history daemon.
// Finds the oldest point within the window to use as baseline for % change computation.
function checkPriceThreshold(currentUsd, historyPoints, pctThreshold, windowSeconds) {
  if (!Array.isArray(historyPoints) || historyPoints.length === 0) return false;
  if (typeof currentUsd !== 'number' || currentUsd <= 0) return false;
  const cutoff = Math.floor(Date.now() / 1000) - windowSeconds;
  const baseline = historyPoints.find(p => p.ts >= cutoff);
  if (!baseline || typeof baseline.usd !== 'number' || baseline.usd <= 0) return false;
  return Math.abs((currentUsd - baseline.usd) / baseline.usd * 100) >= pctThreshold;
}

export { checkFeeThreshold, checkBlockTimeThreshold, checkMinerOfflineThreshold, checkPriceThreshold };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { checkFeeThreshold, checkBlockTimeThreshold, checkMinerOfflineThreshold, checkPriceThreshold };
}
