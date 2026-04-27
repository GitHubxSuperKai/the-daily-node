import React from 'react';
import { useT } from '../theme';
import Num from './Num';
import Kicker from './Kicker';
import StatusDot from './StatusDot';
import { fmtNum, calcSoloOdds } from '../utils/formatting';

function Miners({ bitaxe, chain }) {
  const T = useT();

  // BitAxe fleet derived
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

  // Solo odds from combined fleet hashrate
  const soloOdds = chain.data && totalHashrateTHS > 0
    ? calcSoloOdds(chain.data.hashrate / 1e18, totalHashrateTHS)
    : null;
  const oddsStr  = soloOdds ? `1 : ${fmtNum(soloOdds.oddsPerDay)}` : '—';
  const etaStr   = soloOdds ? `~${fmtNum(soloOdds.etaYears)} yrs` : '—';

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10, overflow:'hidden' }}>
      <Kicker>Home fleet · {onlineCount}/{minerCount} online</Kicker>
      <h2 style={{ fontFamily:T.serif, fontSize:20, fontWeight:700, lineHeight:1.05, letterSpacing:-0.4, color:T.ink, textWrap:'balance', margin:0 }}>
        A <span style={{ fontStyle:'italic' }}>one-in-{soloOdds ? fmtNum(soloOdds.oddsPerDay).toLowerCase() : 'unknown'}</span> chance, every day.
      </h2>
      <div style={{ fontFamily:T.body, fontStyle:'italic', fontSize:11, color:T.ink2 }}>
        {bxPool} · {onlineCount > 0 ? `${totalHashrateTHS.toFixed(2)} TH/s combined` : 'miners offline'}
      </div>
      {/* Solo odds hero */}
      <div style={{ paddingTop:2 }}>
        {onlineCount === 0 ? (
          <div style={{ fontFamily:T.mono, fontSize:18, color:T.ink3 }}>
            {bitaxe.loading ? 'Connecting to miners…' : 'All miners offline'}
          </div>
        ) : (
          <div style={{ fontFamily:T.mono, fontSize:64, fontWeight:500, letterSpacing:-1, lineHeight:1, color:T.ink, fontFeatureSettings:'"tnum"' }}>
            {oddsStr}
          </div>
        )}
        <div style={{ fontFamily:T.mono, fontSize:12, color:T.ink3, marginTop:4, letterSpacing:0.5 }}>
          per day · expected {etaStr}
        </div>
      </div>
      {/* Per-miner cards */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
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
      <div style={{ fontFamily:T.body, fontStyle:'italic', fontSize:11, color:T.ink3 }}>
        "hash and pray." · {fmtNum(totalShOk)} ok / {fmtNum(totalShRej)} rej
      </div>
    </div>
  );
}

export default Miners;
