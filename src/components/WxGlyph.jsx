import React from 'react';
import { useT } from '../theme';
import { u } from '../utils/scale.js';
import { wmoSpeed } from '../utils/formatting';
import { METEOCONS_SVG, _processSvg } from '../utils/svg';
import { DARK } from '../theme';

export function WxGlyph({ kind, size, speed: speedProp }) {
  const T      = useT();
  const isDark = T.paper === DARK.paper;
  const color  = isDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.80)';
  const uid    = React.useRef(null);
  if (uid.current === null) uid.current = ++_svgUid;
  const raw = METEOCONS_SVG[kind] || METEOCONS_SVG['overcast'];
  const speed = speedProp ?? wmoSpeed(kind) ?? 2.5;
  const svg = React.useMemo(() => _processSvg(raw, uid.current, speed, size), [raw, size, speed]);
  // Outer div uses --u to set visual size; inner div scales the fixed-px SVG via --u-scale
  return (
    <div style={{ width: u(size), height: u(size), color, display: 'block', flexShrink: 0, overflow: 'hidden' }}>
      <div style={{ width: size, height: size, transformOrigin: '0 0', transform: 'scale(var(--u-scale))' }}
        dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
