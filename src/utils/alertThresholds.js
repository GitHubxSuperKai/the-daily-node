function checkFeeThreshold(fastFee, threshold) {
  return typeof fastFee === 'number' && typeof threshold === 'number' && fastFee > threshold;
}

// The block-time alert fires once the newest block is older than this.
const BLOCK_TIME_ALERT_MIN = 15;

function checkBlockTimeThreshold(msSinceLastBlock) {
  return typeof msSinceLastBlock === 'number' && msSinceLastBlock > BLOCK_TIME_ALERT_MIN * 60 * 1000;
}

// Age of the newest block for the block-time alert, or null when it is unknown. While the
// chain feed is erroring, recentBlocks is last-good data, so its age measures the outage
// rather than the network and would fire a false "no block in N minutes".
function msSinceLastBlockFor(chain, nowMs = Date.now()) {
  if (!chain || chain.error) return null;
  const ts = chain.recentBlocks?.[0]?.timestamp;
  return typeof ts === 'number' ? nowMs - ts * 1000 : null;
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

export { BLOCK_TIME_ALERT_MIN, checkFeeThreshold, checkBlockTimeThreshold, msSinceLastBlockFor, checkMinerOfflineThreshold, checkPriceThreshold };
