import React from 'react';
import { useT } from '../theme';
import Num from './Num';
import Rule from './Rule';
import LineChart from './LineChart';
import Kicker from './Kicker';
import { fmtPrice, fmtPct, fmtVolUsd, fmtNum } from '../utils/formatting';

function Price({ btc }) {
  const T = useT();

  const btcPrice   = btc.data ? `$${fmtPrice(btc.data.price)}` : '—';
  const btcChgPct  = btc.data ? fmtPct(btc.data.chgPct) : '—';
  const btcUp      = btc.data ? btc.data.chgPct >= 0 : true;
  const btcHi      = btc.data ? fmtPrice(btc.data.hi) : '—';
  const btcLo      = btc.data ? fmtPrice(btc.data.lo) : '—';
  const btcCap     = btc.data?.cap != null ? `$${(btc.data.cap / 1e12).toFixed(2)}T` : '—';
  const btcVol     = btc.data ? fmtVolUsd(btc.data.volBtc * btc.data.price) : '—';

  return (
    <div style={{ borderRight:`1px solid ${T.rule2}`, paddingRight:24, display:'flex', flexDirection:'column', gap:13, overflow:'hidden' }}>
      {/* BTC market */}
      <Kicker>Markets · BTC / USD</Kicker>
      {/* Row 1: price left, % change right */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
        <Num size="hero" value={btcPrice} />
        <div style={{ fontFamily:T.mono, fontSize:22, fontWeight:600, color:btcUp ? T.green : T.red, paddingBottom:10 }}>
          {btcUp ? '▲' : '▼'} {btcChgPct}%
        </div>
      </div>
      {/* Row 2: hi · lo · cap bar */}
      <div style={{ display:'flex', justifyContent:'space-between', fontFamily:T.mono, fontSize:11, borderTop:`1px solid ${T.rule2}`, borderBottom:`1px solid ${T.rule2}`, padding:'5px 0', marginBottom:6 }}>
        <span style={{ color:T.green }}>hi ${btcHi}</span>
        <span style={{ color:T.ink3 }}>·</span>
        <span style={{ color:T.red }}>lo ${btcLo}</span>
        <span style={{ color:T.ink3 }}>·</span>
        <span style={{ color:btcUp ? T.green : T.red }}>cap {btcCap}</span>
        <span style={{ color:T.ink3 }}>·</span>
        <span style={{ color:T.ink3 }}>vol {btcVol}</span>
        <span style={{ color:T.ink3 }}>·</span>
        <span style={{ color:T.orange }}>{btc.data ? fmtNum(Math.round(1e8 / btc.data.price)) : '—'} sat/$</span>
      </div>
      <LineChart w={470} h={110} color={T.orange} points={btc.chartPts} vwap={btc.data?.vwap} fill />
      <div style={{ display:'flex', justifyContent:'space-between', fontFamily:T.mono, fontSize:10, color:T.ink3 }}>
        <span>24h ago</span><span>−18h</span><span>−12h</span><span>−6h</span><span>now</span>
      </div>
      <Rule dash />
    </div>
  );
}

export default Price;
