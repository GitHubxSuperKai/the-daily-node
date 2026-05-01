import React from 'react';
import { useT } from '../theme';

export function Masthead({ clock, wxSummary, dark, onToggleDark, onOpenSettings }) {
  const T = useT();

  const metaStyle = {
    fontFamily: T.sans,
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: T.ink3,
    lineHeight: 1.7,
  };

  const btnStyle = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: T.sans,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: T.ink3,
    padding: 0,
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ width: '100%', paddingBottom: 10 }}>
      <div style={{ borderTop: `1px solid ${T.rule}`, marginBottom: 7 }} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        gap: 24,
      }}>
        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={metaStyle}>{clock.dayStr}</div>
          <div style={metaStyle}>Home Edition · Vol. I, Nº 238</div>
          <div style={{ ...metaStyle, color: T.ink4 }}>Est. 2024 · Printed on the internet</div>
        </div>

        {/* CENTER — wordmark */}
        <div style={{ textAlign: 'center', padding: '0 40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 5 }}>
            <div style={{ flex: 1, borderTop: `1px solid ${T.rule2}` }} />
            <div style={{
              fontFamily: T.sans,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: 3.5,
              textTransform: 'uppercase',
              color: T.ink3,
              whiteSpace: 'nowrap',
            }}>Bitcoin Command Center</div>
            <div style={{ flex: 1, borderTop: `1px solid ${T.rule2}` }} />
          </div>

          <div style={{
            fontFamily: T.serif,
            fontSize: 80,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: -2.5,
            color: T.ink,
            whiteSpace: 'nowrap',
            paddingBottom: 6,
          }}>
            The Daily Node
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <div style={{ ...metaStyle, fontSize: 11 }}>
            {clock.timeHM}{clock.timeSec}{clock.amPm ? ` ${clock.amPm}` : ''}
          </div>
          <div style={metaStyle}>{wxSummary}</div>
          <div style={{ display: 'flex', gap: 18, marginTop: 5 }}>
            <button style={btnStyle} onClick={onOpenSettings}>⚙ Masthead</button>
            <button style={btnStyle} onClick={onToggleDark}>{dark ? '◑ Light' : '◐ Dark'}</button>
          </div>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${T.rule}`, marginTop: 9 }} />
    </div>
  );
}
