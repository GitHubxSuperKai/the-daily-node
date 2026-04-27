import React from 'react';
import { useT } from '../theme';
import { fmtNum, fmtBlockTime, fmtHashrate } from '../utils/formatting';

function Ticker({ chain, feedHealth }) {
  const T = useT();

  const blockHeight = chain.data ? fmtNum(chain.data.height) : '—';
  const mempoolMB   = chain.data ? `${(chain.data.mempoolBytes / 1e6).toFixed(0)} MB` : '—';
  const mempoolTx   = chain.data ? fmtNum(chain.data.mempoolTx) : '—';
  const epochPct    = chain.data?.epochProgress;
  const rawBlockTime = chain.data?.blockTimeMs;
  const blockTimeCol = rawBlockTime == null ? T.ink : rawBlockTime / 1000 < 570 ? T.orange : rawBlockTime / 1000 <= 630 ? T.green : T.red;
  const blocksToClr  = chain.data ? Math.ceil(chain.data.mempoolBytes / 1_000_000) : null;
  const blocksToClrCol= blocksToClr == null ? T.ink : blocksToClr <= 2 ? T.green : blocksToClr <= 8 ? T.ink : T.red;

  return (
    <div style={{ display:'flex', alignItems:'center', padding:'9px 0', borderBottom:`1px solid ${T.rule2}`, fontFamily:T.mono, fontSize:12, overflow:'hidden' }}>
      <span style={{ fontFamily:T.sans, fontWeight:700, fontSize:9, letterSpacing:2, color:T.ink3, display:'flex', alignItems:'center', gap:4, flexShrink:0, marginRight:20 }}>
        LIVE
        <span style={{
          color: feedHealth === 'live' ? '#d63030' : feedHealth === 'degraded' ? T.orange : T.ink4,
          animation: feedHealth === 'live' ? 'live-pulse 1.4s ease-in-out infinite' : 'none',
          display: 'inline-block',
          lineHeight: 1,
        }}>⏺</span>
      </span>
      <div style={{ flex:1, overflow:'hidden' }}>
        <div style={{ display:'inline-flex', whiteSpace:'nowrap', animation:'ticker-scroll 100s linear infinite' }}>
          {(() => {
            const halvingBlocksLeft = chain.data
              ? fmtNum(Math.ceil((chain.data.height + 1) / 210000) * 210000 - chain.data.height)
              : '—';
            const items = [
              ['BLOCK',   blockHeight,                                                                                    'latest',                                                                                          T.ink3],
              ['HASH',    chain.data ? fmtHashrate(chain.data.hashrate) : '—',                                           chain.data && chain.data.diffAdj != null ? `${chain.data.diffAdj >= 0 ? '+' : ''}${chain.data.diffAdj.toFixed(1)}%` : '', T.ink3],
              ['TIME',    chain.data ? fmtBlockTime(chain.data.blockTimeMs) : '—',                                       'avg',                                                                                             blockTimeCol],
              ['EPOCH',   epochPct != null ? `${epochPct.toFixed(0)}%` : '—',                                            chain.data ? `${fmtNum(chain.data.remainingBlocks)} blk left` : '',                               T.ink3],
              ['FEE',     chain.data ? `${chain.data.feeFast} sat/vB` : '—',                                             chain.data ? `eco ${chain.data.feeEco}` : '',                                                     T.ink3],
              ['MEMPOOL', mempoolMB,                                                                                      `${mempoolTx} tx`,                                                                                 blocksToClrCol],
              ['CLR',     blocksToClr != null ? `${blocksToClr} blk` : '—',                                              'to clear',                                                                                        blocksToClrCol],
              ['SUPPLY',  chain.data ? chain.data.circulating : '—',                                                     '',                                                                                                T.ink3],
              ['HALVING', chain.data?.nextHalvingDate || '—',                                                             halvingBlocksLeft !== '—' ? `${halvingBlocksLeft} blk` : '',                                      T.ink3],
            ];
            const renderItem = ([k, v, s, sc], pfx) => (
              <span key={pfx} style={{ display:'inline-flex', alignItems:'baseline', gap:5, paddingRight:36, flexShrink:0 }}>
                <span style={{ color:T.ink3, letterSpacing:1 }}>{k}</span>
                <b style={{ fontWeight:600, color:T.ink }}>{v}</b>
                {s && <span style={{ color:sc }}>{s}</span>}
              </span>
            );
            return [
              ...items.map((item, i) => renderItem(item, `a${i}`)),
              ...items.map((item, i) => renderItem(item, `b${i}`)),
            ];
          })()}
        </div>
      </div>
    </div>
  );
}

export default Ticker;
