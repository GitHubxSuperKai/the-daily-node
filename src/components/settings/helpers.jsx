import React from 'react';

export function TweaksNumInput({ path, min, max, get, setPath, T }) {
  return (
    <input
      type="number"
      value={get(path) ?? ''}
      min={min}
      max={max}
      onChange={e => setPath(path, Number(e.target.value))}
      style={{
        width: 64, background: T.paper, color: T.ink, fontSize: 13,
        border: `1px solid ${T.ink3}`, borderRadius: 3, padding: '2px 5px',
        textAlign: 'right',
      }}
    />
  );
}

export function TweaksCheckRow({ path, label, get, setPath }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={!!get(path)}
        onChange={e => setPath(path, e.target.checked)}
        style={{ width: 14, height: 14 }}
      />
      <span style={{ fontSize: 13 }}>{label}</span>
    </label>
  );
}

export function TweaksRow({ label, children, T }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0' }}>
      <span style={{ fontSize: 12, color: T.ink2 }}>{label}</span>
      {children}
    </div>
  );
}

export function TweaksSection({ children, T }) {
  return (
    <div style={{ borderTop: `1px solid ${T.ink3}`, paddingTop: 8, marginBottom: 12 }}>
      {children}
    </div>
  );
}
