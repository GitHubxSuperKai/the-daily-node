// Merge /history rows with CoinGecko chart points, snap a cursor time to the
// nearest point, and the small readout maths the chart crosshair needs.

export const HISTORY_GAP_MS = 300000;

const normHistory = (rows) => {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const ts = Number(r.ts);
    const usd = Number(r.usd);
    if (r.ts === null || r.ts === '' || r.usd === null || r.usd === '') continue;
    if (!Number.isFinite(ts) || !Number.isFinite(usd)) continue;
    out.push([ts * 1000, usd]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return out;
};

const normChart = (pts) => {
  if (!Array.isArray(pts)) return [];
  const out = [];
  for (const p of pts) {
    if (!Array.isArray(p)) continue;
    if (typeof p[0] !== 'number' || typeof p[1] !== 'number') continue;
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    out.push([p[0], p[1]]);
  }
  return out;
};

// First index in sorted `arr` whose ms is >= t.
const lowerBound = (arr, t) => {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid][0] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

export function mergeSeries(historyPoints, chartPts) {
  const hist = normHistory(historyPoints);
  const cg = normChart(chartPts);
  const kept = [];
  for (const pt of cg) {
    if (hist.length === 0) { kept.push(pt); continue; }
    const i = lowerBound(hist, pt[0]);
    if (i === 0 || i === hist.length) { kept.push(pt); continue; }
    if (hist[i][0] === pt[0]) continue;
    if (hist[i][0] - hist[i - 1][0] > HISTORY_GAP_MS) kept.push(pt);
  }
  // Drop duplicate ms among history rows themselves (first wins) and among CG.
  const seen = new Set();
  const out = [];
  for (const pt of [...hist, ...kept]) {
    if (seen.has(pt[0])) continue;
    seen.add(pt[0]);
    out.push(pt);
  }
  out.sort((a, b) => a[0] - b[0]);
  return out;
}

export function nearestIndex(series, tMs) {
  const n = series.length;
  if (n === 0) return -1;
  const i = lowerBound(series, tMs);
  if (i === 0) return 0;
  if (i === n) return n - 1;
  // Tie goes to the earlier point.
  return tMs - series[i - 1][0] <= series[i][0] - tMs ? i - 1 : i;
}

export function pctSince(hoveredPrice, livePrice) {
  if (!Number.isFinite(hoveredPrice) || !Number.isFinite(livePrice)) return null;
  if (hoveredPrice === 0) return null;
  return ((livePrice - hoveredPrice) / hoveredPrice) * 100;
}

const dayKey = (ms) => {
  const d = new Date(ms);
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
};

export function fmtChipTime(tMs, nowMs = Date.now()) {
  const time = new Date(tMs).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const y = new Date(nowMs);
  y.setDate(y.getDate() - 1);
  return dayKey(tMs) === dayKey(y.getTime()) ? `Yesterday ${time}` : time;
}
