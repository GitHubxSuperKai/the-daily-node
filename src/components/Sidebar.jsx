import React from 'react';
import { useT } from '../theme';
import { u } from '../utils/scale.js';
import Rule from './Rule';
import Kicker from './Kicker';
import Num from './Num';
import StatusDot from './StatusDot';
import { OnThisDay } from './OnThisDay';
import Weather from './Weather';
import { MiningPools } from './NetworkStatusWidget';
import { ScrollHint } from './ScrollHint';
import { fitPoolLimit } from '../utils/poolLimit.js';

// Measures the pools region and the rendered list, and returns the MiningPools
// limit that fits (see fitPoolLimit). The region's height comes from flex, not from
// its content, so a new limit doesn't change what is measured next time.
function usePoolLimit(ref, count) {
  const [limit, setLimit] = React.useState(6);
  const measure = React.useCallback(() => {
    const region = ref.current;
    const list = region && region.querySelector('[data-pool-list]');
    const row = list && list.querySelector('[data-pool-row]');
    if (!row) return;
    const rowRect = row.getBoundingClientRect();
    const next = fitPoolLimit({
      regionPx: region.getBoundingClientRect().height,
      headerPx: rowRect.top - list.getBoundingClientRect().top,
      rowPx: rowRect.height,
      count,
    });
    setLimit(prev => (prev === next ? prev : next));
  }, [ref, count]);

  React.useLayoutEffect(() => {
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    // The list is observed too, so a late web-font load that changes the row
    // height re-measures. A new limit resizes the list but measures the same.
    const ro = new ResizeObserver(measure);
    ro.observe(ref.current);
    const list = ref.current.querySelector('[data-pool-list]');
    if (list) ro.observe(list);
    return () => ro.disconnect();
  }, [ref, measure]);
  return limit;
}

export function Sidebar({ clock, weather, prefs, sys, pools }) {
  const T = useT();
  const poolsRef = React.useRef(null);
  const poolLimit = usePoolLimit(poolsRef, pools ? pools.length : 0);
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
      {/* Mining pools moved here from the chain column so Network Status fits at 1080.
          The region takes the rail's spare height, and the list names as many pools
          as fit in it (the rest fold into "Others"), so On This Day dates don't push
          rows behind the scroll hint. */}
      <div ref={poolsRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ScrollHint style={{ flex: 1 }}>
          <MiningPools pools={pools} limit={poolLimit} T={T} />
        </ScrollHint>
      </div>
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
