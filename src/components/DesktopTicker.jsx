import React from 'react';
import { useT } from '../theme';
import { u } from '../utils/scale.js';
import {
  fmtNum,
  fmtHashrate,
  fmtMempoolMB,
  fmtBlockTime,
  calcSoloOdds,
} from '../utils/formatting.js';

export function DesktopTicker({ btc, chain, bitaxe, feedHealth }) {
  const T = useT();

  const blockHeight   = chain.data ? fmtNum(chain.data.height) : '—';
  const mempoolMB     = chain.data ? fmtMempoolMB(chain.data.mempoolBytes) : '—';
  const mempoolTx     = chain.data ? fmtNum(chain.data.mempoolTx) : '—';
  const epochPct      = chain.data?.progressPercent;
  const blockTimeSec  = chain.data?.blockTimeMs ? chain.data.blockTimeMs / 1000 : null;
  const blockTimeCol  = blockTimeSec == null ? T.ink : blockTimeSec < 570 ? T.orange : blockTimeSec <= 630 ? T.green : T.red;
  const blocksToClr   = chain.data ? Math.ceil(chain.data.mempoolBytes / 1_000_000) : null;
  const blocksToClrCol = blocksToClr == null ? T.ink : blocksToClr <= 2 ? T.green : blocksToClr <= 8 ? T.ink : T.red;
  const rawMempoolMB  = chain.data ? chain.data.mempoolBytes / 1e6 : null;
  const mempoolCol    = rawMempoolMB == null ? T.ink : rawMempoolMB < 10 ? T.green : rawMempoolMB < 50 ? T.ink : T.red;

  const onlineMiners     = bitaxe.miners.filter((m) => m.online && m.data);
  const onlineCount      = onlineMiners.length;
  const totalHashrateTHS = onlineMiners.reduce((sum, m) => sum + ((m.data.hashRate || 0) / 1000), 0);
  const totalPower       = onlineMiners.reduce((sum, m) => sum + (m.data.power || 0), 0);
  const combinedEff      = totalHashrateTHS > 0 ? (totalPower / totalHashrateTHS).toFixed(1) : '—';
  const soloOdds         = chain.data && totalHashrateTHS > 0 ? calcSoloOdds(chain.data.hashrate / 1e18, totalHashrateTHS) : null;
  const etaStr           = soloOdds ? `~${fmtNum(soloOdds.etaYears)} yrs` : '—';

  const halvingBlocksLeft = chain.data
    ? fmtNum(Math.ceil((chain.data.height + 1) / 210000) * 210000 - chain.data.height)
    : '—';

  const items = [
    ['BLOCK', blockHeight, 'latest', T.ink3],
    ['HASH', chain.data ? fmtHashrate(chain.data.hashrate) : '—', chain.data && chain.data.diffAdj != null ? `${chain.data.diffAdj >= 0 ? '+' : ''}${chain.data.diffAdj.toFixed(1)}%` : '', T.ink3],
    ['TIME', chain.data ? fmtBlockTime(chain.data.blockTimeMs) : '—', 'avg', blockTimeCol],
    ['EPOCH', epochPct != null ? `${epochPct.toFixed(0)}%` : '—', chain.data ? `${fmtNum(chain.data.remainingBlocks)} blk left` : '', T.ink3],
    ['FEE', chain.data ? `${chain.data.feeFast} sat/vB` : '—', chain.data ? `eco ${chain.data.feeEco}` : '', T.ink3],
    ['MEMPOOL', mempoolMB, `${mempoolTx} tx`, mempoolCol],
    ['CLR', blocksToClr != null ? `${blocksToClr} blk` : '—', 'to clear', blocksToClrCol],
    ['SUPPLY', chain.data ? chain.data.circulating : '—', '', T.ink3],
    ['HALVING', chain.data?.nextHalvingDate || '—', halvingBlocksLeft !== '—' ? `${halvingBlocksLeft} blk` : '', T.ink3],
    ['FLEET', onlineCount > 0 ? `${totalHashrateTHS.toFixed(2)} TH/s` : bitaxe.err ? 'offline' : '…', onlineCount > 0 ? `${combinedEff} J/TH` : '', T.ink3],
    ['SOLO', `1:${soloOdds ? fmtNum(soloOdds.oddsPerDay) : '—'}/d`, etaStr, T.ink3],
  ];

  const renderItem = ([k, v, s, sc], pfx) => (
    <span key={pfx} style={{ display: 'inline-flex', alignItems: 'baseline', gap: u(5), paddingRight: u(36), flexShrink: 0 }}>
      <span style={{ color: T.ink3, letterSpacing: u(1) }}>{k}</span>
      <b style={{ fontWeight: 600, color: T.ink }}>{v}</b>
      {s && <span style={{ color: sc }}>{s}</span>}
    </span>
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: `${u(9)} 0`,
        borderBottom: `1px solid ${T.rule2}`,
        fontFamily: T.mono,
        fontSize: u(12),
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          fontFamily: T.sans,
          fontWeight: 700,
          fontSize: u(9),
          letterSpacing: u(2),
          color: T.ink3,
          display: 'flex',
          alignItems: 'center',
          gap: u(4),
          flexShrink: 0,
          marginRight: u(20),
        }}
      >
        LIVE
        <span
          style={{
            color: feedHealth === 'live' ? '#d63030' : feedHealth === 'degraded' ? T.orange : T.ink4,
            animation: feedHealth === 'live' ? 'live-pulse 1.4s ease-in-out infinite' : 'none',
            display: 'inline-block',
            lineHeight: 1,
          }}
        >
          ⏺
        </span>
      </span>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div
          style={{
            display: 'inline-flex',
            whiteSpace: 'nowrap',
            animation: 'ticker-scroll 100s linear infinite',
            willChange: 'transform',
            backfaceVisibility: 'hidden',
            WebkitFontSmoothing: 'subpixel-antialiased',
          }}
        >
          {[
            ...items.map((item, i) => renderItem(item, `a${i}`)),
            ...items.map((item, i) => renderItem(item, `b${i}`)),
          ]}
        </div>
      </div>
    </div>
  );
}

export default DesktopTicker;
