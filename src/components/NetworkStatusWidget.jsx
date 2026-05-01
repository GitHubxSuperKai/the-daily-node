import React from 'react';

// Note: fmtNum, fmtHashrate, fmtDiff, fmtMempoolMB, fmtBlockSize, fmtBlockTime
// are available globally after build concatenation (see build.js manifest order).

/**
 * NetworkStatusWidget — redesigned Column 3 combining Chain Vitals, Latest Block,
 * and Mining Pools into a single scannable widget.
 *
 * Props:
 *   chain — result of useChain() hook:
 *     chain.data: {
 *       hashrate, difficulty, blockTimeMs, diffAdj, remainingBlocks,
 *       estimatedRetargetDate, progressPercent, height, circulating,
 *       nextHalvingDate, mempoolBytes, mempoolTx, feeFast, feeEco
 *     }
 *     chain.recentBlocks: [{ height, timestamp, txCount, size, medianFee, poolName }]
 *     chain.pools: [{ name, sharePct, blockCount }]
 *   T — theme context object (colors, font families)
 */
export function NetworkStatusWidget({ chain, T }) {
  const latestBlock = (chain.recentBlocks || [])[0];
  const pools = chain.pools || [];
  const d = chain.data;

  // Threshold colors — mempool
  const rawMempoolMB = d ? d.mempoolBytes / 1e6 : null;
  const mempoolSizeCol = rawMempoolMB == null ? T.ink
    : rawMempoolMB < 10 ? T.green
    : rawMempoolMB < 50 ? T.ink
    : T.red;
  const mempoolTxCol = d?.mempoolTx == null ? T.ink
    : d.mempoolTx < 5000 ? T.green
    : d.mempoolTx < 20000 ? T.ink
    : T.red;

  // Threshold colors — block time
  const blockTimeSec = d?.blockTimeMs ? d.blockTimeMs / 1000 : null;
  const blockTimeCol = blockTimeSec == null ? T.ink
    : blockTimeSec < 570 ? T.orange
    : blockTimeSec <= 630 ? T.green
    : T.red;

  // Difficulty retarget
  const diffAdj = d?.diffAdj;
  const diffAdjStr = diffAdj != null ? `${diffAdj >= 0 ? '+' : ''}${diffAdj.toFixed(2)}%` : '—';
  const diffAdjCol = diffAdj == null ? T.ink : diffAdj >= 0 ? T.green : T.red;
  const retargetDate = d?.estimatedRetargetDate
    ? new Date(d.estimatedRetargetDate).toISOString().slice(0, 10)
    : '—';
  const remainingBlocks = d?.remainingBlocks != null ? fmtNum(d.remainingBlocks) : '—';

  // Epoch progress
  const epochPct = d?.progressPercent;
  const epochBlocks = d && epochPct != null ? Math.round((epochPct / 100) * 2016) : null;
  const epochStr = epochPct != null ? `${epochPct.toFixed(0)}% · ${epochBlocks}/2016` : '—';

  // Chain stat rows rendered as compact key/value pairs
  const chainRows = [
    { k: 'Retarget', v: diffAdjStr, c: diffAdjCol, sub: retargetDate !== '—' ? `${remainingBlocks} blk · ${retargetDate}` : null },
    { k: 'Epoch', v: epochStr },
    { k: 'Halving', v: d?.nextHalvingDate || '—', sub: d?.nextHalvingBlocks != null ? `${fmtNum(d.nextHalvingBlocks)} blk` : null },
    { k: 'Block time', v: d ? fmtBlockTime(d.blockTimeMs) : '—', c: blockTimeCol },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Network Status — 6 metrics in 2-column grid ── */}
      <div>
        <div style={{
          fontFamily: T.sans, fontSize: 10, fontWeight: 600,
          letterSpacing: 1.8, textTransform: 'uppercase', color: T.ink3, marginBottom: 8
        }}>
          Network Status
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px',
          paddingBottom: 8, borderBottom: `1px solid ${T.rule}`
        }}>
          {[
            { label: 'Hashrate',    val: d ? fmtHashrate(d.hashrate) : '—',      size: 20, color: T.ink },
            { label: 'Difficulty',  val: d ? fmtDiff(d.difficulty) : '—',         size: 20, color: T.ink },
            { label: 'Mempool Txs', val: d ? fmtNum(d.mempoolTx) : '—',           size: 16, color: mempoolTxCol },
            { label: 'Mempool Size',val: d ? fmtMempoolMB(d.mempoolBytes) : '—',  size: 16, color: mempoolSizeCol },
            { label: 'Fast Fee',    val: d ? `${d.feeFast} sat/vB` : '—',         size: 16, color: T.orange },
            { label: 'Eco Fee',     val: d ? `${d.feeEco} sat/vB` : '—',          size: 16, color: T.green },
          ].map(({ label, val, size, color }) => (
            <div key={label}>
              <div style={{
                fontFamily: T.mono, fontSize: size, fontWeight: size === 20 ? 700 : 600,
                color, lineHeight: 1, fontFeatureSettings: '"tnum"'
              }}>
                {val}
              </div>
              <div style={{
                fontFamily: T.sans, fontSize: 9, fontWeight: 600,
                letterSpacing: 1.2, textTransform: 'uppercase', color: T.ink3, marginTop: 4
              }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Chain Stats — retarget, epoch, halving, block time ── */}
      {d && (
        <div>
          <div style={{
            fontFamily: T.sans, fontSize: 10, fontWeight: 600,
            letterSpacing: 1.8, textTransform: 'uppercase', color: T.ink3, marginBottom: 6
          }}>
            Chain
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {chainRows.map(({ k, v, c, sub }, i) => (
              <div key={k} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                paddingBottom: 4, borderBottom: `1px solid ${T.rule3}`, marginBottom: 4
              }}>
                <div style={{
                  fontFamily: T.sans, fontSize: 8, fontWeight: 600,
                  letterSpacing: 1.2, textTransform: 'uppercase', color: T.ink3
                }}>
                  {k}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontFamily: T.mono, fontSize: 12, fontWeight: 600,
                    color: c || T.ink, fontFeatureSettings: '"tnum"'
                  }}>
                    {v}
                  </div>
                  {sub && (
                    <div style={{ fontFamily: T.mono, fontSize: 9, color: T.ink4, marginTop: 1 }}>
                      {sub}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Latest Block ── */}
      {latestBlock && (
        <div>
          <div style={{
            fontFamily: T.sans, fontSize: 10, fontWeight: 600,
            letterSpacing: 1.8, textTransform: 'uppercase', color: T.ink3, marginBottom: 6
          }}>
            Latest Block
          </div>

          <div style={{
            fontFamily: T.mono, fontSize: 20, fontWeight: 700, color: T.ink,
            lineHeight: 1, marginBottom: 8, fontFeatureSettings: '"tnum"'
          }}>
            #{fmtNum(latestBlock.height)}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              { label: 'Transactions', val: fmtNum(latestBlock.txCount) },
              { label: 'Block Size',   val: fmtBlockSize(latestBlock.size) },
              { label: 'Median Fee',   val: latestBlock.medianFee != null ? `${latestBlock.medianFee} sat/vB` : '—' },
            ].map(({ label, val }) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                paddingBottom: 4, borderBottom: `1px solid ${T.rule3}`, marginBottom: 4
              }}>
                <div style={{
                  fontFamily: T.sans, fontSize: 8, fontWeight: 600,
                  letterSpacing: 1.2, textTransform: 'uppercase', color: T.ink3
                }}>
                  {label}
                </div>
                <div style={{
                  fontFamily: T.mono, fontSize: 14, fontWeight: 600,
                  color: T.ink, fontFeatureSettings: '"tnum"'
                }}>
                  {val}
                </div>
              </div>
            ))}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'
            }}>
              <div style={{
                fontFamily: T.sans, fontSize: 8, fontWeight: 600,
                letterSpacing: 1.2, textTransform: 'uppercase', color: T.ink3
              }}>
                Mined By
              </div>
              <div style={{ fontFamily: T.body, fontSize: 13, fontWeight: 500, color: T.ink2 }}>
                {latestBlock.poolName || '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Mining Pools — 1,008 blocks ≈ 7 days at 10-min blocks ── */}
      {pools.length > 0 && (
        <div>
          <div style={{
            fontFamily: T.sans, fontSize: 10, fontWeight: 600,
            letterSpacing: 1.8, textTransform: 'uppercase', color: T.ink3, marginBottom: 8
          }}>
            Mining Pools · 1,008 Blocks
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {pools.map((pool, idx) => (
              <div key={idx} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                paddingBottom: 4, borderBottom: `1px solid ${T.rule3}`, marginBottom: 4
              }}>
                <div style={{
                  fontFamily: T.sans, fontSize: 11, color: T.ink2,
                  flex: 1, minWidth: 0, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {pool.name}
                </div>
                <div style={{
                  fontFamily: T.mono, fontSize: 11, fontWeight: 600,
                  color: T.ink, marginLeft: 8, fontFeatureSettings: '"tnum"'
                }}>
                  {pool.sharePct}%
                </div>
                <div style={{
                  fontFamily: T.mono, fontSize: 10, color: T.ink3,
                  marginLeft: 6, fontFeatureSettings: '"tnum"'
                }}>
                  {fmtNum(pool.blockCount || 0)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
