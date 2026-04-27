import React from 'react';
import { useT } from '../theme';

/**
 * Masthead — Top header bar
 * Shows date, time, weather summary, and theme toggle buttons
 *
 * Props:
 *   - clock: { dayStr, timeHM, timeSec, amPm }
 *   - wxSummary: string (e.g., "72°F partly cloudy")
 *   - dark: boolean
 *   - onToggleDark: () => void
 *   - onOpenSettings: () => void
 */
export function Masthead({ clock, wxSummary, dark, onToggleDark, onOpenSettings }) {
  const T = useT();

  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr auto',
        alignItems: 'center',
        paddingBottom: 8,
        fontFamily: T.sans,
        fontSize: 10,
        letterSpacing: 2,
        textTransform: 'uppercase',
        color: T.ink3,
        width: '100%',
      }}>
        <span style={{ whiteSpace: 'nowrap' }}>{clock.dayStr}</span>
        <span style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
          Home Edition · Vol. I, Nº 238
        </span>
        <span style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
          {clock.timeHM}
          {clock.timeSec}
          {clock.amPm ? ` ${clock.amPm}` : ''} · {wxSummary}
        </span>
        <div style={{ display: 'flex', gap: 16, marginLeft: 20 }}>
          <button
            onClick={onOpenSettings}
            style={{
              fontFamily: T.sans,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              padding: '4px 12px',
              cursor: 'pointer',
              border: 'none',
              background: T.paper2,
              color: T.ink,
            }}
          >
            ⚙ Masthead
          </button>
          <button
            onClick={onToggleDark}
            style={{
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
            }}
          >
            {dark ? '◑ Light' : '◐ Dark'}
          </button>
        </div>
      </div>
    </>
  );
}
