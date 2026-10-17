import React from 'react';
import { useT } from '../theme';
import { fmtPrice } from '../utils/formatting.js';
import { mergeSeries, nearestIndex, fmtChipTime } from '../utils/chartSeries.js';

const CONTAINER_STYLE = { width: '100%', height: '100%', display: 'block', flexShrink: 0, touchAction: 'pan-y' };
const SVG_BLOCK = { display: 'block' };
const SVG_DIMMED = { display: 'block', opacity: 0.4 };

function LineChart({ color, points, fill, vwap, historyPoints, showLabels, onHover, domain, dimmed, chipFormat }) {
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

  const series = React.useMemo(() => mergeSeries(historyPoints, points), [historyPoints, points]);

  const useFallback = series.length < 2 || series[0][0] === series[series.length - 1][0];

  // Key on the domain's VALUES: parents may hand a fresh array each render.
  const dom0 = domain?.[0];
  const dom1 = domain?.[1];
  const hasDomain = dom0 != null && dom1 != null && dom1 > dom0;
  const fmtChip = chipFormat ?? fmtChipTime;

  const [hoverIdx, setHoverIdx] = React.useState(null);
  const emittedRef = React.useRef(null);
  const scrubbingRef = React.useRef(false);
  const onHoverRef = React.useRef(onHover);
  onHoverRef.current = onHover;

  const clearHover = React.useCallback(() => {
    scrubbingRef.current = false;
    setHoverIdx(null);
    if (emittedRef.current !== null) {
      emittedRef.current = null;
      onHoverRef.current?.(null);
    }
  }, []);

  // A new series (or entering the dimmed state) invalidates any hovered index.
  React.useEffect(() => {
    clearHover();
  }, [series, dimmed, clearHover]);

  const updateHover = React.useCallback((clientX) => {
    if (dimmed) { clearHover(); return; }
    const el = containerRef.current;
    if (!el || useFallback) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width) return;
    const t0 = hasDomain ? dom0 : series[0][0];
    const t1 = hasDomain ? dom1 : series[series.length - 1][0];
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const idx = nearestIndex(series, t0 + frac * (t1 - t0));
    if (idx < 0) return;
    setHoverIdx(idx);
    if (idx !== emittedRef.current) {
      emittedRef.current = idx;
      onHoverRef.current?.({ t: series[idx][0], price: series[idx][1] });
    }
  }, [series, useFallback, dimmed, hasDomain, dom0, dom1, clearHover]);

  const onPointerDown = React.useCallback((e) => {
    if (e.pointerType === 'mouse') return;
    scrubbingRef.current = true;
    updateHover(e.clientX);
  }, [updateHover]);

  const onPointerMove = React.useCallback((e) => {
    if (e.pointerType === 'mouse' || scrubbingRef.current) updateHover(e.clientX);
  }, [updateHover]);

  const onPointerUp = React.useCallback((e) => {
    if (e.pointerType !== 'mouse') clearHover();
  }, [clearHover]);

  // Bound-check during render: the clearing effect runs after commit, so the
  // first render of a shorter series still holds the old index.
  const hIdx = !dimmed && !useFallback && hoverIdx !== null && hoverIdx < series.length ? hoverIdx : null;
  const { pts, minP, maxP, minIdx, maxIdx } = React.useMemo(() => {
    const out = { pts: [], minP: 0, maxP: 0, minIdx: 0, maxIdx: 0 };
    if (!(w > 0 && h > 0)) return out;
    if (useFallback) {
      let s = 12347;
      const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      for (let i = 0; i <= 80; i++) {
        const x = (i / 80) * w;
        const base = Math.sin(i * 0.18) * h * 0.3 + Math.sin(i * 0.42) * h * 0.08 + (i / 80) * h * 0.18;
        const y = h * 0.6 - base + (rnd() - 0.5) * 2;
        out.pts.push([x.toFixed(1), Math.max(2, Math.min(h - 2, y)).toFixed(1)]);
      }
      return out;
    }
    let lo = Infinity;
    let hi = -Infinity;
    series.forEach((p, i) => {
      if (p[1] < lo) { lo = p[1]; out.minIdx = i; }
      if (p[1] > hi) { hi = p[1]; out.maxIdx = i; }
    });
    out.minP = lo;
    out.maxP = hi;
    const range = hi - lo || 1;
    const t0 = hasDomain ? dom0 : series[0][0];
    const span = (hasDomain ? dom1 : series[series.length - 1][0]) - t0;
    out.pts = series.map((p) => {
      const x = ((p[0] - t0) / span) * w;
      const y = h - 4 - ((p[1] - lo) / range) * (h - 8);
      return [x.toFixed(1), Math.max(2, Math.min(h - 2, y)).toFixed(1)];
    });
    return out;
  }, [series, w, h, hasDomain, dom0, dom1, useFallback]);

  let vwapY = null;
  if (w > 0 && h > 0 && !useFallback && vwap != null) {
    const range = maxP - minP || 1;
    vwapY = Math.max(2, Math.min(h - 2, h - 4 - ((vwap - minP) / range) * (h - 8)));
  }

  const d = pts.length > 0
    ? pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')
    : '';
  const lastPt = pts[pts.length - 1];

  return (
    <div
      ref={containerRef}
      style={CONTAINER_STYLE}
      data-chart-scrub="true"
      data-chart-dimmed={dimmed ? 'true' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={clearHover}
      onPointerCancel={clearHover}
    >
      {w > 0 && h > 0 && (
        <svg width={w} height={h} style={dimmed ? SVG_DIMMED : SVG_BLOCK}>
          {fill && d && <path d={`${d} L${w},${h} L0,${h}Z`} fill={color} fillOpacity={0.07} />}
          {vwapY != null && (
            <line x1={0} y1={vwapY} x2={w} y2={vwapY}
              stroke={T.ink3} strokeWidth={1} strokeDasharray="3 4" />
          )}
          {d && <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />}
          {lastPt && <circle cx={lastPt[0]} cy={lastPt[1]} r={3} fill={color} />}
          {lastPt && <circle cx={lastPt[0]} cy={lastPt[1]} r={7} fill="none" stroke={color} strokeOpacity={0.3} strokeWidth={1} />}
          {showLabels && !useFallback && pts.length > 0 && (() => {
            const maxPt = pts[maxIdx];
            const minPt = pts[minIdx];
            const maxAnchor = parseFloat(maxPt[0]) > w / 2 ? 'end' : 'start';
            const minAnchor = parseFloat(minPt[0]) > w / 2 ? 'end' : 'start';
            const maxY = Math.max(12, parseFloat(maxPt[1]) - 6);
            const minY = Math.min(h - 2, parseFloat(minPt[1]) + 14);
            const labelStyle = { fill: T.ink3, fontSize: 10, fontFamily: T.mono, opacity: 0.85, pointerEvents: 'none' };
            return (
              <>
                <text x={maxPt[0]} y={maxY} textAnchor={maxAnchor} {...labelStyle}>
                  ${fmtPrice(maxP)}
                </text>
                <text x={minPt[0]} y={minY} textAnchor={minAnchor} {...labelStyle}>
                  ${fmtPrice(minP)}
                </text>
              </>
            );
          })()}
          {hIdx !== null && (() => {
            const hp = pts[hIdx];
            const hx = parseFloat(hp[0]);
            const hy = parseFloat(hp[1]);
            const label = fmtChip(series[hIdx][0]);
            const chipW = label.length * 6 + 10;
            const chipH = 16;
            const cx = Math.max(chipW / 2, Math.min(w - chipW / 2, hx));
            const chipY = hy > h * 0.75 ? 2 : h - chipH - 2;
            return (
              <>
                <line data-testid="chart-crosshair" x1={hx} y1={0} x2={hx} y2={h}
                  stroke={T.ink3} strokeWidth={1} strokeDasharray="3 3" pointerEvents="none" />
                <circle data-testid="chart-hover-dot" data-t={series[hIdx][0]}
                  cx={hx} cy={hy} r={4} fill={color} pointerEvents="none" />
                <g data-testid="chart-chip" pointerEvents="none">
                  <rect x={cx - chipW / 2} y={chipY} width={chipW} height={chipH} rx={2} fill={T.ink} />
                  <text x={cx} y={chipY + 11.5} textAnchor="middle"
                    style={{ fill: T.paper, fontSize: 10, fontFamily: T.num }}>
                    {label}
                  </text>
                </g>
              </>
            );
          })()}
        </svg>
      )}
    </div>
  );
}

export default LineChart;
