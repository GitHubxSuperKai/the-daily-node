import React from 'react';
import { useT } from '../theme';
import { u } from '../utils/scale.js';

const NUM_PX = { hero: 64, lg: 28, md: 20, sm: 15, xs: 12 };

function Num({ size = 'md', value, unit, delta, deltaUp, style = {} }) {
  const T = useT();
  const px = NUM_PX[size];
  const unitPx = Math.max(10, Math.round(px * 0.52));
  const deltaPx = Math.max(10, Math.round(px * 0.46));
  const isHero = size === 'hero';
  const numFont = isHero ? T.numDisplay : T.num;
  const numWeight = isHero ? 700 : 400;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: u(3), ...style }}>
      <span style={{
        fontFamily: numFont, fontSize: u(px), fontWeight: numWeight,
        color: style.color || T.ink, letterSpacing: isHero ? -1 : -0.5,
        fontFeatureSettings: '"tnum" 1, "lnum" 1', fontOpticalSizing: 'auto', lineHeight: 1,
      }}>{value}</span>
      {unit && <span style={{ fontFamily: T.num, fontSize: u(unitPx), color: T.ink3, letterSpacing: 0, fontOpticalSizing: 'auto' }}>{unit}</span>}
      {delta && <span style={{ fontFamily: T.num, fontSize: u(deltaPx), color: deltaUp ? T.orange : T.ink3, marginLeft: u(3) }}>
        {deltaUp ? '▲ ' : '▼ '}{delta}
      </span>}
    </span>
  );
}

export default Num;
