import React from 'react';
import { useT } from '../theme';
import Num from './Num';
import Kicker from './Kicker';
import { fmtNum, fmtHashrate, fmtDiff, fmtBlockTime, fmtMempoolMB } from '../utils/formatting';

function Chain({ chain }) {
  const T = useT();

  const blockHeight = chain.data ? fmtNum(chain.data.height) : '—';
  const hashrate    = chain.data ? fmtHashrate(chain.data.hashrate) : '—';
  const difficulty  = chain.data ? fmtDiff(chain.data.difficulty) : '—';
  const mempoolMB   = chain.data ? fmtMempoolMB(chain.data.mempoolBytes) : '—';
  const mempoolTx   = chain.data ? fmtNum(chain.data.mempoolTx) : '—';
  const feeFast     = chain.data ? `${chain.data.feeFast} sat/vB` : '—';
  const feeEco      = chain.data ? `${chain.data.feeEco} sat/vB` : '—';

  // Chain vitals color logic
  const diffAdjVal    = chain.data?.diffAdj;
  const diffAdjStr    = diffAdjVal != null ? `${diffAdjVal >= 0 ? '+' : ''}${diffAdjVal.toFixed(2)}%` : '—';
  const diffAdjCol    = diffAdjVal != null ? (diffAdjVal >= 0 ? T.green : T.red) : T.ink;
  const epochPct      = chain.data?.epochProgress;
  const epochBlocks   = chain.data ? Math.round((epochPct / 100) * 2016) : null;
  const epochStr      = epochPct != null ? `${epochPct.toFixed(0)}% · ${epochBlocks}/2016` : '—';
  const retargetDate  = chain.data?.retargetDate ? new Date(chain.data.retargetDate).toISOString().slice(0,10) : '—';
  const blockTimeSec  = chain.data?.blockTimeMs ? chain.data.blockTimeMs / 1000 : null;
  const blockTimeCol  = blockTimeSec == null ? T.ink : blockTimeSec < 570 ? T.orange : blockTimeSec <= 630 ? T.green : T.red;
  const blocksToClr   = chain.data ? Math.ceil(chain.data.mempoolBytes / 1_000_000) : null;
  const blocksToClrCol= blocksToClr == null ? T.ink : blocksToClr <= 2 ? T.green : blocksToClr <= 8 ? T.ink : T.red;
  const rawFeeFast    = chain.data?.feeFast;
  const rawFeeEco     = chain.data?.feeEco;
  const feeFastCol    = rawFeeFast == null ? T.ink : rawFeeFast < 10 ? T.green : rawFeeFast < 50 ? T.ink : T.red;
  const feeEcoCol     = rawFeeEco  == null ? T.ink : rawFeeEco  < 5  ? T.green : rawFeeEco  < 20 ? T.ink : T.red;
  const rawMempoolMB  = chain.data ? chain.data.mempoolBytes / 1e6 : null;
  const mempoolCol    = rawMempoolMB == null ? T.ink : rawMempoolMB < 10 ? T.green : rawMempoolMB < 50 ? T.ink : T.red;
  const rawMempoolTx  = chain.data?.mempoolTx;
  const mempoolTxCol  = rawMempoolTx == null ? T.ink : rawMempoolTx < 5000 ? T.green : rawMempoolTx < 20000 ? T.ink : T.red;

  const miningRows = [
    { k: 'Hashrate',      v: hashrate },
    { k: 'Difficulty',    v: difficulty },
    { k: 'Avg block',     v: chain.data?.blockTimeMs ? fmtBlockTime(chain.data.blockTimeMs) : '—', c: blockTimeCol },
    { k: 'Diff retarget', v: diffAdjStr, c: diffAdjCol },
    { k: 'Retarget in',   v: chain.data?.remainingBlocks != null ? `${fmtNum(chain.data.remainingBlocks)} blk` : '—' },
    { k: 'Retarget date', v: retargetDate },
    { k: 'Epoch',         v: epochStr },
  ];
  const chainStatRows = [
    { k: 'Block height',  v: blockHeight },
    { k: 'Circulating',   v: chain.data ? chain.data.circulating : '—' },
    { k: 'Next halving',  v: chain.data ? chain.data.nextHalvingDate : '—' },
  ];
  const mempoolRows = [
    { k: 'Size',           v: mempoolMB,  c: mempoolCol },
    { k: 'Tx count',       v: mempoolTx,  c: mempoolTxCol },
    { k: 'Blocks to clear',v: blocksToClr != null ? `${blocksToClr} blk` : '—', c: blocksToClrCol },
    { k: 'Fee · fast',     v: feeFast,    c: feeFastCol },
    { k: 'Fee · eco',      v: feeEco,     c: feeEcoCol },
  ];

  return (
    <div>
      <Kicker>Chain vitals</Kicker>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0 14px' }}>
        {[['Mining', miningRows], ['Mempool', mempoolRows], ['Chain', chainStatRows]].map(([title, rows])=>(
          <div key={title}>
            <Kicker style={{ marginBottom:6 }}>{title}</Kicker>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {rows.map((r,i)=>(
                <div key={i} style={{ borderLeft:`1px solid ${T.rule3}`, paddingLeft:8 }}>
                  <Num size="sm" value={r.v} style={{ color: r.c || T.ink }} />
                  <Kicker style={{ marginTop:2 }}>{r.k}</Kicker>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Chain;
