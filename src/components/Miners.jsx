import React from 'react';
import { useT } from '../theme';
import Num from './Num';
import Kicker from './Kicker';
import StatusDot from './StatusDot';
import { fmtNum, calcSoloOdds } from '../utils/formatting';
import { fmtBestDiff } from '../utils/format';

function Miners({ bitaxe, chain }) {
  const T = useT();

  const onlineMiners    = bitaxe.miners.filter(m => m.online && m.data);
  const minerCount      = bitaxe.miners.length;
  const onlineCount     = onlineMiners.length;
  const totalHashrateTHS = onlineMiners.reduce((sum, m) => sum + ((m.data.hashRate || 0) / 1000), 0);
  const totalPower      = onlineMiners.reduce((sum, m) => sum + (m.data.power || 0), 0);
  const combinedEff     = totalHashrateTHS > 0 ? (totalPower / totalHashrateTHS).toFixed(1) : '—';
  const totalShOk       = onlineMiners.reduce((sum, m) => sum + (m.data.sharesAccepted || 0), 0);
  const totalShRej      = onlineMiners.reduce((sum, m) => sum + (m.data.sharesRejected || 0), 0);
  const firstMiner      = onlineMiners[0]?.data;
  const bxPool          = firstMiner ? (firstMiner.stratumURL || 'solo.ckpool.org') : 'solo.ckpool.org';

  const soloOdds = chain.data && totalHashrateTHS > 0
    ? calcSoloOdds(chain.data.hashrate / 1e18, totalHashrateTHS)
    : null;
  const oddsStr  = soloOdds ? `1 : ${fmtNum(soloOdds.oddsPerDay)}` : '—';
  const etaStr   = soloOdds ? `~${fmtNum(soloOdds.etaYears)} yrs` : '—';

  // Best difficulty + Field Report prose
  const bestDiffRaw = onlineMiners.reduce((best, m) => {
    const bd = parseFloat(m.data?.bestDiff || m.data?.bestDifficulty || 0);
    return bd > best ? bd : best;
  }, 0);
  const bestDiffStr = fmtBestDiff(bestDiffRaw);
  const diffRatio = bestDiffRaw > 0 && chain.data?.difficulty
    ? bestDiffRaw / chain.data.difficulty : 0;
  const blockPun = diffRatio >= 0.01    ? 'That is dangerously close. Hold your breath.'
    : diffRatio >= 0.001  ? 'One in a thousand of the way there. Progress.'
    : diffRatio >= 0.0001 ? 'A polite knock on the door.'
    : diffRatio >= 0.00001 ? 'Statistically present. Practically invisible.'
    : 'The block does not know you exist yet. Keep hashing.';

  const sharesNote = totalShRej > 0
    ? `${((totalShRej / (totalShOk + totalShRej + 1)) * 100).toFixed(1)}% rejected`
    : 'running clean';

  const fieldReportProse = onlineCount === 0
    ? `All units offline. The network hashes on at ${chain.data ? fmtNum(Math.round(chain.data.hashrate / 1e18)) + ' EH/s' : '—'} without you.`
    : `${onlineCount === 1 ? 'A single unit pushes' : `${onlineCount} miners push`} ${totalHashrateTHS.toFixed(2)} TH/s into ${bxPool}, drawing ${Math.round(totalPower)} W at ${combinedEff} J/TH. Shares ${sharesNote}. Best diff this session: ${bestDiffStr}. ${blockPun}`;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10, overflow:'hidden' }}>
      <Kicker>Field Report · Home Fleet</Kicker>

      {/* Editorial prose dispatch */}
      <p style={{ fontFamily:T.body, fontSize:13.5, lineHeight:1.55, color:T.ink2, fontStyle:'italic', margin:0 }}>
        {fieldReportProse}
      </p>

      {/* 4-stat compact row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:8, paddingTop:4 }}>
        {[
          { v: onlineCount > 0 ? totalHashrateTHS.toFixed(2) : '—', u: 'TH/s', k: 'Hashrate' },
          { v: onlineCount > 0 ? String(Math.round(totalPower)) : '—', u: 'W', k: 'Power' },
          { v: onlineCount > 0 ? combinedEff : '—', u: 'J/TH', k: 'Efficiency' },
          { v: bestDiffStr, u: '', k: 'Best Diff' },
        ].map(({ v, u, k }) => (
          <div key={k} style={{ borderLeft:`2px solid ${T.rule2}`, paddingLeft:8 }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:2 }}>
              <span style={{ fontFamily:T.mono, fontSize:16, fontWeight:600, color:T.ink, fontFeatureSettings:'"tnum"' }}>{v}</span>
              {u && <span style={{ fontFamily:T.mono, fontSize:10, color:T.ink3 }}>{u}</span>}
            </div>
            <Kicker style={{ marginTop:2 }}>{k}</Kicker>
          </div>
        ))}
      </div>

      {/* Per-miner cards */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        {bitaxe.miners.length === 0 && !bitaxe.loading && (
          <div style={{ gridColumn:'1/-1', fontFamily:T.mono, fontSize:12, color:T.ink3 }}>
            No miners reachable
          </div>
        )}
        {bitaxe.miners.map((miner, i) => {
          const md = miner.online ? miner.data : null;
          const hrTHS  = md ? ((md.hashRate || 0) / 1000).toFixed(2) : '—';
          const temp   = md ? (md.temp || md.temperature || '—') : '—';
          const power  = md ? (md.power || '—') : '—';
          const eff    = md && md.power && md.hashRate ? (md.power / (md.hashRate / 1000)).toFixed(1) : '—';
          const model  = md ? (md.boardVersion || md.ASICModel || 'Bitaxe') : 'Bitaxe';
          return (
            <div key={i} style={{ borderLeft:`2px solid ${miner.online ? T.green : T.red}`, paddingLeft:8, paddingTop:4, paddingBottom:4 }}>
              <div style={{ fontFamily:T.mono, fontSize:10, color:T.ink3, marginBottom:3 }}>
                <StatusDot ok={miner.online} />{miner.ip}
              </div>
              <div style={{ fontFamily:T.mono, fontSize:10, color:T.ink2, marginBottom:6 }}>{model}</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 8px' }}>
                {[
                  [hrTHS, 'TH/s', 'Hashrate'],
                  [temp,  '°C',   'Temp'],
                  [power, 'W',    'Power'],
                  [eff,   'J/TH', 'Eff'],
                ].map(([v, u, label], j) => (
                  <div key={j} style={{ borderLeft:`1px solid ${T.rule3}`, paddingLeft:6 }}>
                    <Num size="xs" value={v} unit={u} />
                    <Kicker style={{ marginTop:2 }}>{label}</Kicker>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Miners;
