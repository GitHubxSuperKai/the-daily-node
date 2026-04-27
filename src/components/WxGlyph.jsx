import React from 'react';
import { useT } from '../theme';
import { wmoSpeed } from '../utils/formatting';
import { METEOCONS_SVG, _processSvg } from '../utils/svg';
import { DARK } from '../theme';

let _svgUid = 0;

export function WxGlyph({ kind, size, speed: speedProp }) {
  const T      = useT();
  const isDark = T.paper === DARK.paper;
  const color  = isDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.80)';
  const uid    = React.useRef(null);
  if (uid.current === null) uid.current = ++_svgUid;
  const raw = METEOCONS_SVG[kind] || METEOCONS_SVG['overcast'];
  const speed = speedProp ?? wmoSpeed(kind) ?? 2.5;
  const svg = React.useMemo(() => _processSvg(raw, uid.current, speed, size), [raw, size, speed]);
  return (
    <div style={{ width:size, height:size, color, display:'block', flexShrink:0 }}
      dangerouslySetInnerHTML={{ __html: svg }} />
  );
}
