import React from 'react';
import { useT } from '../theme';
import { u } from '../utils/scale.js';
import Rule from './Rule';
import Kicker from './Kicker';
import Num from './Num';
import StatusDot from './StatusDot';
import { OnThisDay } from './OnThisDay';
import Weather from './Weather';

export function Sidebar({ clock, weather, prefs, sys }) {
  const T = useT();
  return (
    <div
      style={{
        borderRight: `1px solid ${T.rule2}`,
        paddingRight: u(22),
        display: 'flex',
        flexDirection: 'column',
        gap: u(18),
        overflow: 'hidden',
      }}
    >
      {/* Clock */}
      <div>
        <Kicker>Today</Kicker>
        <div style={{ marginTop: u(6) }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: u(6) }}>
            <Num size="lg" value={clock.timeHM} unit={clock.timeSec} style={{ alignItems: 'baseline' }} />
            {clock.amPm && (
              <span style={{ fontFamily: T.num, fontSize: u(16), color: T.ink2, lineHeight: 1 }}>
                {clock.amPm}
              </span>
            )}
          </div>
        </div>
        <div style={{ fontFamily: T.body, fontStyle: 'italic', fontSize: u(13), color: T.ink2, marginTop: u(4) }}>
          {clock.dayStr}
        </div>
      </div>
      <Rule dash />
      {/* On This Day */}
      <OnThisDay />
      <Rule dash />
      {/* Weather */}
      <Weather weather={weather} prefs={prefs} />
      <Rule dash />
      {/* System */}
      <div>
        <Kicker>System</Kicker>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            rowGap: u(5),
            columnGap: u(12),
            marginTop: u(8),
          }}
        >
          {sys.map((s, i) => (
            <React.Fragment key={i}>
              <span style={{ fontFamily: T.num, fontSize: u(12), color: T.ink2 }}>
                <StatusDot state={s.state} />
                {s.k}
              </span>
              <span style={{ fontFamily: T.num, fontSize: u(10), color: s.state === 'stale' ? T.orange : s.state === 'down' ? T.red : T.ink3, textAlign: 'right' }}>
                {s.d}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div
        style={{
          fontFamily: T.body,
          fontStyle: 'italic',
          fontSize: u(10),
          color: T.ink3,
          borderTop: `1px solid ${T.rule2}`,
          paddingTop: u(8),
        }}
      >
        Published from a home on the internet. Set in Playfair Display &amp; Newsreader.
      </div>
    </div>
  );
}

export default Sidebar;
