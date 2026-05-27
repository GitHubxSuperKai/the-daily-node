import React from 'react';
import { useT } from '../theme';
import { u } from '../utils/scale.js';

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

export const fmtPower = (w) => w < 1000 ? `${Math.round(w)}W` : `${(w / 1000).toFixed(1)}kW`;

export function getMinerStatus(miner) {
  return (miner.online && miner.data) ? 'hashing' : 'unreachable';
}

export function getMinerName(miner) {
  if (miner.data?.hostname) return miner.data.hostname;
  const parts = (miner.ip || '').split('.');
  return `rig-${parts[parts.length - 1] || '(no IP)'}`;
}

export function MinerRow({ miner, ri, isLast }) {
  const T = useT();
  const tnum = React.useMemo(
    () => ({ fontFamily: T.mono, fontSize: u(11), textAlign: 'right', fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap' }),
    [T.mono]
  );

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

  const rowBase = { padding: `${u(5)} 0`, opacity: isOff ? 0.4 : 1 };

  return (
    <>
      <div style={{ ...rowBase, display: 'flex', alignItems: 'flex-start' }}>
        <Dot status={status} />
        <span style={{ fontFamily: T.sans, fontSize: u(11), fontWeight: 600, color: T.ink, overflowWrap: 'break-word', lineHeight: 1.3 }}>
          {getMinerName(miner).split('_').map((part, i) => (
            <React.Fragment key={i}>{i > 0 && <>{`_`}<wbr /></>}{part}</React.Fragment>
          ))}
        </span>
      </div>
      <div style={{ ...rowBase, ...tnum, color: T.ink }}>{isOff ? '—' : hr.toFixed(2)}</div>
      <div style={{ ...rowBase, ...tnum, color: eff > 25 ? T.red : T.ink }}>{isOff ? '—' : eff.toFixed(1)}</div>
      <div style={{ ...rowBase, ...tnum, color: upPct != null && upPct < 80 ? T.red : T.ink2 }}>
        {isOff ? '—' : (upPct != null ? `${upPct.toFixed(0)}%` : '—')}
      </div>
      <div style={{ ...rowBase, ...tnum, color: T.ink2 }}>
        {isOff ? '—' : <>{accS.toLocaleString()}<span style={{ color: rejS > 50 ? T.red : T.ink4 }}> /{rejS}</span></>}
      </div>
      <div style={{ ...rowBase, ...tnum, color: temp > 69 ? T.red : T.ink2 }}>{isOff ? '—' : `${temp.toFixed(1)}°`}</div>
      <div style={{ ...rowBase, ...tnum, color: vrT != null && vrT > 69 ? T.red : T.ink2 }}>
        {isOff ? '—' : (vrT != null ? `${vrT.toFixed(1)}°` : '—')}
      </div>
      <div style={{ ...rowBase, ...tnum, color: pwrLimit && watts > pwrLimit ? T.red : T.ink2 }}>
        {isOff ? '—' : `${Math.round(watts)}W`}
      </div>
      {!isLast && <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${T.rule3}`, padding: 0 }} />}
    </>
  );
}

export default MinerRow;
