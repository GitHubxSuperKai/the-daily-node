import React from 'react';

const NUM_PX = { hero: 64, lg: 28, md: 20, sm: 15, xs: 12 };

function Num({ size = 'md', value, unit, delta, deltaUp, style = {} }) {
  const T = useT();
  const px = NUM_PX[size];
  const unitPx = Math.max(10, Math.round(px * 0.52));
  const deltaPx = Math.max(10, Math.round(px * 0.46));
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: u(3), ...style }}>
      <span style={{
        fontFamily: T.mono, fontSize: u(px), fontWeight: 500,
        color: style.color || T.ink, letterSpacing: -0.5,
        fontFeatureSettings: '"tnum"', lineHeight: 1,
      }}>{value}</span>
      {unit && <span style={{ fontFamily: T.mono, fontSize: u(unitPx), color: T.ink3, letterSpacing: 0 }}>{unit}</span>}
      {delta && <span style={{ fontFamily: T.mono, fontSize: u(deltaPx), color: deltaUp ? T.orange : T.ink3, marginLeft: u(3) }}>
        {deltaUp ? '▲ ' : '▼ '}{delta}
      </span>}
    </span>
  );
}

export default Num;
