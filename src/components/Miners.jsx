import React from 'react';
import { useT } from '../theme';
import { calcSoloOdds } from '../utils/formatting';

function Dot({ status }) {
  const T = useT();
  return (
    <span style={{
      display: 'inline-block', width: u(6), height: u(6), borderRadius: '50%',
      background: status === 'hashing' ? T.green : T.red,
      flexShrink: 0, marginRight: u(5), marginTop: u(1.5),
    }} />
  );
}

function getMinerStatus(miner) {
  return (miner.online && miner.data) ? 'hashing' : 'unreachable';
}

function getMinerName(miner) {
  if (miner.data?.hostname) return miner.data.hostname;
  const parts = (miner.ip || '').split('.');
  return `rig-${parts[parts.length - 1] || '(no IP)'}`;
}

function Miners({ bitaxe, chain }) {
  const T = useT();
  const heroWrapRef = React.useRef(null);
  const heroSlotRef = React.useRef(null);
  const [heroFontSize, setHeroFontSize] = React.useState(null);

  // minmax(0,1fr) prevents the name column from expanding beyond its share,
  // which would push the Watts column out of the container.
  const GRID = `minmax(0,1fr) ${u(52)} ${u(46)} ${u(44)} ${u(80)} ${u(48)} ${u(48)} ${u(52)}`;

  const onlineMiners = bitaxe.miners.filter(m => m.online && m.data);
  const minerCount   = bitaxe.miners.length;
  const onlineCount  = onlineMiners.length;

  const totalHashTH  = onlineMiners.reduce((s, m) => s + (m.data.hashRate || 0) / 1000, 0);
  const totalPower   = onlineMiners.reduce((s, m) => s + (m.data.power || 0), 0);
  const totalAcc     = bitaxe.miners.reduce((s, m) => s + (m.data?.sharesAccepted || 0), 0);
  const totalRej     = bitaxe.miners.reduce((s, m) => s + (m.data?.sharesRejected || 0), 0);
  const errRate      = totalRej > 0 ? ((totalRej / (totalAcc + totalRej)) * 100).toFixed(2) : null;

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

  const activeMiners = bitaxe.miners.filter(m => getMinerStatus(m) !== 'unreachable');
  const avgEff = activeMiners.length > 0
    ? activeMiners.reduce((s, m) => {
        const hr = (m.data?.hashRate || 0) / 1000;
        const eff = hr > 0 ? (m.data?.power || 0) / hr : 0;
        return s + eff;
      }, 0) / activeMiners.length
    : 0;
  const avgUp = activeMiners.length > 0
    ? activeMiners.reduce((s, m) => {
        const up = m.data?.uptimeSeconds != null
          ? Math.min(99.9, (m.data.uptimeSeconds / 86400) * 100)
          : 0;
        return s + up;
      }, 0) / activeMiners.length
    : null;
  const fmtPower = (w) => w < 1000 ? `${Math.round(w)}W` : `${(w / 1000).toFixed(1)}kW`;

  const avgAsic = activeMiners.length > 0
    ? activeMiners.reduce((s, m) => s + (m.data?.temp || m.data?.temperature || 0), 0) / activeMiners.length
    : 0;
  const vrAvailable = bitaxe.miners.some(m => m.data?.vrTemp != null);
  const avgVr = vrAvailable && activeMiners.length > 0
    ? activeMiners.reduce((s, m) => s + (m.data?.vrTemp || 0), 0) / activeMiners.length
    : null;

  const HEADERS = [
    { label: 'Rig',    fade: false },
    { label: 'TH/s',  fade: false },
    { label: 'J/T',   fade: false },
    { label: 'Up%',   fade: true  },
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
        <div style={{
          borderLeft: `${u(3)} solid ${T.rule}`,
          paddingLeft: u(12),
          paddingTop: u(4),
          paddingBottom: u(4),
        }}>
          <div style={{
            fontFamily: T.sans, fontSize: u(11), fontWeight: 700,
            color: T.ink2, marginBottom: u(6),
          }}>
            No miners connected
          </div>
          <div style={{
            fontFamily: T.body, fontSize: u(11), fontStyle: 'italic',
            color: T.ink3, lineHeight: 1.5,
          }}>
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

  // Shared style fragments
  const tnum = {
    fontFamily: T.mono, fontSize: u(11), textAlign: 'right',
    fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap',
  };

  return (
    <div style={{ marginBottom: u(4) }}>

      {/* Masthead */}
      <div style={{
        borderTop: `${u(3)} solid ${T.ink}`,
        borderBottom: `1px solid ${T.ink}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        padding: `${u(5)} 0`, marginBottom: u(14),
      }}>
        <span style={{
          fontFamily: T.sans, fontSize: u(10), fontWeight: 700,
          letterSpacing: u(2), textTransform: 'uppercase', color: T.ink, whiteSpace: 'nowrap',
        }}>
          Field Report
        </span>
        <span style={{
          fontFamily: T.body, fontSize: u(10), fontStyle: 'italic',
          color: T.ink3, whiteSpace: 'nowrap',
        }}>
          {onlineCount}/{minerCount} active
        </span>
      </div>

      {/* Pull-quote hero */}
      <div ref={heroWrapRef} style={{ borderLeft: `${u(3)} solid ${T.ink}`, paddingLeft: u(12), marginBottom: u(14) }}>
        {/* height is locked to first-measured font size (px) to prevent layout shift on data
            refresh. Safe because lineHeight:1 makes line-box height === font size, and
            whiteSpace:nowrap prevents wrapping — removing either breaks this invariant. */}
        <div style={{
          fontFamily: T.serif, fontSize: heroFontSize ? heroFontSize + 'px' : u(38),
          fontWeight: 800, fontStyle: 'italic',
          color: oddsOneIn ? T.ink : T.ink4, lineHeight: 1, letterSpacing: -0.5,
          fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap',
          height: heroSlotRef.current ? heroSlotRef.current + 'px' : undefined,
        }}>
          {oddsOneIn ? `1-in-${oddsOneIn.toLocaleString()}` : '1-in-—'}
        </div>
        <div style={{
          fontFamily: T.body, fontSize: u(12), fontStyle: 'italic',
          color: T.ink2, marginTop: u(5), lineHeight: 1.45,
        }}>
          odds of finding a block today —<br />
          {onlineCount > 0
            ? `${totalHashTH.toFixed(2)} TH/s · ${fmtPower(totalPower)}${errRate ? ` · ${errRate}% err` : ''} across ${onlineCount} active ${onlineCount === 1 ? 'rig' : 'rigs'}`
            : 'no rigs online'}
        </div>
      </div>

      {/*
        Single flat grid — header, data rows, and fleet are all direct children
        of one grid container so every column is guaranteed to align perfectly.
      */}
      <div style={{ display: 'grid', gridTemplateColumns: GRID, columnGap: u(4), alignItems: 'center' }}>

        {/* ── Column headers ── */}
        <div key="rule-hdr-top" style={{ gridColumn: '1 / -1', borderTop: `1px solid ${T.rule2}`, padding: 0 }} />
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
        <div key="rule-hdr-bot" style={{ gridColumn: '1 / -1', borderTop: `1px solid ${T.rule2}`, padding: 0 }} />

        {/* ── Data rows ── */}
        {bitaxe.miners.map((miner, ri) => {
          const status = getMinerStatus(miner);
          const isOff  = status === 'unreachable';
          const md     = miner.data;

          const hr       = md ? (md.hashRate || 0) / 1000 : 0;
          const watts    = md?.power || 0;
          const eff      = hr > 0 ? watts / hr : 0;
          const temp     = md ? (md.temp || md.temperature || 0) : 0;
          const vrT      = md?.vrTemp ?? null;
          const upSec    = md?.uptimeSeconds ?? null;
          const upPct    = upSec != null ? Math.min(99.9, (upSec / 86400) * 100) : null;
          const accS     = md?.sharesAccepted || 0;
          const rejS     = md?.sharesRejected || 0;
          const pwrLimit = md?.powerLimit || null;

          const rowBase = {
            padding: `${u(5)} 0`,
            opacity: isOff ? 0.4 : 1,
          };

          return [
            // Name + dot
            <div key={`${ri}-0`} style={{ ...rowBase, display: 'flex', alignItems: 'flex-start' }}>
              <Dot status={status} />
              <span style={{ fontFamily: T.sans, fontSize: u(11), fontWeight: 600, color: T.ink, overflowWrap: 'break-word', lineHeight: 1.3 }}>
                {getMinerName(miner).split('_').map((part, i) => (
                  <React.Fragment key={i}>{i > 0 && <>{`_`}<wbr /></>}{part}</React.Fragment>
                ))}
              </span>
            </div>,
            // TH/s
            <div key={`${ri}-1`} style={{ ...rowBase, ...tnum, color: T.ink }}>
              {isOff ? '—' : hr.toFixed(2)}
            </div>,
            // J/T
            <div key={`${ri}-2`} style={{ ...rowBase, ...tnum, color: eff > 25 ? T.red : T.ink }}>
              {isOff ? '—' : eff.toFixed(1)}
            </div>,
            // Up%
            <div key={`${ri}-3`} style={{ ...rowBase, ...tnum, color: upPct != null && upPct < 80 ? T.red : T.ink2 }}>
              {isOff ? '—' : (upPct != null ? `${upPct.toFixed(0)}%` : '—')}
            </div>,
            // Shares
            <div key={`${ri}-4`} style={{ ...rowBase, ...tnum, color: T.ink2 }}>
              {isOff ? '—' : (
                <>{accS.toLocaleString()}<span style={{ color: rejS > 50 ? T.red : T.ink4 }}> /{rejS}</span></>
              )}
            </div>,
            // ASIC°
            <div key={`${ri}-5`} style={{ ...rowBase, ...tnum, color: temp > 69 ? T.red : T.ink2 }}>
              {isOff ? '—' : `${temp.toFixed(1)}°`}
            </div>,
            // VR°
            <div key={`${ri}-6`} style={{ ...rowBase, ...tnum, color: vrT != null && vrT > 69 ? T.red : T.ink2 }}>
              {isOff ? '—' : (vrT != null ? `${vrT.toFixed(1)}°` : '—')}
            </div>,
            // Watts
            <div key={`${ri}-7`} style={{ ...rowBase, ...tnum, color: pwrLimit && watts > pwrLimit ? T.red : T.ink2 }}>
              {isOff ? '—' : `${Math.round(watts)}W`}
            </div>,
            // Separator — full-width rule between miners (fleet rule covers the last one)
            ri < bitaxe.miners.length - 1
              ? <div key={`rule-row-${ri}`} style={{ gridColumn: '1 / -1', borderTop: `1px solid ${T.rule3}`, padding: 0 }} />
              : null,
          ];
        })}

        {/* ── Fleet totals ── */}
        {bitaxe.miners.length > 0 && (() => {
          const fleetBase = { padding: `${u(5)} 0` };
          const ft = { ...tnum, fontWeight: 700, padding: `${u(5)} 0` };
          return [
            <div key="rule-fleet" style={{ gridColumn: '1 / -1', borderTop: `1px solid ${T.ink}`, padding: 0 }} />,
            <div key="f0" style={{ ...fleetBase, fontFamily: T.sans, fontSize: u(9), fontWeight: 700, letterSpacing: u(1.1), textTransform: 'uppercase', color: T.ink, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
              Fleet
            </div>,
            <div key="f1" style={{ ...ft, color: T.ink }}>{totalHashTH.toFixed(2)}</div>,
            <div key="f2" style={{ ...ft, color: avgEff > 25 ? T.red : T.ink }}>{avgEff.toFixed(1)}</div>,
            <div key="f3" style={{ ...ft, color: avgUp != null && avgUp < 80 ? T.red : T.ink }}>{avgUp != null ? `${avgUp.toFixed(0)}%` : '—'}</div>,
            <div key="f4" style={{ ...ft, color: T.ink }}>
              {totalAcc.toLocaleString()}<span style={{ color: totalRej > 200 ? T.red : T.ink4 }}> /{totalRej}</span>
            </div>,
            <div key="f5" style={{ ...ft, color: avgAsic > 69 ? T.red : T.ink }}>{Math.round(avgAsic)}°</div>,
            <div key="f6" style={{ ...ft, color: avgVr != null && avgVr > 69 ? T.red : T.ink }}>{avgVr != null ? `${Math.round(avgVr)}°` : '—'}</div>,
            <div key="f7" style={{ ...ft, color: T.ink }}>{fmtPower(totalPower)}</div>,
          ];
        })()}

      </div>
    </div>
  );
}

export default Miners;
