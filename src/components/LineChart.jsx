import { useT } from '../theme';

// ─── Real chart from price data ────────────────────────────────
function LineChart({ w, h, color, points, fill, vwap }) {
  const T = useT();
  color = color ?? T.orange;
  // points: array of [timestamp, price] pairs, or null for placeholder
  const useFallback = !points || points.length < 2;
  let pts = [];

  if (useFallback) {
    // deterministic placeholder while loading
    let s = 12347;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i <= 80; i++) {
      const x = (i / 80) * w;
      const base = Math.sin(i * 0.18) * h * 0.3 + Math.sin(i * 0.42) * h * 0.08 + (i / 80) * h * 0.18;
      const y = h * 0.6 - base + (rnd() - 0.5) * 2;
      pts.push([x.toFixed(1), Math.max(2, Math.min(h - 2, y)).toFixed(1)]);
    }
  } else {
    const prices = points.map(p => p[1]);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = maxP - minP || 1;
    pts = points.map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - 4 - ((p[1] - minP) / range) * (h - 8);
      return [x.toFixed(1), Math.max(2, Math.min(h - 2, y)).toFixed(1)];
    });
  }

  let vwapY = null;
  if (!useFallback && vwap != null) {
    const prices = points.map(p => p[1]);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = maxP - minP || 1;
    vwapY = Math.max(2, Math.min(h - 2, h - 4 - ((vwap - minP) / range) * (h - 8)));
  }

  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} style={{ display: 'block', flexShrink: 0 }}>
      {fill && <path d={`${d} L${w},${h} L0,${h}Z`} fill={color} fillOpacity={0.07} />}
      {vwapY != null && (
        <line x1={0} y1={vwapY} x2={w} y2={vwapY}
          stroke={T.ink3} strokeWidth={1} strokeDasharray="3 4" />
      )}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={3} fill={color} />
      <circle cx={lx} cy={ly} r={7} fill="none" stroke={color} strokeOpacity={0.3} strokeWidth={1} />
    </svg>
  );
}

export default LineChart;
