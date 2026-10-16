import { fmtChipTime } from './chartSeries.js';

// Chart range table. interval is the Kraken OHLC interval in minutes.
export const RANGES = {
  '1h': { label: '1H', interval: 1, spanMs: 3600000, refreshMs: 60000 },
  '24h': { label: '24H', interval: 5, spanMs: 86400000, refreshMs: 300000 },
  '7d': { label: '7D', interval: 60, spanMs: 604800000, refreshMs: 900000 },
  '30d': { label: '30D', interval: 60, spanMs: 2592000000, refreshMs: 900000 },
  '1y': { label: '1Y', interval: 1440, spanMs: 31536000000, refreshMs: 3600000 },
};

export const RANGE_KEYS = ['1h', '24h', '7d', '30d', '1y'];

export const isRangeKey = (v) => typeof v === 'string' && RANGE_KEYS.includes(v);

export const resolveRange = (v2prefs) => {
  const r = v2prefs?.chart?.range;
  return isRangeKey(r) ? r : '24h';
};

// Kraken OHLC row: [time(s), open, high, low, close, vwap, volume, count].
export function normKrakenOHLC(json) {
  if ((Array.isArray(json?.error) && json.error.length) || !json?.result || typeof json.result !== 'object') {
    throw new Error('kraken');
  }
  const key = Object.keys(json.result).find((k) => k !== 'last');
  const rows = key ? json.result[key] : [];
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const t = Number(row[0]) * 1000;
    const p = Number(row[4]);
    if (Number.isFinite(t) && Number.isFinite(p)) out.push([t, p]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

export const windowSeries = (series, domain) =>
  domain ? series.filter(([t]) => t >= domain[0] && t <= domain[1]) : series;

const monthDay = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const monthYear = (ms) => {
  const d = new Date(ms);
  return `${d.toLocaleDateString('en-US', { month: 'short' })} '${String(d.getFullYear()).slice(-2)}`;
};

export function axisLabels(rangeKey, endMs) {
  if (rangeKey === '1h') return ['60m ago', '−45m', '−30m', '−15m', 'now'];
  if (rangeKey === '24h') return ['24h ago', '−18h', '−12h', '−6h', 'now'];
  const { spanMs } = RANGES[rangeKey];
  const fmt = rangeKey === '1y' ? monthYear : monthDay;
  const marks = [0, 1, 2, 3].map((k) => fmt(endMs - spanMs + (k * spanMs) / 4));
  return [...marks, 'now'];
}

export function chipTime(rangeKey, tMs, nowMs = Date.now()) {
  if (rangeKey === '7d' || rangeKey === '30d') {
    return new Date(tMs).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' });
  }
  if (rangeKey === '1y') {
    return new Date(tMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return fmtChipTime(tMs, nowMs);
}

export const withRange = (v2prefs, key) => ({ ...v2prefs, chart: { ...v2prefs.chart, range: key } });
