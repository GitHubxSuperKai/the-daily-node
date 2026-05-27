import React from 'react';
import { useT } from '../theme';
import { u } from '../utils/scale.js';
import { calcSoloOdds } from '../utils/formatting';
import { MinerRow, getMinerStatus } from './MinerRow.jsx';
import { FleetSummary } from './FleetSummary.jsx';

function Miners({ bitaxe, chain }) {
  const T = useT();
  const heroWrapRef = React.useRef(null);
  const heroSlotRef = React.useRef(null);
  const [heroFontSize, setHeroFontSize] = React.useState(null);

  const GRID = `minmax(0,1fr) ${u(52)} ${u(46)} ${u(44)} ${u(80)} ${u(48)} ${u(48)} ${u(52)}`;

  const onlineMiners = bitaxe.miners.filter(m => m.online && m.data);
  const minerCount   = bitaxe.miners.length;
  const onlineCount  = onlineMiners.length;

  const totalHashTH = onlineMiners.reduce((s, m) => s + (m.data.hashRate || 0) / 1000, 0);
  const totalPower  = onlineMiners.reduce((s, m) => s + (m.data.power || 0), 0);
  const totalRej    = bitaxe.miners.reduce((s, m) => s + (m.data?.sharesRejected || 0), 0);
  const totalAcc    = bitaxe.miners.reduce((s, m) => s + (m.data?.sharesAccepted || 0), 0);
  const errRate     = totalRej > 0 ? ((totalRej / (totalAcc + totalRej)) * 100).toFixed(2) : null;
  const fmtPower    = (w) => w < 1000 ? `${Math.round(w)}W` : `${(w / 1000).toFixed(1)}kW`;

  const networkHashEH = chain.data ? chain.data.hashrate / 1e18 : 0;
  const oddsResult = chain.data && totalHashTH > 0
    ? calcSoloOdds(networkHashEH, totalHashTH)
    : null;
  const oddsOneIn = oddsResult ? oddsResult.oddsPerDay : null;

  React.useEffect(() => {
    if (!oddsOneIn) return;
    const text = `1-in-${oddsOneIn.toLocaleString()}`;
    const measure = () => {
      const wrap = heroWrapRef.current;
      if (!wrap) return;
      const PROBE = 200;
      const cs = getComputedStyle(wrap);
      const availW = wrap.getBoundingClientRect().width
        - parseFloat(cs.paddingLeft)
        - parseFloat(cs.paddingRight || '0')
        - parseFloat(cs.borderLeftWidth || '0')
        - parseFloat(cs.borderRightWidth || '0');
      if (availW <= 0) return;
      const clone = document.createElement('div');
      clone.style.cssText = 'position:absolute;top:-9999px;white-space:nowrap;' +
        'font-family:"Playfair Display",Georgia,serif;font-weight:800;font-style:italic;' +
        `font-size:${PROBE}px`;
      clone.textContent = text;
      document.body.appendChild(clone);
      const textW = clone.scrollWidth;
      document.body.removeChild(clone);
      if (textW > 0) {
        const newSize = Math.floor(PROBE * availW / textW);
        if (!heroSlotRef.current) heroSlotRef.current = newSize;
        setHeroFontSize(newSize);
      }
    };
    document.fonts.load('800 italic 200px "Playfair Display"').then(measure);
  }, [oddsOneIn]);

  const HEADERS = [
    { label: 'Rig',    fade: false },
    { label: 'TH/s',  fade: false },
    { label: 'J/T',   fade: false },
    { label: '24h%',  fade: true  },
    { label: 'Shares', fade: true },
    { label: 'ASIC°', fade: true  },
    { label: 'VR°',   fade: true  },
    { label: 'Watts',  fade: true  },
  ];

  const noApi = bitaxe.err || (bitaxe.miners.length === 0 && !bitaxe.loading);

  if (noApi) {
    return (
      <div style={{ marginBottom: u(4) }}>
        <div style={{
          borderTop: `${u(3)} solid ${T.ink}`,
          borderBottom: `1px solid ${T.ink}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          padding: `${u(5)} 0`, marginBottom: u(14),
        }}>
          <span style={{
            fontFamily: T.sans, fontSize: u(10), fontWeight: 700,
            letterSpacing: u(2), textTransform: 'uppercase', color: T.ink,
          }}>
            Field Report
          </span>
        </div>
        <div style={{ borderLeft: `${u(3)} solid ${T.rule}`, paddingLeft: u(12), paddingTop: u(4), paddingBottom: u(4) }}>
          <div style={{ fontFamily: T.sans, fontSize: u(11), fontWeight: 700, color: T.ink2, marginBottom: u(6) }}>
            No miners connected
          </div>
          <div style={{ fontFamily: T.body, fontSize: u(11), fontStyle: 'italic', color: T.ink3, lineHeight: 1.5 }}>
            Run a BitAxe on your local network to see live hashrate,
            power, and temperature stats here. See the{' '}
            <a
              href="https://github.com/GitHubxSuperKai/the-daily-node#bitaxe-setup"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: T.orange, textDecoration: 'none' }}
            >
              setup guide →
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: u(4) }}>
      {/* Masthead */}
      <div style={{
        borderTop: `${u(3)} solid ${T.ink}`,
        borderBottom: `1px solid ${T.ink}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        padding: `${u(5)} 0`, marginBottom: u(14),
      }}>
        <span style={{ fontFamily: T.sans, fontSize: u(10), fontWeight: 700, letterSpacing: u(2), textTransform: 'uppercase', color: T.ink, whiteSpace: 'nowrap' }}>
          Field Report
        </span>
        <span style={{ fontFamily: T.body, fontSize: u(10), fontStyle: 'italic', color: T.ink3, whiteSpace: 'nowrap' }}>
          {onlineCount}/{minerCount} active
        </span>
      </div>

      {/* Pull-quote hero */}
      <div ref={heroWrapRef} style={{ borderLeft: `${u(3)} solid ${T.ink}`, paddingLeft: u(12), marginBottom: u(14) }}>
        {/* height locked to first-measured size to prevent layout shift on refresh */}
        <div style={{
          fontFamily: T.serif, fontSize: heroFontSize ? heroFontSize + 'px' : u(38),
          fontWeight: 800, fontStyle: 'italic',
          color: oddsOneIn ? T.ink : T.ink4, lineHeight: 1, letterSpacing: -0.5,
          fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap',
          height: heroSlotRef.current ? heroSlotRef.current + 'px' : undefined,
        }}>
          {oddsOneIn ? `1-in-${oddsOneIn.toLocaleString()}` : '1-in-—'}
        </div>
        <div style={{ fontFamily: T.body, fontSize: u(12), fontStyle: 'italic', color: T.ink2, marginTop: u(5), lineHeight: 1.45 }}>
          odds of finding a block today —<br />
          {onlineCount > 0
            ? `${totalHashTH.toFixed(2)} TH/s · ${fmtPower(totalPower)}${errRate ? ` · ${errRate}% err` : ''} across ${onlineCount} active ${onlineCount === 1 ? 'rig' : 'rigs'}`
            : 'no rigs online'}
        </div>
      </div>

      {/* Flat grid: header + rows + fleet all as direct children */}
      <div style={{ display: 'grid', gridTemplateColumns: GRID, columnGap: u(4), alignItems: 'center' }}>
        <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${T.rule2}`, padding: 0 }} />
        {HEADERS.map(({ label, fade }, i) => (
          <div key={`h${i}`} style={{
            fontFamily: T.sans, fontSize: u(8), fontWeight: 700,
            letterSpacing: u(1.1), textTransform: 'uppercase',
            color: fade ? T.ink4 : T.ink3,
            textAlign: i > 0 ? 'right' : 'left',
            whiteSpace: 'nowrap',
            padding: i === 0 ? `${u(3)} 0 ${u(3)} ${u(11)}` : `${u(3)} 0`,
          }}>
            {label}
          </div>
        ))}
        <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${T.rule2}`, padding: 0 }} />

        {bitaxe.miners.map((miner, ri) => (
          <MinerRow
            key={miner.ip || ri}
            miner={miner}
            ri={ri}
            isLast={ri === bitaxe.miners.length - 1}
          />
        ))}

        {bitaxe.miners.length > 0 && (
          <FleetSummary miners={bitaxe.miners} />
        )}
      </div>
    </div>
  );
}

export default Miners;
