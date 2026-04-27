import React from 'react';

// Import useT hook from theme context (available in build context)
// Import fmtNum from formatting utilities (available in build context)
// Both imports assume they're globally available or provided via bundler

const NUM_PX = { hero: 64, lg: 28, md: 20, sm: 15, xs: 12 };

function Num({ size = 'md', value, unit, delta, deltaUp, style = {} }) {
  const T = useT();
  const px = NUM_PX[size];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3, ...style }}>
      <span style={{
        fontFamily: T.mono, fontSize: px, fontWeight: 500,
        color: style.color || T.ink, letterSpacing: -0.5,
        fontFeatureSettings: '"tnum"', lineHeight: 1,
      }}>{value}</span>
      {unit && <span style={{ fontFamily: T.mono, fontSize: Math.max(10, px * 0.52), color: T.ink3, letterSpacing: 0 }}>{unit}</span>}
      {delta && <span style={{ fontFamily: T.mono, fontSize: Math.max(10, px * 0.46), color: deltaUp ? T.orange : T.ink3, marginLeft: 3 }}>
        {deltaUp ? '▲ ' : '▼ '}{delta}
      </span>}
    </span>
  );
}

export default Num;
