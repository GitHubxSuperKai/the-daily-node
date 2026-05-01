import React from 'react';

export function NetworkStatusWidget({ chain, T }) {
  const latestBlock = (chain.recentBlocks || [])[0];
  const pools = chain.pools || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Network Status — 6 metrics in 2-column grid */}
      <div>
        <div style={{
          fontFamily: T.sans,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 1.8,
          textTransform: 'uppercase',
          color: T.ink3,
          marginBottom: 8
        }}>
          Network Status
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px 16px',
          paddingBottom: 8,
          borderBottom: `1px solid ${T.rule}`
        }}>
          {/* Hashrate */}
          <div>
            <div style={{
              fontFamily: T.mono,
              fontSize: 20,
              fontWeight: 700,
              color: T.ink,
              lineHeight: 1,
              fontFeatureSettings: '"tnum"'
            }}>
              {chain.data ? fmtHashrate(chain.data.hashrate) : '—'}
            </div>
            <div style={{
              fontFamily: T.sans,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: T.ink3,
              marginTop: 4
            }}>
              Hashrate
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <div style={{
              fontFamily: T.mono,
              fontSize: 20,
              fontWeight: 700,
              color: T.ink,
              lineHeight: 1,
              fontFeatureSettings: '"tnum"'
            }}>
              {chain.data ? fmtDiff(chain.data.difficulty) : '—'}
            </div>
            <div style={{
              fontFamily: T.sans,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: T.ink3,
              marginTop: 4
            }}>
              Difficulty
            </div>
          </div>

          {/* Mempool Txs */}
          <div>
            <div style={{
              fontFamily: T.mono,
              fontSize: 16,
              fontWeight: 600,
              color: T.ink,
              lineHeight: 1,
              fontFeatureSettings: '"tnum"'
            }}>
              {chain.data ? fmtNum(chain.data.mempoolTx) : '—'}
            </div>
            <div style={{
              fontFamily: T.sans,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: T.ink3,
              marginTop: 4
            }}>
              Mempool Txs
            </div>
          </div>

          {/* Mempool Size */}
          <div>
            <div style={{
              fontFamily: T.mono,
              fontSize: 16,
              fontWeight: 600,
              color: T.ink,
              lineHeight: 1,
              fontFeatureSettings: '"tnum"'
            }}>
              {chain.data ? fmtMempoolMB(chain.data.mempoolBytes) : '—'}
            </div>
            <div style={{
              fontFamily: T.sans,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: T.ink3,
              marginTop: 4
            }}>
              Mempool Size
            </div>
          </div>

          {/* Fast Fee */}
          <div>
            <div style={{
              fontFamily: T.mono,
              fontSize: 16,
              fontWeight: 600,
              color: T.orange,
              lineHeight: 1,
              fontFeatureSettings: '"tnum"'
            }}>
              {chain.data ? `${chain.data.feeFast}` : '—'} <span style={{ fontSize: 9, color: T.ink3, fontWeight: 400 }}>sat/vB</span>
            </div>
            <div style={{
              fontFamily: T.sans,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: T.ink3,
              marginTop: 4
            }}>
              Fast Fee
            </div>
          </div>

          {/* Eco Fee */}
          <div>
            <div style={{
              fontFamily: T.mono,
              fontSize: 16,
              fontWeight: 600,
              color: T.green,
              lineHeight: 1,
              fontFeatureSettings: '"tnum"'
            }}>
              {chain.data ? `${chain.data.feeEco}` : '—'} <span style={{ fontSize: 9, color: T.ink3, fontWeight: 400 }}>sat/vB</span>
            </div>
            <div style={{
              fontFamily: T.sans,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: T.ink3,
              marginTop: 4
            }}>
              Eco Fee
            </div>
          </div>
        </div>
      </div>

      {/* Latest Block */}
      {latestBlock && (
        <div>
          <div style={{
            fontFamily: T.sans,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 1.8,
            textTransform: 'uppercase',
            color: T.ink3,
            marginBottom: 6
          }}>
            Latest Block
          </div>

          <div style={{
            fontFamily: T.mono,
            fontSize: 20,
            fontWeight: 700,
            color: T.ink,
            lineHeight: 1,
            marginBottom: 8,
            fontFeatureSettings: '"tnum"'
          }}>
            #{fmtNum(latestBlock.height)}
          </div>

          {/* Block details table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Transactions */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              paddingBottom: 4,
              borderBottom: `1px solid ${T.rule3}`,
              marginBottom: 4
            }}>
              <div style={{
                fontFamily: T.sans,
                fontSize: 8,
                fontWeight: 600,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                color: T.ink3
              }}>
                Transactions
              </div>
              <div style={{
                fontFamily: T.mono,
                fontSize: 14,
                fontWeight: 600,
                color: T.ink,
                fontFeatureSettings: '"tnum"'
              }}>
                {fmtNum(latestBlock.txCount)}
              </div>
            </div>

            {/* Block Size */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              paddingBottom: 4,
              borderBottom: `1px solid ${T.rule3}`,
              marginBottom: 4
            }}>
              <div style={{
                fontFamily: T.sans,
                fontSize: 8,
                fontWeight: 600,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                color: T.ink3
              }}>
                Block Size
              </div>
              <div style={{
                fontFamily: T.mono,
                fontSize: 14,
                fontWeight: 600,
                color: T.ink,
                fontFeatureSettings: '"tnum"'
              }}>
                {fmtBlockSize(latestBlock.size)}
              </div>
            </div>

            {/* Median Fee */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              paddingBottom: 4,
              borderBottom: `1px solid ${T.rule3}`,
              marginBottom: 4
            }}>
              <div style={{
                fontFamily: T.sans,
                fontSize: 8,
                fontWeight: 600,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                color: T.ink3
              }}>
                Median Fee
              </div>
              <div style={{
                fontFamily: T.mono,
                fontSize: 14,
                fontWeight: 600,
                color: T.ink,
                fontFeatureSettings: '"tnum"'
              }}>
                {latestBlock.medianFee != null ? `${latestBlock.medianFee} sat/vB` : '—'}
              </div>
            </div>

            {/* Mined By */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline'
            }}>
              <div style={{
                fontFamily: T.sans,
                fontSize: 8,
                fontWeight: 600,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                color: T.ink3
              }}>
                Mined By
              </div>
              <div style={{
                fontFamily: T.body,
                fontSize: 13,
                fontWeight: 500,
                color: T.ink2
              }}>
                {latestBlock.poolName || '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mining Pools */}
      {pools.length > 0 && (
        <div>
          <div style={{
            fontFamily: T.sans,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 1.8,
            textTransform: 'uppercase',
            color: T.ink3,
            marginBottom: 8
          }}>
            Mining Pools · 1,008 Blocks
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {pools.map((pool, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  paddingBottom: 4,
                  borderBottom: `1px solid ${T.rule3}`,
                  marginBottom: 4
                }}
              >
                <div style={{
                  fontFamily: T.sans,
                  fontSize: 11,
                  color: T.ink2,
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {pool.name}
                </div>

                <div style={{
                  fontFamily: T.mono,
                  fontSize: 11,
                  fontWeight: 600,
                  color: T.ink,
                  marginLeft: 8,
                  fontFeatureSettings: '"tnum"'
                }}>
                  {pool.sharePct}%
                </div>

                <div style={{
                  fontFamily: T.mono,
                  fontSize: 10,
                  color: T.ink3,
                  marginLeft: 6,
                  fontFeatureSettings: '"tnum"'
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
