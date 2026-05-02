import React from 'react';
import { useT } from '../theme';
import { calcSoloOdds, timeAgoUnix } from '../utils/formatting';

const statusColor = {
  online:   '#3a6b2e',
  degraded: '#c8641a',
  offline:  '#9c2a1a',
};

function Dot({ status }) {
  const T = useT();
  return (
    <span style={{
      display: 'inline-block', width: u(6), height: u(6), borderRadius: '50%',
      background: statusColor[status] || T.ink3,
      flexShrink: 0, marginRight: u(5), position: 'relative', top: -1,
    }} />
  );
}

function getMinerStatus(miner) {
  if (!miner.online || !miner.data) return 'offline';
  const temp = miner.data.temp || miner.data.temperature || 0;
  const hr = (miner.data.hashRate || 0) / 1000;
  const eff = hr > 0 ? (miner.data.power || 0) / hr : 0;
  if (temp > 69 || eff > 25) return 'degraded';
  return 'online';
}

function getMinerName(miner) {
  if (miner.data?.hostname) return miner.data.hostname;
  const parts = (miner.ip || '').split('.');
  return `rig-${parts[parts.length - 1] || '?'}`;
}

function Miners({ bitaxe, chain }) {
  const T = useT();

  // Grid template: first col flexible, rest fixed design-px widths
  const GRID = `1fr ${u(52)} ${u(46)} ${u(44)} ${u(80)} ${u(48)} ${u(48)} ${u(52)}`;

  const onlineMiners = bitaxe.miners.filter(m => m.online && m.data);
  const minerCount   = bitaxe.miners.length;
  const onlineCount  = onlineMiners.length;

  const totalHashTH  = onlineMiners.reduce((s, m) => s + (m.data.hashRate || 0) / 1000, 0);
  const totalPower   = onlineMiners.reduce((s, m) => s + (m.data.power || 0), 0);
  const totalAcc     = bitaxe.miners.reduce((s, m) => s + (m.data?.sharesAccepted || 0), 0);
  const totalRej     = bitaxe.miners.reduce((s, m) => s + (m.data?.sharesRejected || 0), 0);

  const networkHashEH = chain.data ? chain.data.hashrate / 1e18 : 0;
  const oddsResult = chain.data && totalHashTH > 0
    ? calcSoloOdds(networkHashEH, totalHashTH)
    : null;
  const oddsOneIn = oddsResult ? oddsResult.oddsPerDay : null;

  const agoStr = bitaxe.lastOk ? timeAgoUnix(Math.floor(bitaxe.lastOk / 1000)) : '—';

  const activeMiners = bitaxe.miners.filter(m => getMinerStatus(m) !== 'offline');
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

  const cell = (val, color) => (
    <div style={{
      fontFamily: T.mono, fontSize: u(11), textAlign: 'right',
      fontFeatureSettings: '"tnum"', color: color || T.ink, whiteSpace: 'nowrap',
    }}>
      {val}
    </div>
  );

  const fcell = (val, color) => (
    <div style={{
      fontFamily: T.mono, fontSize: u(11), textAlign: 'right',
      fontFeatureSettings: '"tnum"', color: color || T.ink, whiteSpace: 'nowrap',
      fontWeight: 700,
    }}>
      {val}
    </div>
  );

  const HEADERS = [
    { label: '',       fade: false },
    { label: 'TH/s',  fade: false },
    { label: 'J/T',   fade: false },
    { label: 'Up%',   fade: true  },
    { label: 'Shares', fade: true },
    { label: 'ASIC°', fade: true  },
    { label: 'VR°',   fade: true  },
    { label: 'Watts',  fade: true  },
  ];

  const showStubs = bitaxe.miners.length === 0 && !bitaxe.loading;

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
          {onlineCount}/{minerCount} active · {agoStr}
        </span>
      </div>

      {/* Pull-quote hero */}
      <div style={{ borderLeft: `${u(3)} solid ${T.ink}`, paddingLeft: u(12), marginBottom: u(14) }}>
        <div style={{
          fontFamily: T.serif, fontSize: u(38), fontWeight: 800, fontStyle: 'italic',
          color: oddsOneIn ? T.ink : T.ink4, lineHeight: 1, letterSpacing: -0.5,
          fontFeatureSettings: '"tnum"',
        }}>
          {oddsOneIn ? `1-in-${oddsOneIn.toLocaleString()}` : '1-in-—'}
        </div>
        <div style={{
          fontFamily: T.body, fontSize: u(12), fontStyle: 'italic',
          color: T.ink2, marginTop: u(5), lineHeight: 1.45,
        }}>
          odds of finding a block today —<br />
          {onlineCount > 0
            ? `${totalHashTH.toFixed(2)} TH/s · ${fmtPower(totalPower)} across ${onlineCount} active ${onlineCount === 1 ? 'rig' : 'rigs'}`
            : 'no rigs online'}
        </div>
      </div>

      {/* Agate table */}
      <div style={{ position: 'relative' }}>
        {/* Headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: GRID,
          gap: `0 ${u(4)}`, padding: `${u(3)} ${u(2)}`,
          borderTop: `1px solid ${T.rule2}`, borderBottom: `1px solid ${T.rule2}`,
          marginBottom: 1,
        }}>
          {HEADERS.map(({ label, fade }, i) => (
            <div key={i} style={{
              fontFamily: T.sans, fontSize: u(8), fontWeight: 700,
              letterSpacing: u(1.1), textTransform: 'uppercase',
              color: fade ? T.ink4 : T.ink3,
              textAlign: i > 0 ? 'right' : 'left',
              whiteSpace: 'nowrap',
            }}>
              {label}
            </div>
          ))}
        </div>

        {showStubs && (
          <div style={{
            padding: `${u(8)} ${u(2)}`,
            borderBottom: `1px solid ${T.rule3}`,
            fontFamily: T.mono, fontSize: u(11), color: T.ink4,
          }}>
            No miners configured
          </div>
        )}

        {/* Data rows */}
        {bitaxe.miners.map((miner, i) => {
          const status = getMinerStatus(miner);
          const isOff  = status === 'offline';
          const md     = miner.data;

          const hr    = md ? (md.hashRate || 0) / 1000 : 0;
          const watts = md?.power || 0;
          const eff   = hr > 0 ? watts / hr : 0;
          const temp  = md ? (md.temp || md.temperature || 0) : 0;
          const vrT   = md?.vrTemp ?? null;
          const upSec = md?.uptimeSeconds ?? null;
          const upPct = upSec != null ? Math.min(99.9, (upSec / 86400) * 100) : null;
          const accS  = md?.sharesAccepted || 0;
          const rejS  = md?.sharesRejected || 0;
          const pwrLimit = md?.powerLimit || null;

          return (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: GRID,
              gap: `0 ${u(4)}`, padding: `${u(5)} ${u(2)}`,
              borderBottom: `1px solid ${T.rule3}`,
              opacity: isOff ? 0.4 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                <Dot status={status} />
                <span style={{ fontFamily: T.sans, fontSize: u(11), fontWeight: 600, color: T.ink }}>
                  {getMinerName(miner)}
                </span>
              </div>
              {cell(isOff ? '—' : hr.toFixed(2), T.ink)}
              {cell(isOff ? '—' : `${eff.toFixed(1)}`, eff > 25 ? T.red : T.ink)}
              {cell(isOff ? '—' : (upPct != null ? `${upPct.toFixed(0)}%` : '—'), upPct != null && upPct < 80 ? T.red : T.ink2)}
              <div style={{
                fontFamily: T.mono, fontSize: u(11), textAlign: 'right',
                fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap', color: T.ink2,
              }}>
                {isOff ? '—' : (
                  <>
                    {accS.toLocaleString()}
                    <span style={{ color: rejS > 50 ? T.red : T.ink4 }}> /{rejS}</span>
                  </>
                )}
              </div>
              {cell(isOff ? '—' : `${temp.toFixed(1)}°`, temp > 69 ? T.red : T.ink2)}
              {cell(isOff ? '—' : (vrT != null ? `${vrT.toFixed(1)}°` : '—'), vrT != null && vrT > 69 ? T.red : T.ink2)}
              {cell(isOff ? '—' : `${Math.round(watts)}W`, pwrLimit && watts > pwrLimit ? T.red : T.ink2)}
            </div>
          );
        })}
      </div>

      {/* Fleet totals row */}
      {bitaxe.miners.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: GRID,
          gap: `0 ${u(4)}`, padding: `${u(6)} ${u(4)}`,
          borderTop: `1px solid ${T.rule2}`,
          marginTop: 1,
          background: T.paper2,
        }}>
          <div style={{
            fontFamily: T.sans, fontSize: u(9), fontWeight: 700,
            letterSpacing: u(1.1), textTransform: 'uppercase',
            color: T.ink3, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap',
          }}>
            Fleet
          </div>
          {fcell(`${totalHashTH.toFixed(2)}`, T.ink)}
          {fcell(`${avgEff.toFixed(1)}`, avgEff > 25 ? T.red : T.ink)}
          {fcell(avgUp != null ? `${avgUp.toFixed(0)}%` : '—', avgUp != null && avgUp < 80 ? T.red : T.ink)}
          <div style={{
            fontFamily: T.mono, fontSize: u(11), textAlign: 'right',
            fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap', fontWeight: 700, color: T.ink,
          }}>
            {totalAcc.toLocaleString()}
            <span style={{ color: totalRej > 200 ? T.red : T.ink4 }}> /{totalRej}</span>
          </div>
          {fcell(`${Math.round(avgAsic)}°`, avgAsic > 69 ? T.red : T.ink)}
          {fcell(avgVr != null ? `${Math.round(avgVr)}°` : '—', avgVr != null && avgVr > 69 ? T.red : T.ink)}
          {fcell(fmtPower(totalPower), T.ink)}
        </div>
      )}
    </div>
  );
}

export default Miners;
