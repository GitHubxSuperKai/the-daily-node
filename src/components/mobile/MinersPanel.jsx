import React from 'react';
import { useT } from '../../theme.js';

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

function MinersPanel({ bitaxe }) {
  const T = useT();
  const miners = bitaxe.miners || [];
  const onlineCount = miners.filter(m => m.online).length;
  const totalHashTHs = miners.reduce((s, m) => s + (m.online && m.data ? m.data.hashRate || 0 : 0), 0) / 1000;

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
          <div style={{ fontFamily: T.mono, fontSize: 16, color: T.ink }}>
            {onlineCount}/{miners.length} online · {totalHashTHs.toFixed(2)} TH/s
          </div>
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
              return (
                <div key={m.ip} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: m.online ? T.green : T.red,
                      display: 'inline-block',
                      flexShrink: 0,
                    }} />
                    <span style={{ fontFamily: T.sans, fontSize: 14, color: T.ink }}>
                      {hostname}
                    </span>
                  </div>
                  <span style={{ fontFamily: T.mono, fontSize: 13, color: m.online ? T.ink : T.red }}>
                    {m.online
                      ? `${hashTHs} TH/s${temp != null ? `  ${temp}°C` : ''}`
                      : 'offline'
                    }
                  </span>
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
