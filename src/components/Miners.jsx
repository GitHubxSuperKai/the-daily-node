import React from 'react';
import { useT } from '../theme';
import { calcSoloOdds } from '../utils/formatting';

const GRID = '1fr 52px 46px 44px 80px 48px 48px 52px';

const statusColor = {
  online:   '#3a6b2e',
  degraded: '#c8641a',
  offline:  '#9c2a1a',
};

function Dot({ status }) {
  const T = useT();
  return (
    <span style={{
      display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
      background: statusColor[status] || T.ink3,
      flexShrink: 0, marginRight: 5, position: 'relative', top: -1,
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

  const lastOkMin = bitaxe.lastOk ? Math.round((Date.now() - bitaxe.lastOk) / 60000) : null;
  const agoStr = lastOkMin != null ? `${lastOkMin}m ago` : '—';

  // Fleet totals
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
  const avgAsic = activeMiners.length > 0
    ? activeMiners.reduce((s, m) => s + (m.data?.temp || m.data?.temperature || 0), 0) / activeMiners.length
    : 0;
  const vrAvailable = bitaxe.miners.some(m => m.data?.vrTemp != null);
  const avgVr = vrAvailable && activeMiners.length > 0
    ? activeMiners.reduce((s, m) => s + (m.data?.vrTemp || 0), 0) / activeMiners.length
    : null;

  const cell = (val, color) => (
    <div style={{
      fontFamily: T.mono, fontSize: 11, textAlign: 'right',
      fontFeatureSettings: '"tnum"', color: color || T.ink, whiteSpace: 'nowrap',
    }}>
      {val}
    </div>
  );

  const fcell = (val, color) => (
    <div style={{
      fontFamily: T.mono, fontSize: 11, textAlign: 'right',
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
    <div style={{ marginBottom: 4 }}>

      {/* Masthead */}
      <div style={{
        borderTop: `3px solid ${T.ink}`,
        borderBottom: `1px solid ${T.ink}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        padding: '5px 0', marginBottom: 14,
      }}>
        <span style={{
          fontFamily: T.sans, fontSize: 10, fontWeight: 700,
          letterSpacing: 2, textTransform: 'uppercase', color: T.ink, whiteSpace: 'nowrap',
        }}>
          Field Report
        </span>
        <span style={{
          fontFamily: T.body, fontSize: 10, fontStyle: 'italic',
          color: T.ink3, whiteSpace: 'nowrap',
        }}>
          {onlineCount}/{minerCount} active · {agoStr}
        </span>
      </div>

      {/* Pull-quote hero */}
      <div style={{ borderLeft: `3px solid ${T.ink}`, paddingLeft: 12, marginBottom: 14 }}>
        <div style={{
          fontFamily: T.serif, fontSize: 38, fontWeight: 800, fontStyle: 'italic',
          color: oddsOneIn ? T.ink : T.ink4, lineHeight: 1, letterSpacing: -0.5,
          fontFeatureSettings: '"tnum"',
        }}>
          {oddsOneIn ? `1-in-${oddsOneIn.toLocaleString()}` : '1-in-—'}
        </div>
        <div style={{
          fontFamily: T.body, fontSize: 12, fontStyle: 'italic',
          color: T.ink2, marginTop: 5, lineHeight: 1.45,
        }}>
          odds of finding a block today —<br />
          {onlineCount > 0
            ? `${totalHashTH.toFixed(2)} TH/s · ${(totalPower / 1000).toFixed(1)} kW across ${onlineCount} active ${onlineCount === 1 ? 'rig' : 'rigs'}`
            : 'no rigs online'}
        </div>
      </div>

      {/* Agate table */}
      <div style={{ position: 'relative' }}>
        {/* Headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: GRID,
          gap: '0 4px', padding: '3px 2px',
          borderTop: `1px solid ${T.rule2}`, borderBottom: `1px solid ${T.rule2}`,
          marginBottom: 1,
        }}>
          {HEADERS.map(({ label, fade }, i) => (
            <div key={i} style={{
              fontFamily: T.sans, fontSize: 8, fontWeight: 700,
              letterSpacing: 1.1, textTransform: 'uppercase',
              color: fade ? T.ink4 : T.ink3,
              textAlign: i > 0 ? 'right' : 'left',
              whiteSpace: 'nowrap',
            }}>
              {label}
            </div>
          ))}
        </div>

        {/* Stub row when no miners configured */}
        {showStubs && (
          <div style={{
            padding: '8px 2px',
            borderBottom: `1px solid ${T.rule3}`,
            fontFamily: T.mono, fontSize: 11, color: T.ink4,
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
              gap: '0 4px', padding: '5px 2px',
              borderBottom: `1px solid ${T.rule3}`,
              opacity: isOff ? 0.4 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                <Dot status={status} />
                <span style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: T.ink }}>
                  {getMinerName(miner)}
                </span>
              </div>
              {cell(isOff ? '—' : hr.toFixed(2), T.ink})
              {cell(isOff ? '—' : `${eff.toFixed(1)}`, eff > 25 ? T.red : T.ink})
              {cell(isOff ? '—' : (upPct != null ? `${upPct.toFixed(0)}%` : '—'), upPct != null && upPct < 80 ? T.red : T.ink2})
              <div style={{
                fontFamily: T.mono, fontSize: 11, textAlign: 'right',
                fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap', color: T.ink2,
              }}>
                {isOff ? '—' : (
                  <>
                    {accS.toLocaleString()}
                    <span style={{ color: rejS > 50 ? T.red : T.ink4 }}> /{rejS}</span>
                  </>
                )}
              </div>
              {cell(isOff ? '—' : `${temp}°`, temp > 69 ? T.red : T.ink2})
              {cell(isOff ? '—' : (vrT != null ? `${vrT}°` : '—'), vrT != null && vrT > 69 ? T.red : T.ink2})
              {cell(isOff ? '—' : `${watts}W`, pwrLimit && watts > pwrLimit ? T.red : T.ink2})
            </div>
          );
        })}
      </div>

      {/* Fleet totals row */}
      {bitaxe.miners.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: GRID,
          gap: '0 4px', padding: '6px 4px',
          borderTop: `1px solid ${T.rule2}`,
          marginTop: 1,
          background: T.paper2,
        }}>
          <div style={{
            fontFamily: T.sans, fontSize: 9, fontWeight: 700,
            letterSpacing: 1.1, textTransform: 'uppercase',
            color: T.ink3, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap',
          }}>
            Fleet
          </div>
          {fcell(`${totalHashTH.toFixed(2)}`, T.ink})
          {fcell(`${avgEff.toFixed(1)}`, avgEff > 25 ? T.red : T.ink})
          {fcell(avgUp != null ? `${avgUp.toFixed(0)}%` : '—', avgUp != null && avgUp < 80 ? T.red : T.ink})
          <div style={{
            fontFamily: T.mono, fontSize: 11, textAlign: 'right',
            fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap', fontWeight: 700, color: T.ink,
          }}>
            {totalAcc.toLocaleString()}
            <span style={{ color: totalRej > 200 ? T.red : T.ink4 }}> /{totalRej}</span>
          </div>
          {fcell(`${Math.round(avgAsic)}°`, avgAsic > 69 ? T.red : T.ink})
          {fcell(avgVr != null ? `${Math.round(avgVr)}°` : '—', avgVr != null && avgVr > 69 ? T.red : T.ink})
          {fcell(`${(totalPower / 1000).toFixed(1)}kW`, T.ink})
        </div>
      )}
    </div>
  );
}

export default Miners;
