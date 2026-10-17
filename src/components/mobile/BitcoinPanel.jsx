import React from 'react';
import { useT } from '../../theme.js';
import { fmtPrice, fmtPct, fmtNum } from '../../utils/formatting.js';
import { mergeSeries, pctSince } from '../../utils/chartSeries.js';
import { RANGES, windowSeries, chipTime } from '../../utils/chartRange.js';
import LineChart from '../LineChart.jsx';
import RangeButtons from '../RangeButtons.jsx';
import { NetworkStatusWidget } from '../NetworkStatusWidget.jsx';
import { OnThisDay } from '../OnThisDay.jsx';

function sectionLabel(T) {
  return {
    fontFamily: T.sans,
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: T.ink3,
    marginBottom: 8,
  };
}

// Fallback for callers that pass no chart (older tests); never mutated.
const EMPTY_CHART = Object.freeze({ points: null, domain: null, stale: false, aged: false, failed: false });
const NOOP = () => {};

function BitcoinPanel({ btc, chain, chart: chartProp, range = '24h', onRangeChange }) {
  const T = useT();
  const chart = chartProp ?? EMPTY_CHART;

  const d = btc.data;
  const c = chain?.data;

  const [hover, setHover] = React.useState(null);

  // MobileApp re-renders every second (clock) and this memo'd component re-renders
  // with it, so the `points` handed to LineChart (`series` below) must keep their identity
  // between data changes: LineChart clears the hover/scrub whenever its merged series
  // changes. `domain` is keyed on its values there and `onHover` goes through a ref, but
  // `series` depends on `domain`, so Date.now() lives only inside the memo.
  const domain = React.useMemo(() => {
    if (chart.domain) return chart.domain;
    const now = Date.now();
    return [now - RANGES[range].spanMs, now];
  }, [chart.domain, range]);
  const series = React.useMemo(
    () => windowSeries(mergeSeries(null, chart.points), domain),
    [chart.points, domain],
  );
  const chipFormat = React.useCallback((t) => chipTime(range, t), [range]);

  const headPrice = hover ? hover.price : d?.price;
  const headText = Number.isFinite(headPrice) ? `$${fmtPrice(headPrice)}` : '—';
  let chgPct;
  if (hover) chgPct = pctSince(hover.price, d?.price);
  else if (range === '24h') chgPct = d ? d.chgPct : null;
  else if (chart.stale) chgPct = null;
  else chgPct = pctSince(series[0]?.[1], d?.price);
  const chgKnown = Number.isFinite(chgPct);
  const chgUp = chgKnown && chgPct >= 0;
  const chgColor = chgKnown ? (chgUp ? T.green : T.red) : T.ink3;
  const showArrow = hover || range !== '24h';
  const chgText = chgKnown ? `${showArrow ? (chgUp ? '▲ ' : '▼ ') : ''}${fmtPct(chgPct)}%` : '—';
  const rangeSuffix = !hover && range !== '24h' && chgKnown ? RANGES[range].label.toLowerCase() : null;
  const rangeNote = chart.failed && (chart.stale || !chart.points) ? 'no data' : null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      padding: '16px 16px 80px',
      fontFamily: T.sans,
    }}>

      {/* ── Price ── */}
      <div>
        <div style={sectionLabel(T)}>Price</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{
            fontFamily: T.mono,
            fontSize: 36,
            fontWeight: 700,
            color: T.ink,
            letterSpacing: -1,
            fontFeatureSettings: '"tnum" 1, "lnum" 1',
          }}>
            {headText}
          </span>
          {(chgPct != null || hover || range !== '24h') && (
            <span style={{
              fontFamily: T.mono,
              fontSize: 16,
              fontWeight: 600,
              color: chgColor,
              fontFeatureSettings: '"tnum" 1, "lnum" 1',
            }}>
              {chgText}
              {hover && <span style={{ fontSize: 11, fontWeight: 400, color: T.ink3, marginLeft: 6 }}>since</span>}
              {rangeSuffix && <span style={{ fontSize: 11, fontWeight: 400, color: T.ink3, marginLeft: 6 }}>{rangeSuffix}</span>}
            </span>
          )}
        </div>
        <div style={{
          fontFamily: T.mono,
          fontSize: 11,
          color: T.ink3,
          marginTop: 4,
          fontFeatureSettings: '"tnum" 1, "lnum" 1',
        }}>
          {d ? `H $${fmtPrice(d.hi)}  ·  L $${fmtPrice(d.lo)}  ·  Cap $${d.cap ? (d.cap / 1e9).toFixed(0) + 'B' : '—'}` : '—'}
        </div>
      </div>

      {/* ── Chart ── */}
      <RangeButtons
        value={range}
        onChange={onRangeChange ?? NOOP}
        note={rangeNote}
        fontSize={12}
        padX={10}
        minHeight={32}
        gap={4}
      />
      <div style={{ height: 120 }}>
        <LineChart
          color={T.orange}
          points={series}
          domain={domain}
          dimmed={!!(chart.stale || chart.aged)}
          chipFormat={chipFormat}
          fill
          showLabels
          onHover={setHover}
        />
      </div>

      {/* ── Field Report ── */}
      <section style={{ paddingBottom: 16, borderBottom: `1px solid ${T.rule2}` }}>
        <div style={sectionLabel(T)}>Field Report</div>
        <NetworkStatusWidget chain={chain} T={T} />
      </section>

      {/* ── Halving ── */}
      {c && (
        <div>
          <div style={sectionLabel(T)}>Halving</div>
          <div style={{ marginBottom: 10 }}>
            <div style={{
              fontFamily: T.sans, fontSize: 9, fontWeight: 600,
              letterSpacing: 1.5, textTransform: 'uppercase',
              color: T.ink3, marginBottom: 2,
            }}>Supply</div>
            <div style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 600, color: T.ink,
                          fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
              {c.circulating || '—'}
            </div>
          </div>
          <div>
            <div style={{
              fontFamily: T.sans, fontSize: 9, fontWeight: 600,
              letterSpacing: 1.5, textTransform: 'uppercase',
              color: T.ink3, marginBottom: 2,
            }}>Next Halving</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 600, color: T.ink,
                             fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
                {c.nextHalvingDate || '—'}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: 11, color: T.ink3,
                             fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
                {c.height ? `${fmtNum(Math.ceil((c.height + 1) / 210000) * 210000 - c.height)} blk` : '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── On This Day ── */}
      <OnThisDay />

    </div>
  );
}

BitcoinPanel = React.memo(BitcoinPanel);

export { BitcoinPanel };
