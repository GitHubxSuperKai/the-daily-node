import React from 'react';
import { useT } from '../theme';
import Kicker from './Kicker';

export function ProofOfRead({ btc, chain, hashrate, mempoolTx, mempoolMB, feeFast, feeEco, btcPrice, btcLo, btcHi }) {
  const T = useT();

  let priceBullet, chainBullet;

  if (btc.data) {
    const { chgPct, price, hi, lo } = btc.data;
    const abs = Math.abs(chgPct);
    const dir = chgPct >= 0 ? 'up' : 'down';
    const mag = abs >= 5 ? 'sharply ' : abs >= 2 ? 'notably ' : '';
    const range = hi - lo;
    const rangeNote = range > 0
      ? price >= hi - range * 0.15 ? ', near session highs'
      : price <= lo + range * 0.15 ? ', near session lows'
      : ''
      : '';
    priceBullet = abs < 0.5
      ? `Bitcoin is nearly flat on the day at ${btcPrice}. Day range: $${btcLo}–$${btcHi}.`
      : `Bitcoin is ${mag}${dir} ${abs.toFixed(2)}% at ${btcPrice}${rangeNote}. Day range: $${btcLo}–$${btcHi}.`;
  } else {
    priceBullet = 'Fetching price data…';
  }

  if (chain.data) {
    const { feeFast: rawFee, diffAdj, remainingBlocks, estimatedRetargetDate, height, nextHalvingDate } = chain.data;
    const feeLabel = rawFee < 5  ? 'Fee market is quiet'
      : rawFee < 20 ? 'Fees are moderate'
      : rawFee < 50 ? 'Fees are elevated'
      : 'Network is congested — fees are high';
    const halvingBlocksLeft = typeof height === 'number'
      ? Math.ceil((height + 1) / 210000) * 210000 - height
      : Infinity;
    const dateLabel = halvingBlocksLeft < remainingBlocks
      ? `Next halving ${nextHalvingDate}.`
      : estimatedRetargetDate
        ? `Next difficulty retarget ~${new Date(estimatedRetargetDate).toISOString().slice(0, 10)}.`
        : 'Next difficulty retarget: date unavailable.';
    const diffNote = diffAdj != null && Math.abs(diffAdj) >= 3
      ? ` Retarget tracking ${diffAdj >= 0 ? '+' : ''}${diffAdj.toFixed(1)}%.`
      : '';
    chainBullet = `Network hashrate at ${hashrate}. ${feeLabel} (${feeFast} fast / ${feeEco} eco); mempool holds ${mempoolTx} txs (${mempoolMB}). ${dateLabel}${diffNote}`;
  } else {
    chainBullet = 'Fetching chain data…';
  }

  return (
    <div style={{ paddingBottom: 10, borderBottom: `1px solid ${T.rule2}`, marginBottom: 2 }}>
      <Kicker>Proof of Read</Kicker>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[priceBullet, chainBullet].map((bullet, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.orange, marginTop: 3, flexShrink: 0 }}>&#9670;</span>
            <div style={{ fontFamily: T.body, fontSize: 13, lineHeight: 1.5, color: T.ink2 }}>{bullet}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProofOfRead;
