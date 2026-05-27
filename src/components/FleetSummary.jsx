import React from 'react';
import { useT } from '../theme';
import { u } from '../utils/scale.js';
import { getMinerStatus, fmtPower } from './MinerRow.jsx';

export function FleetSummary({ miners }) {
  const T = useT();
  const tnum = React.useMemo(
    () => ({ fontFamily: T.mono, fontSize: u(11), textAlign: 'right', fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap' }),
    [T.mono]
  );

  const activeMiners = miners.filter(m => getMinerStatus(m) !== 'unreachable');

  const totalHashTH = activeMiners.reduce((s, m) => s + (m.data?.hashRate || 0) / 1000, 0);
  const totalPower  = activeMiners.reduce((s, m) => s + (m.data?.power || 0), 0);
  const totalAcc    = miners.reduce((s, m) => s + (m.data?.sharesAccepted || 0), 0);
  const totalRej    = miners.reduce((s, m) => s + (m.data?.sharesRejected || 0), 0);

  const avgEff = activeMiners.length > 0
    ? activeMiners.reduce((s, m) => {
        const hr = (m.data?.hashRate || 0) / 1000;
        return s + (hr > 0 ? (m.data?.power || 0) / hr : 0);
      }, 0) / activeMiners.length
    : 0;

  const avgUp = activeMiners.length > 0
    ? activeMiners.reduce((s, m) => {
        const up = m.data?.uptimeSeconds != null
          ? Math.min(99.9, (m.data.uptimeSeconds / 86400) * 100) : 0;
        return s + up;
      }, 0) / activeMiners.length
    : null;

  const avgAsic = activeMiners.length > 0
    ? activeMiners.reduce((s, m) => s + (m.data?.temp || m.data?.temperature || 0), 0) / activeMiners.length
    : 0;

  const vrAvailable = miners.some(m => m.data?.vrTemp != null);
  const avgVr = vrAvailable && activeMiners.length > 0
    ? activeMiners.reduce((s, m) => s + (m.data?.vrTemp || 0), 0) / activeMiners.length
    : null;

  const ft = { ...tnum, fontWeight: 700, padding: `${u(5)} 0` };

  return (
    <>
      <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${T.ink}`, padding: 0 }} />
      <div style={{ padding: `${u(5)} 0`, fontFamily: T.sans, fontSize: u(9), fontWeight: 700, letterSpacing: u(1.1), textTransform: 'uppercase', color: T.ink, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
        Fleet
      </div>
      <div style={{ ...ft, color: T.ink }}>{totalHashTH.toFixed(2)}</div>
      <div style={{ ...ft, color: avgEff > 25 ? T.red : T.ink }}>{avgEff.toFixed(1)}</div>
      <div style={{ ...ft, color: avgUp != null && avgUp < 80 ? T.red : T.ink }}>{avgUp != null ? `${avgUp.toFixed(0)}%` : '—'}</div>
      <div style={{ ...ft, color: T.ink }}>
        {totalAcc.toLocaleString()}<span style={{ color: totalRej > 200 ? T.red : T.ink4 }}> /{totalRej}</span>
      </div>
      <div style={{ ...ft, color: avgAsic > 69 ? T.red : T.ink }}>{Math.round(avgAsic)}°</div>
      <div style={{ ...ft, color: avgVr != null && avgVr > 69 ? T.red : T.ink }}>{avgVr != null ? `${Math.round(avgVr)}°` : '—'}</div>
      <div style={{ ...ft, color: T.ink }}>{fmtPower(totalPower)}</div>
    </>
  );
}

export default FleetSummary;
