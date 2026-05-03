import React from 'react';

function SubLabel({ children, right, alert, rightColor, noBorder, T }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      paddingBottom: u(6), marginBottom: u(6), ...(!noBorder && { borderBottom: `1px solid ${T.rule3}` }),
    }}>
      <div style={{
        fontFamily: T.sans, fontSize: u(9), fontWeight: 600,
        letterSpacing: u(1.4), textTransform: 'uppercase', color: T.ink3,
      }}>
        {children}
      </div>
      {right && (
        <div style={{
          fontFamily: T.num, fontSize: u(13), fontWeight: 400,
          color: rightColor || (alert ? T.red : T.green),
        }}>
          {right}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, valueColor, valueAlt, last, T }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      paddingBottom: last ? 0 : u(6),
      borderBottom: last ? 'none' : `1px solid ${T.rule3}`,
    }}>
      <div style={{
        fontFamily: T.sans, fontSize: u(9), fontWeight: 600,
        letterSpacing: u(1.2), textTransform: 'uppercase', color: T.ink3,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: u(6) }}>
        {valueAlt && (
          <div style={{
            fontFamily: T.num, fontSize: u(9), fontWeight: 400,
            color: T.ink4, fontFeatureSettings: '"tnum" 1, "lnum" 1',
          }}>
            {valueAlt}
          </div>
        )}
        <div style={{
          fontFamily: T.num, fontSize: u(13), fontWeight: 400,
          color: valueColor || T.ink, fontFeatureSettings: '"tnum" 1, "lnum" 1',
        }}>
          {value}
        </div>
      </div>
    </div>
  );
}

