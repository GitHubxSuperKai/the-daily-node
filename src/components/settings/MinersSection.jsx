import React from 'react';
import { useT } from '../../theme';
import { u } from '../../utils/scale';
import { isValidLanIp } from '../../utils/ipValidation';

export function MinersSection({ miners, onRefresh, inp }) {
  const T = useT();

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

  return (
    <>
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
    </>
  );
}
