// ─── Formatting Utilities ───────────────────────────────────────
// Pure functions for number, price, time, weather, and Bitcoin formatting

function fmtNum(n, decimals = 0) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPrice(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${Number(n).toFixed(2)}`;
}

function fmtVolUsd(v) {
  if (v == null || isNaN(v)) return '—';
  return v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${Math.round(v / 1e6)}M`;
}

function fmtBlockTime(ms) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function fmtHashrate(ehsRaw) {
  // mempool returns H/s
  const ehs = ehsRaw / 1e18;
  return ehs >= 1 ? `${ehs.toFixed(0)} EH/s` : `${(ehsRaw / 1e15).toFixed(1)} PH/s`;
}

function fmtDiff(d) {
  if (d >= 1e12) return `${(d / 1e12).toFixed(1)} T`;
  if (d >= 1e9)  return `${(d / 1e9).toFixed(1)} B`;
  return fmtNum(d);
}

function fmtMempoolMB(bytes) {
  if (!bytes || bytes === 0) return '0 MB';
  const mb = bytes / 1e6;
  return mb > 100 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 1)    return 'just now';
  if (diff < 60)   return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function fmtHour(hr, timeFormat) {
  if (timeFormat === '24h') return `${String(hr).padStart(2, '0')}:00`;
  if (hr === 0)  return '12am';
  if (hr < 12)   return `${hr}am`;
  if (hr === 12) return '12pm';
  return `${hr - 12}pm`;
}

// Format a "HH:MM" string (e.g. "18:00") per timeFormat preference
function fmtHHMM(hhmm, timeFormat) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (timeFormat === '24h') return hhmm;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

// Format a date input as YYYY-MM-DD, or return null if it can't be parsed.
// Date.prototype.toISOString() throws RangeError on an invalid or out-of-range
// date; a degraded external source (e.g. a garbage retarget timestamp) can
// produce exactly that. getTime() returns NaN instead of throwing, so we gate
// on it and let callers fall back to '—'.
function safeISODate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function nextHalving(height) {
  const halvingInterval = 210000;
  const nextHalvingBlock = Math.ceil((height + 1) / halvingInterval) * halvingInterval;
  const blocksRemaining = nextHalvingBlock - height;
  const daysRemaining = blocksRemaining / 144;
  return safeISODate(Date.now() + daysRemaining * 86400000) ?? '—';
}

function circulatingBTC(height) {
  let supply = 0, reward = 50, h = 0;
  while (h + 210000 <= height) { supply += 210000 * reward; reward /= 2; h += 210000; }
  supply += (height - h) * reward;
  return `${(supply / 1e6).toFixed(2)}M BTC`;
}

function calcSoloOdds(networkEHS, minerTHS) {
  if (!networkEHS || !minerTHS) return null;
  const networkTHS = networkEHS * 1e6; // EH/s → TH/s
  const sharePerDay = (minerTHS / networkTHS) * 144; // 144 blocks/day
  if (sharePerDay <= 0) return null;
  const oddsPerDay = Math.round(1 / sharePerDay);
  const etaYears = Math.round((1 / sharePerDay) / 365);
  return { oddsPerDay, etaYears };
}

// WMO weather code → Meteocons icon name (day/night aware, wind override)
function wmoIcon(code, hr, windMph, sunriseHr, sunsetHr) {
  const night = hr !== undefined && (
    sunriseHr != null && sunsetHr != null
      ? (hr < sunriseHr || hr >= sunsetHr)
      : (hr < 6 || hr >= 20)            // fallback before sunrise/sunset loads
  );
  if (windMph != null && windMph >= 25 && code <= 2) return 'wind';
  if (code <= 1)                                     return night ? 'clear-night'          : 'clear-day';
  if (code === 2)                                    return night ? 'partly-cloudy-night'  : 'partly-cloudy-day';
  if (code === 3)                                    return 'overcast';
  if (code === 45 || code === 48)                    return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95)                                    return 'thunderstorms';
  if (code >= 51 && code <= 55)                      return 'drizzle';
  if (code >= 51)                                    return 'rain';
  return night ? 'partly-cloudy-night' : 'partly-cloudy-day';
}

