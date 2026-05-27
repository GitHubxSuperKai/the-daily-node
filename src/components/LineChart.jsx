import React from 'react';
import { useT } from '../theme';

const CONTAINER_STYLE = { width: '100%', height: '100%', display: 'block', flexShrink: 0 };
const SVG_BLOCK = { display: 'block' };

function LineChart({ color, points, fill, vwap, historyPoints }) {
  const T = useT();
  color = color ?? T.orange;

  const containerRef = React.useRef(null);
  const [dims, setDims] = React.useState({ w: 0, h: 0 });

  React.useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setDims({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const { w, h } = dims;

  const allPoints = React.useMemo(() => {
    if (!Array.isArray(historyPoints) || historyPoints.length === 0) return points;
    const converted = historyPoints.map(p => [p.ts * 1000, p.usd]);
    return points ? [...converted, ...points] : converted;
  }, [historyPoints, points]);

  const useFallback = !allPoints || allPoints.length < 2;
  let pts = [];

  if (w > 0 && h > 0) {
    if (useFallback) {
      let s = 12347;
      const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      for (let i = 0; i <= 80; i++) {
        const x = (i / 80) * w;
        const base = Math.sin(i * 0.18) * h * 0.3 + Math.sin(i * 0.42) * h * 0.08 + (i / 80) * h * 0.18;
        const y = h * 0.6 - base + (rnd() - 0.5) * 2;
        pts.push([x.toFixed(1), Math.max(2, Math.min(h - 2, y)).toFixed(1)]);
      }
    } else {
      const prices = allPoints.map(p => p[1]);
      const minP = prices.reduce((a, b) => b < a ? b : a, Infinity);
      const maxP = prices.reduce((a, b) => b > a ? b : a, -Infinity);
      const range = maxP - minP || 1;
      pts = allPoints.map((p, i) => {
        const x = (i / (allPoints.length - 1)) * w;
        const y = h - 4 - ((p[1] - minP) / range) * (h - 8);
        return [x.toFixed(1), Math.max(2, Math.min(h - 2, y)).toFixed(1)];
      });
    }
  }

  let vwapY = null;
  if (w > 0 && h > 0 && !useFallback && vwap != null) {
    const prices = allPoints.map(p => p[1]);
    const minP = prices.reduce((a, b) => b < a ? b : a, Infinity);
    const maxP = prices.reduce((a, b) => b > a ? b : a, -Infinity);
    const range = maxP - minP || 1;
    vwapY = Math.max(2, Math.min(h - 2, h - 4 - ((vwap - minP) / range) * (h - 8)));
  }

  const d = pts.length > 0
    ? pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')
    : '';
  const lastPt = pts[pts.length - 1];

  return (
    <div ref={containerRef} style={CONTAINER_STYLE}>
      {w > 0 && h > 0 && (
        <svg width={w} height={h} style={SVG_BLOCK}>
          {fill && d && <path d={`${d} L${w},${h} L0,${h}Z`} fill={color} fillOpacity={0.07} />}
          {vwapY != null && (
            <line x1={0} y1={vwapY} x2={w} y2={vwapY}
              stroke={T.ink3} strokeWidth={1} strokeDasharray="3 4" />
          )}
          {d && <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />}
          {lastPt && <circle cx={lastPt[0]} cy={lastPt[1]} r={3} fill={color} />}
          {lastPt && <circle cx={lastPt[0]} cy={lastPt[1]} r={7} fill="none" stroke={color} strokeOpacity={0.3} strokeWidth={1} />}
        </svg>
      )}
    </div>
  );
}

export default LineChart;
