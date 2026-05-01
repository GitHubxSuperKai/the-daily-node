import React from 'react';
import { useT } from '../theme';
import Kicker from './Kicker';

export function ProofOfRead({ btc, chain, hashrate, mempoolTx, mempoolMB, feeFast, feeEco, btcPrice, btcLo, btcHi }) {
  const T = useT();

  const btcUp = btc.data ? btc.data.chgPct >= 0 : true;
  const bullets = [
    btc.data
      ? `Bitcoin is trading at ${btcPrice}, ${btcUp ? 'up' : 'down'} ${Math.abs(btc.data.chgPct).toFixed(2)}% from yesterday's open. Day range: $${btcLo}-$${btcHi}.`
      : 'Fetching price data...',
    chain.data
      ? `Network hashrate at ${hashrate}. Mempool holds ${mempoolTx} txs (${mempoolMB}), clearing at ${feeFast} fast / ${feeEco} eco. Next halving ${chain.data.nextHalvingDate}.`
      : 'Fetching chain data...',
  ];

  return (
    <div style={{ paddingBottom: 10, borderBottom: `1px solid ${T.rule2}`, marginBottom: 2 }}>
      <Kicker>Proof of Read</Kicker>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {bullets.map((bullet, i) => (
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