// Animation speed tied to condition intensity — higher = slower, lower = faster
function wmoSpeed(code, windMph) {
  if (windMph != null && windMph >= 25 && code <= 2) {
    // Wind icon: faster as mph climbs (25→1.0, 40→0.7, 60→0.45)
    return Math.max(0.4, 1.0 - (windMph - 25) / 60);
  }
  if (code === 0)                return 3.0;  // clear — lazy spin
  if (code <= 2)                 return 2.5;  // partly cloudy — gentle
  if (code === 3)                return 2.0;  // overcast
  if (code === 45 || code === 48) return 3.5; // fog — barely moving
  if (code === 51)               return 3.2;  // light drizzle — very slow mist
  if (code === 53)               return 2.8;  // drizzle
  if (code === 55)               return 2.2;  // heavy drizzle
  if (code === 56)               return 3.0;  // light freezing drizzle
  if (code === 57)               return 2.4;  // heavy freezing drizzle
  if (code === 61)               return 2.4;  // light rain
  if (code === 63)               return 1.8;  // rain
  if (code === 65)               return 1.2;  // heavy rain
  if (code === 66)               return 2.0;  // light freezing rain
  if (code === 67)               return 1.4;  // heavy freezing rain
  if (code >= 80 && code <= 82)  return Math.max(0.8, 2.0 - (code - 80) * 0.5); // showers
  if (code === 71)               return 3.0;  // light snow — slow flutter
  if (code === 73)               return 2.4;  // snow
  if (code === 75)               return 1.8;  // heavy snow
  if (code >= 95)                return Math.max(0.5, 0.8 - (code - 95) * 0.1); // thunderstorm — fast; heavier = faster
  return 2.5;
}

function wmoDesc(code) {
  const m = {
    0:'Clear sky', 1:'Mainly clear', 2:'Partly cloudy', 3:'Overcast',
    45:'Fog', 48:'Icy fog',
    51:'Light drizzle', 53:'Drizzle', 55:'Heavy drizzle',
    61:'Light rain', 63:'Rain', 65:'Heavy rain',
    71:'Light snow', 73:'Snow', 75:'Heavy snow', 77:'Snow grains',
    80:'Rain showers', 81:'Heavy showers', 82:'Violent showers',
    85:'Snow showers', 86:'Heavy snow showers',
    95:'Thunderstorm', 96:'Thunderstorm w/ hail', 99:'Heavy thunderstorm',
  };
  return m[code] || 'Unknown';
}

function fmtBlockSize(bytes) {
  if (!bytes) return '—';
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
  return `${Math.round(bytes / 1000)} kB`;
}

function timeAgoUnix(ts) {
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function fmtBestDiff(v) {
  if (!v || v <= 0) return '—';
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `${(v / 1e9).toFixed(2)}G`;
  if (v >= 1e6)  return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3)  return `${(v / 1e3).toFixed(1)}K`;
  return String(v);
}

function classifyTopic(title) {
  const t = (title || '').toLowerCase();
  if (/breaking|urgent/.test(t)) return 'BREAKING';
  if (/etf|fund|inflow|outflow|rally|dump|\bprice\b|market|trade|exchange|bull|bear|\bspot\b|futures|options|invest|portfolio|microstrategy|blackrock|institutional|hedge/.test(t)) return 'MARKETS';
  if (/mining|miner|hashrate|hash rate|difficulty|\bpool\b|asic|block reward|halving|antpool|foundry|f2pool|marathon|riot/.test(t)) return 'MINING';
  if (/\bsec\b|regulat|legal|government|congress|senate|polic|ban|\bcourt\b|compli|\bkyc\b|\baml\b|treasury|\birs\b|\btax\b|\blaw\b/.test(t)) return 'REGULATION';
  if (/lightning|protocol|upgrade|developer|wallet|layer.?2|taproot|ordinals|runes|\bbip\b|fork|\bnode\b/.test(t)) return 'TECH';
  if (/el salvador|central bank|\bcbdc\b|reserve|national|strategic|country|nation|adopt/.test(t)) return 'GLOBAL';
  return 'BITCOIN';
}

// ─── CommonJS Exports ────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fmtNum,
    fmtPrice,
    fmtPct,
    fmtVolUsd,
    fmtBlockTime,
    fmtHashrate,
    fmtDiff,
    fmtMempoolMB,
    fmtBlockSize,
    timeAgoUnix,
    timeAgo,
    fmtHour,
    fmtHHMM,
    safeISODate,
    nextHalving,
    circulatingBTC,
    calcSoloOdds,
    wmoDesc,
    wmoIcon,
    wmoSpeed,
    fmtBestDiff,
    classifyTopic,
  };
}