export function NetworkStatusWidget({ chain, T }) {
  const latestBlock = (chain.recentBlocks || [])[0];
  const pools = chain.pools || [];
  const d = chain.data;

  const halvings = Math.floor((d?.height || 0) / 210000);
  const halvingBlocks = (halvings + 1) * 210000 - (d?.height || 0);
  const blockSubsidy = 50 / Math.pow(2, halvings);

  const blockIntervalMin = d?.blockTimeMs ? (d.blockTimeMs / 60000).toFixed(1) : '—';
  const bMinRaw = d ? d.blockTimeMs / 60000 : 10;
  const blockIntervalCol = !d ? T.ink
    : bMinRaw < 9.9 ? T.green
    : bMinRaw > 10.1 ? T.red
    : T.ink;

  const diffAdj = d?.diffAdj;
  const diffAdjStr = diffAdj != null ? `${diffAdj >= 0 ? '+' : ''}${diffAdj.toFixed(2)}% est.` : '—';
  const diffAdjCol = diffAdj == null ? T.ink3 : diffAdj > 0 ? T.green : diffAdj < 0 ? T.red : T.ink;
  const diffAdjPct = d?.progressPercent || 0;
  const remainingBlocks = d?.remainingBlocks ?? 0;
  const remainingDays = Math.round(remainingBlocks * 10 / 60 / 24);
  const projectedRetargetDateStr = remainingBlocks > 0
    ? new Date(Date.now() + remainingBlocks * 10 * 60 * 1000).toISOString().slice(0, 10)
    : null;
  const prevDiffAdj = d?.previousDiffAdj;
  const prevDiffAdjStr = prevDiffAdj != null ? `${prevDiffAdj >= 0 ? '+' : ''}${prevDiffAdj.toFixed(2)}%` : '—';
  const prevDiffAdjCol = prevDiffAdj == null ? T.ink4 : prevDiffAdj > 0 ? T.green : prevDiffAdj < 0 ? T.red : T.ink4;
  const prevRetargetDateStr = d?.previousRetargetDate != null
    ? new Date(d.previousRetargetDate * 1000).toISOString().slice(0, 10)
    : null;

  const halvingYrs = (halvingBlocks * 10 / 60 / 24 / 365).toFixed(1);

  const mempoolMBRaw = d ? d.mempoolBytes / 1e6 : null;
  const mempoolLabel = mempoolMBRaw == null ? '—'
    : mempoolMBRaw < 50 ? 'Clear' : mempoolMBRaw < 200 ? 'Moderate' : 'Congested';
  const mempoolColor = mempoolMBRaw == null ? T.ink
    : mempoolMBRaw < 50 ? T.green : mempoolMBRaw < 200 ? T.ink : T.red;
  const feeLow  = d?.feeEco  != null ? `${d.feeEco}`  : '—';
  const feeMid  = d?.feeMid  != null ? `${d.feeMid}`  : '—';
  const feeFast = d?.feeFast != null ? `${d.feeFast}` : '—';

  const blockAge = latestBlock?.timestamp
    ? `${Math.round((Date.now() / 1000 - latestBlock.timestamp) / 60)}m ago`
    : '—';
  const blockWeight = latestBlock?.weight != null
    ? `${(latestBlock.weight / 1e6).toFixed(2)} MWU` : '—';
  const feeSpan = latestBlock?.feeRange?.length >= 2
    ? `${Math.round(latestBlock.feeRange[0])} – ${Math.round(latestBlock.feeRange[latestBlock.feeRange.length - 1])} sat/vB`
    : '—';
  const totalFees = latestBlock?.totalFees != null
    ? `${(latestBlock.totalFees / 1e8).toFixed(4)} BTC` : '—';

  const topPool = pools[0];
  const poolRisk = topPool && parseFloat(topPool.sharePct) > 40;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Masthead */}
      <div style={{
        borderTop: `${u(3)} solid ${T.ink}`, borderBottom: `1px solid ${T.ink}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        padding: `${u(5)} 0`, marginBottom: u(16),
      }}>
        <span style={{
          fontFamily: T.sans, fontSize: u(10), fontWeight: 700,
          letterSpacing: u(2), textTransform: 'uppercase', color: T.ink, whiteSpace: 'nowrap',
        }}>
          Network Status
        </span>
      </div>

      {/* Headline stats 3×2 */}
      <div style={{ marginBottom: u(20) }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: `${u(12)} ${u(10)}` }}>
          {[
            { val: d ? fmtHashrate(d.hashrate) : '—', label: 'Hashrate',      size: 22, color: T.ink },
            { val: `${blockIntervalMin}m`,              label: 'Block Interval', size: 16, color: blockIntervalCol },
            { val: `${halvingBlocks.toLocaleString()} blks`, label: 'Halving', size: 16, color: T.ink, sub: `~${halvingYrs}yr` },
            { val: d ? fmtDiff(d.difficulty)   : '—', label: 'Difficulty',    size: 22, color: T.ink },
            { val: `${blockSubsidy} BTC`,               label: 'Block Reward', size: 16, color: T.ink },
            { val: `${Number((blockSubsidy / 2).toFixed(8))} BTC`, label: 'Next Reward', size: 16, color: T.ink4 },
          ].map(({ val, label, size, color, sub }, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{
                fontFamily: T.num, fontSize: u(size), fontWeight: 400,
                color, lineHeight: 1, fontFeatureSettings: '"tnum" 1, "lnum" 1',
              }}>
                {val}
              </div>
              <div style={{
                display: 'flex', alignItems: 'baseline', gap: u(5),
              }}>
                <span style={{
                  fontFamily: T.sans, fontSize: u(9), fontWeight: 600,
                  letterSpacing: u(1.2), textTransform: 'uppercase', color: T.ink3,
                }}>
                  {label}
                </span>
                {sub && (
                  <span style={{
                    fontFamily: T.num, fontSize: u(9), color: T.ink4,
                    fontFeatureSettings: '"tnum" 1, "lnum" 1',
                  }}>
                    {sub}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Difficulty Adjustment */}
      <div style={{ marginBottom: u(20), paddingTop: u(12), borderTop: `1px solid ${T.rule3}` }}>
        <SubLabel right={diffAdjStr} rightColor={diffAdjCol} noBorder T={T}>
          Difficulty Adjustment
        </SubLabel>
        <div style={{ height: u(6), background: T.rule3, marginBottom: u(5), position: 'relative' }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, height: '100%',
            width: `${Math.min(100, diffAdjPct)}%`, background: T.orange,
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: T.num, fontSize: u(10), color: T.ink3, fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
            {fmtNum(remainingBlocks)} blocks remaining
            {projectedRetargetDateStr && (
              <span style={{ fontFamily: T.num, fontSize: u(9), color: T.ink4 }}> ~ {projectedRetargetDateStr}</span>
            )}
          </div>
          <div style={{ fontFamily: T.num, fontSize: u(10), color: T.ink4, fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
            ~{remainingDays}d
          </div>
        </div>
        <div style={{ marginTop: u(8), display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontFamily: T.num, fontSize: u(10), color: T.ink3, fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
            Previous Adjustment
            {prevRetargetDateStr && (
              <span style={{ fontFamily: T.num, fontSize: u(9), color: T.ink4 }}>: {prevRetargetDateStr}</span>
            )}
          </div>
          <div style={{
            fontFamily: T.num, fontSize: u(10), fontWeight: 400,
            color: prevDiffAdjCol, fontFeatureSettings: '"tnum" 1, "lnum" 1',
          }}>
            {prevDiffAdjStr}
          </div>
        </div>
      </div>

      {/* Mempool */}
      <div style={{ marginBottom: u(20), paddingTop: u(12), borderTop: `1px solid ${T.rule3}` }}>
        <SubLabel right={mempoolLabel} rightColor={mempoolColor} T={T}>
          Mempool
        </SubLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: u(5) }}>
          <Row label="Pending Txs" value={d ? fmtNum(d.mempoolTx) : '—'} T={T} />
          <Row label="Size" value={d ? `${(d.mempoolBytes / 1e6).toFixed(1)} MB` : '—'} T={T} />
          <Row
            label="Low · Mid · Fast"
            value={`${feeLow} · ${feeMid} · ${feeFast} sat/vB`}
            T={T}
            last
          />
        </div>
      </div>

      {/* Latest Block */}
      <div style={{ marginBottom: u(20), paddingTop: u(12), borderTop: `1px solid ${T.rule3}` }}>
        <SubLabel right={blockAge} rightColor={T.ink3} T={T}>
          Latest Block
        </SubLabel>
        {latestBlock ? (
          <>
            <div style={{
              fontFamily: T.num, fontSize: u(24), fontWeight: 400,
              color: T.ink, lineHeight: 1, marginBottom: u(8), fontFeatureSettings: '"tnum" 1, "lnum" 1',
            }}>
              #{fmtNum(latestBlock.height)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: u(5) }}>
              <Row label="Transactions" value={fmtNum(latestBlock.txCount)} T={T} />
              <Row label="Block Weight" value={blockWeight} T={T} />
              <Row label="Block Size"   value={fmtBlockSize(latestBlock.size)} T={T} />
              <Row label="Fee Span"     value={feeSpan} T={T} />
              <Row label="Median Fee"   value={latestBlock.medianFee != null ? `${latestBlock.medianFee} sat/vB` : '—'} T={T} />
              <Row label="Total Fees"   value={totalFees} T={T} />
              <Row label="Mined By"     value={latestBlock.poolName || '—'} T={T} last />
            </div>
          </>
        ) : (
          <div style={{ fontFamily: T.num, fontSize: u(14), color: T.ink4 }}>—</div>
        )}
      </div>

      {/* Mining Pools */}
      {pools.length > 0 && (
        <div style={{ paddingTop: u(12), borderTop: `1px solid ${T.rule3}` }}>
          <SubLabel
            right={poolRisk ? 'Concentration ⚠' : null}
            alert={poolRisk}
            T={T}
          >
            Mining Pools · 1,008 Blocks
          </SubLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {pools.map((pool, i) => {
              const share = parseFloat(pool.sharePct);
              const isRisk = share > 40;
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: `${u(5)} 0`,
                  borderBottom: i < pools.length - 1 ? `1px solid ${T.rule3}` : 'none',
                }}>
                  <div style={{
                    fontFamily: T.sans, fontSize: u(12), fontWeight: 400, color: T.ink2,
                    width: u(72), flexShrink: 0, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {pool.name}
                  </div>
                  <div style={{
                    flex: 1, height: u(2), background: T.rule3, margin: `0 ${u(8)}`, position: 'relative',
                  }}>
                    <div style={{
                      position: 'absolute', left: 0, top: 0, height: '100%',
                      width: `${share}%`, background: isRisk ? T.red : T.ink3,
                    }} />
                  </div>
                  <div style={{
                    fontFamily: T.num, fontSize: u(12), fontWeight: 400,
                    color: isRisk ? T.red : T.ink, fontFeatureSettings: '"tnum" 1, "lnum" 1',
                    width: u(38), textAlign: 'right', flexShrink: 0,
                  }}>
                    {pool.sharePct}%
                  </div>
                  <div style={{
                    fontFamily: T.num, fontSize: u(11), color: T.ink3,
                    width: u(28), textAlign: 'right', flexShrink: 0, fontFeatureSettings: '"tnum" 1, "lnum" 1',
                  }}>
                    {fmtNum(pool.blockCount || 0)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
