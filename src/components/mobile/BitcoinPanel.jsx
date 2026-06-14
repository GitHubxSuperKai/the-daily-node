import React from 'react';
import { useT } from '../../theme.js';
import { fmtPrice, fmtPct, fmtNum } from '../../utils/formatting.js';
import LineChart from '../LineChart.jsx';
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

function BitcoinPanel({ btc, chain }) {
  const T = useT();

  const d = btc.data;
  const c = chain?.data;

  const chgPct = d ? d.chgPct : null;
  const chgUp = chgPct != null && chgPct >= 0;
  const chgColor = chgUp ? T.green : T.red;


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
          }}>
            {d ? `$${fmtPrice(d.price)}` : '—'}
          </span>
          {chgPct != null && (
            <span style={{
              fontFamily: T.mono,
              fontSize: 16,
              fontWeight: 600,
              color: chgColor,
            }}>
              {fmtPct(chgPct)}%
            </span>
          )}
        </div>
        <div style={{
          fontFamily: T.mono,
          fontSize: 11,
          color: T.ink3,
          marginTop: 4,
        }}>
          {d ? `H $${fmtPrice(d.hi)}  ·  L $${fmtPrice(d.lo)}  ·  Cap $${d.cap ? (d.cap / 1e9).toFixed(0) + 'B' : '—'}` : '—'}
        </div>
      </div>

      {/* ── Chart ── */}
      <div>
        <LineChart
          color={T.orange}
          points={btc.chartPts}
          fill
          showLabels
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
