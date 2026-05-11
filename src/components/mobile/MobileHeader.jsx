import React from 'react';
import { useT } from '../../theme.js';

function MobileHeader({ clock, dark, onToggleDark, onOpenSettings }) {
  const T = useT();
  return (
    <div style={{
      padding: '14px 16px 10px',
      borderBottom: `1px solid ${T.rule2}`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    }}>
      <div>
        <div style={{
          fontFamily: T.body, fontSize: 9, fontWeight: 500,
          letterSpacing: 2, textTransform: 'uppercase',
          color: T.ink3, marginBottom: 3,
        }}>
          Bitcoin Command Center
        </div>
        <div style={{
          fontFamily: T.serif, fontSize: 30, fontWeight: 800,
          letterSpacing: -1, lineHeight: 1,
        }}>
          The Daily Node
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
        <div style={{ fontFamily: T.num, fontSize: 11, color: T.ink3 }}>
          {clock.timeHM}{clock.amPm ? ' ' + clock.amPm : ''}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={onToggleDark}
            aria-label="Toggle dark mode"
            style={{
              fontFamily: T.sans, fontSize: 9, fontWeight: 700,
              letterSpacing: 1.5, textTransform: 'uppercase',
              padding: '4px 10px', cursor: 'pointer',
              background: dark ? T.ink : 'none',
              color: dark ? T.paper : T.ink2,
              border: `1px solid ${dark ? T.ink : T.ink3}`,
            }}
          >{dark ? '◑' : '◐'}</button>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Open settings"
            style={{
              fontFamily: T.sans, fontSize: 9, fontWeight: 700,
              letterSpacing: 1.5, textTransform: 'uppercase',
              padding: '4px 10px', cursor: 'pointer',
              background: 'none', color: T.ink2,
              border: `1px solid ${T.ink3}`,
            }}
          >⚙</button>
        </div>
      </div>
    </div>
  );
}

MobileHeader = React.memo(MobileHeader);

export { MobileHeader };
