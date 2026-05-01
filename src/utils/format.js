/**
 * Format mempool size in MB
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size (e.g., "1.2 MB")
 */
export function fmtMempoolMB(bytes) {
  if (!bytes || bytes === 0) return '0 MB';
  const mb = bytes / 1000000;
  return mb > 100 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

/**
 * Calculate next halving date from block height
 * @param {number} height - Current block height
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
export function nextHalving(height) {
  const halvingInterval = 210000;
  const nextHalvingBlock = Math.ceil((height + 1) / halvingInterval) * halvingInterval;
  const blocksRemaining = nextHalvingBlock - height;
  const daysRemaining = blocksRemaining / 144;
  const date = new Date(Date.now() + daysRemaining * 86400000);
  return date.toISOString().slice(0, 10);
}

/**
 * Calculate circulating BTC supply from block height
 * @param {number} height - Current block height
 * @returns {string} Formatted supply (e.g., "21.00M BTC")
 */
export function circulatingBTC(height) {
  let supply = 0;
  let reward = 50;
  let h = 0;
  while (h + 210000 <= height) {
    supply += 210000 * reward;
    reward /= 2;
    h += 210000;
  }
  supply += (height - h) * reward;
  return `${(supply / 1e6).toFixed(2)}M BTC`;
}

/**
 * Format hour for display in 12h or 24h format
 * @param {number} hr - Hour (0-23)
 * @param {string} timeFormat - '12h' or '24h'
 * @returns {string} Formatted hour (e.g., "2 PM" or "14")
 */
export function fmtHour(hr, timeFormat = '24h') {
  const pad = (n) => String(n).padStart(2, '0');
  if (timeFormat === '12h') {
    const ampm = hr < 12 ? 'AM' : 'PM';
    const h12 = hr % 12 || 12;
    return `${h12} ${ampm}`;
  }
  return pad(hr);
}

export function fmtBestDiff(v) {
  if (!v || v <= 0) return '—';
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `${(v / 1e9).toFixed(2)}G`;
  if (v >= 1e6)  return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3)  return `${(v / 1e3).toFixed(1)}K`;
  return String(v);
}

// CommonJS exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fmtMempoolMB,
    nextHalving,
    circulatingBTC,
    fmtHour,
    fmtBestDiff,
  };
}
