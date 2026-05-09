import React from 'react';
import { useT } from '../theme';
import Kicker from './Kicker';
import { isValidLanIp } from '../utils/ipValidation';

export function SettingsPanel({ prefs, v2prefs, miners, onRefresh, onSave, onSaveV2, onClose }) {
  const T = useT();

  // ── Miners section state ──
  const [draftNewIp, setDraftNewIp] = React.useState('');
  const [addError, setAddError]     = React.useState('');
  const [busy, setBusy]             = React.useState(false);
  const [statusText, setStatusText] = React.useState('');
  const [statusKind, setStatusKind] = React.useState('idle');

  const currentIps = React.useMemo(() => miners.map(m => m.ip), [miners]);
  const onlineByIp = React.useMemo(() => {
    const map = new Map();
    for (const x of miners) map.set(x.ip, !!x.online);
    return map;
  }, [miners]);

  const postIps = async (nextList) => {
    setBusy(true);
    setStatusKind('busy');
    setStatusText('Saving…');
    try {
      const r = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bitaxe_ips: nextList }),
      });
      const data = await r.json();
      if (!r.ok) {
        const msg = (data.errors || [data.error || 'unknown']).join('; ');
        setStatusKind('err');
        setStatusText(msg);
        return;
      }
      setStatusKind('ok');
      setStatusText('Saved (' + data.bitaxe_ips.length + ' miner' + (data.bitaxe_ips.length === 1 ? '' : 's') + ')');
      setDraftNewIp('');
      onRefresh?.();
    } catch (e) {
      setStatusKind('err');
      setStatusText('Network error: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = () => {
    const ip = draftNewIp.trim();
    setAddError('');
    if (!ip) return;
    if (!isValidLanIp(ip)) {
      setAddError('Not a private/LAN address (RFC1918 or 127.x.x.x)');
      return;
    }
    if (currentIps.includes(ip)) {
      setAddError('Already in the list');
      return;
    }
    postIps([...currentIps, ip]);
  };

  const handleRemove = (ip) => {
    if (currentIps.length === 1 && !window.confirm(
      'Remove last miner? Dashboard will keep running with 0 miners until you add one.'
    )) {
      return;
    }
    postIps(currentIps.filter(x => x !== ip));
  };

  const handleSave = () => { onClose(); };

  const inp = {
    fontFamily: T.mono, fontSize: u(13), color: T.ink, background: T.paper2,
    border: '1px solid ' + T.rule2, padding: u(8) + ' ' + u(10), outline: 'none',
    boxSizing: 'border-box', display: 'block', width: '100%',
  };
  const btnPrimary = {
    fontFamily: T.sans, fontSize: u(10), fontWeight: 700, letterSpacing: u(1.8),
    textTransform: 'uppercase', padding: u(9) + ' ' + u(22), cursor: 'pointer',
    border: 'none', background: T.ink, color: T.paper,
  };

  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 10 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0,
        width: 'min(' + u(480) + ', 100%)', background: T.paper,
        borderLeft: '1px solid ' + T.rule, display: 'flex', flexDirection: 'column',
        overflowY: 'auto', boxShadow: u(-8) + ' 0 ' + u(32) + ' rgba(0,0,0,0.14)',
      }}>
        {/* Header */}
        <div style={{ padding: u(22) + ' ' + u(28) + ' 0', flexShrink: 0 }}>
          <div style={{ borderTop: u(3) + ' solid ' + T.rule, borderBottom: '1px solid ' + T.rule, height: u(6), marginBottom: u(14) }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: T.sans, fontSize: u(9), fontWeight: 600, letterSpacing: u(3), textTransform: 'uppercase', color: T.ink3, marginBottom: u(4) }}>
                Configuration
              </div>
              <div style={{ fontFamily: T.serif, fontSize: u(26), fontWeight: 800, letterSpacing: u(-0.8), color: T.ink, lineHeight: 1 }}>
                Settings
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.mono, fontSize: u(16), color: T.ink3, padding: u(4) }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ padding: u(18) + ' ' + u(28) + ' ' + u(28), display: 'flex', flexDirection: 'column' }}>

          {/* ── MINERS (row-based) ── */}
          <Kicker>Miners</Kicker>
          <div style={{ fontFamily: T.body, fontStyle: 'italic', fontSize: u(11), color: T.ink3, marginTop: u(3), marginBottom: u(8) }}>
            Each row updates the server&apos;s polled list immediately.
          </div>

          {currentIps.length === 0 && (
            <div style={{ fontSize: u(11), color: T.ink3, marginBottom: u(6) }}>No miners configured.</div>
          )}

          {currentIps.map((ip) => {
            const online = onlineByIp.get(ip);
            const dotColor = online === true ? T.green : online === false ? T.red : T.ink3;
            const stateLabel = online === true ? 'online' : online === false ? 'offline' : 'unknown';
            return (
              <div key={ip} style={{
                display: 'flex', alignItems: 'center', gap: u(8),
                padding: u(6) + ' 0', borderBottom: '1px solid ' + T.rule3,
              }}>
                <span
                  aria-label={ip + ' ' + stateLabel}
                  title={stateLabel}
                  style={{ width: u(8), height: u(8), borderRadius: '50%', background: dotColor, flexShrink: 0 }}
                />
                <span style={{ fontFamily: T.mono, fontSize: u(13), color: T.ink, flex: 1 }}>{ip}</span>
                <button
                  onClick={() => handleRemove(ip)}
                  aria-label={'Remove ' + ip}
                  disabled={busy}
                  style={{
                    background: 'transparent', border: 'none',
                    color: T.ink3, fontSize: u(14), cursor: busy ? 'wait' : 'pointer',
                    padding: '0 ' + u(6),
                  }}
                >×</button>
              </div>
            );
          })}

          <div style={{ display: 'flex', gap: u(8), marginTop: u(10), alignItems: 'center' }}>
            <input
              aria-label="Add miner IP"
              style={{ ...inp, flex: 1, width: 'auto' }}
              value={draftNewIp}
              onChange={(e) => { setDraftNewIp(e.target.value); setAddError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="e.g. 192.168.x.y"
              spellCheck={false}
              disabled={busy}
            />
            <button
              onClick={handleAdd}
              disabled={busy || !draftNewIp.trim()}
              style={{
                fontFamily: T.sans, fontSize: u(10), fontWeight: 700,
                letterSpacing: u(1.5), textTransform: 'uppercase',
                padding: u(7) + ' ' + u(14), cursor: busy ? 'wait' : 'pointer',
                border: 'none', background: T.ink, color: T.paper,
              }}
            >Add</button>
          </div>
          {addError && (
            <div style={{ fontSize: u(11), color: T.red, marginTop: u(4) }}>{addError}</div>
          )}
          {statusText && (
            <div style={{
              fontSize: u(11), marginTop: u(4),
              color: statusKind === 'err' ? T.red : statusKind === 'ok' ? T.green : T.ink3,
            }}>{statusText}</div>
          )}
          <div style={{ marginTop: u(8) }}>
            <a href="/setup.html" style={{ fontSize: u(11), color: T.ink3, textDecoration: 'underline' }}>
              Re-run onboarding
            </a>
          </div>

          {/* placeholder for further sections — Tasks 3c, 3d, 3e */}

          <div style={{ display: 'flex', gap: u(10), marginTop: u(24), borderTop: '1px solid ' + T.rule2, paddingTop: u(18) }}>
            <button style={btnPrimary} onClick={handleSave}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
