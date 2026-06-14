import React from 'react';
import { useT } from '../../theme.js';
import { calcSoloOdds, fmtNum } from '../../utils/formatting.js';

function sectionLabel(T) {
  return {
    fontFamily: T.sans,
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: T.ink3,
    marginBottom: 8,
  };
}

function MinersPanel({ bitaxe, chain }) {
  const T = useT();
  const miners = bitaxe.miners || [];
  const onlineCount = miners.filter(m => m.online).length;
  const totalHashTHs = miners.reduce((s, m) => s + (m.online && m.data ? m.data.hashRate || 0 : 0), 0) / 1000;

  const onlineMiners     = miners.filter(m => m.online && m.data);
  const totalHashrateTHS = onlineMiners.reduce((s, m) => s + ((m.data.hashRate || 0) / 1000), 0);
  const totalPower       = onlineMiners.reduce((s, m) => s + (m.data.power || 0), 0);
  const combinedEff      = totalHashrateTHS > 0 ? (totalPower / totalHashrateTHS).toFixed(1) : null;
  const soloOdds         = (chain && chain.data && totalHashrateTHS > 0)
    ? calcSoloOdds(chain.data.hashrate / 1e18, totalHashrateTHS)
    : null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      padding: '16px 16px 32px',
      fontFamily: T.sans,
    }}>

      {/* -- Fleet summary -- */}
      <section style={{ paddingBottom: 16, borderBottom: `1px solid ${T.rule2}` }}>
        <div style={sectionLabel(T)}>Fleet</div>
        {miners.length === 0 ? (
          <div style={{ fontFamily: T.sans, fontSize: 14, color: T.ink3 }}>
            No miners configured — open Settings
          </div>
        ) : (
          <>
            <div style={{ fontFamily: T.mono, fontSize: 16, color: T.ink, fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
              {onlineCount}/{miners.length} online · {totalHashTHs.toFixed(2)} TH/s
            </div>
            {combinedEff !== null && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px 12px',
                marginTop: 10,
                paddingTop: 10,
                borderTop: `0.5px solid ${T.rule2}`,
              }}>
                <div>
                  <div style={{
                    fontFamily: T.sans, fontSize: 9, fontWeight: 600,
                    letterSpacing: 1.5, textTransform: 'uppercase',
                    color: T.ink3, marginBottom: 2,
                  }}>Efficiency</div>
                  <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: T.ink, fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
                    {combinedEff} J/TH
                  </div>
                </div>
                {soloOdds && (
                  <div>
                    <div style={{
                      fontFamily: T.sans, fontSize: 9, fontWeight: 600,
                      letterSpacing: 1.5, textTransform: 'uppercase',
                      color: T.ink3, marginBottom: 2,
                    }}>Solo odds</div>
                    <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: T.ink, fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
                      1:{fmtNum(soloOdds.oddsPerDay)}/d
                    </div>
                  </div>
                )}
                {soloOdds && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{
                      fontFamily: T.sans, fontSize: 9, fontWeight: 600,
                      letterSpacing: 1.5, textTransform: 'uppercase',
                      color: T.ink3, marginBottom: 2,
                    }}>ETA</div>
                    <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: T.ink, fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
                      ~{fmtNum(soloOdds.etaYears)} yrs
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* -- Per-miner rows -- */}
      {miners.length > 0 && (
        <div>
          <div style={sectionLabel(T)}>Miners</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {miners.map(function(m) {
              const hostname = (m.data && m.data.hostname) || m.ip;
              const hashTHs = m.online && m.data ? ((m.data.hashRate || 0) / 1000).toFixed(1) : null;
              const temp = m.online && m.data ? m.data.temp : null;
              const watts = m.online && m.data && m.data.power != null ? Math.round(m.data.power) : null;
              const uptimePct = m.online && m.data && m.data.uptimeSeconds != null
                ? Math.min(99.9, (m.data.uptimeSeconds / 86400) * 100).toFixed(0)
                : null;
              const sharesAcc = m.online && m.data && m.data.sharesAccepted != null
                ? m.data.sharesAccepted
                : null;
              const sharesRej = m.online && m.data ? (m.data.sharesRejected || 0) : null;
              const hasStats = watts !== null || uptimePct !== null || sharesAcc !== null;
              return (
                <div key={m.ip} style={{
                  paddingBottom: 12,
                  borderBottom: `0.5px solid ${T.rule3}`,
                }}>
                  {/* Primary row: status + name | hash + temp */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: m.online ? T.green : T.red,
                        display: 'inline-block', flexShrink: 0,
                      }} />
                      <span style={{ fontFamily: T.sans, fontSize: 14, color: T.ink }}>
                        {hostname}
                      </span>
                    </div>
                    <span style={{
                      fontFamily: T.mono, fontSize: 13,
                      color: m.online ? T.ink : T.red,
                      fontFeatureSettings: '"tnum" 1, "lnum" 1',
                    }}>
                      {m.online
                        ? `${hashTHs} TH/s${temp != null ? `  ${temp}°C` : ''}`
                        : 'offline'
                      }
                    </span>
                  </div>
                  {/* Secondary row: power + uptime + shares (online only, when any stat available) */}
                  {m.online && hasStats && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 4, paddingLeft: 16 }}>
                      {watts !== null && (
                        <span style={{
                          fontFamily: T.mono, fontSize: 11, color: T.ink3,
                          fontFeatureSettings: '"tnum" 1, "lnum" 1',
                        }}>
                          {watts}W
                        </span>
                      )}
                      {uptimePct !== null && (
                        <span style={{
                          fontFamily: T.mono, fontSize: 11, color: T.ink3,
                          fontFeatureSettings: '"tnum" 1, "lnum" 1',
                        }}>
                          {uptimePct}% up
                        </span>
                      )}
                      {sharesAcc !== null && (
                        <span style={{
                          fontFamily: T.mono, fontSize: 11,
                          color: sharesRej > 50 ? T.red : T.ink3,
                          fontFeatureSettings: '"tnum" 1, "lnum" 1',
                        }}>
                          {sharesAcc.toLocaleString()}/{sharesRej}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}

MinersPanel = React.memo(MinersPanel);

export { MinersPanel };
