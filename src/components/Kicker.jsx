import React from 'react';
import { useT } from '../theme';
import { u } from '../utils/scale.js';

function Kicker({ children, color, style = {} }) {
  const T = useT();
  return <div style={{ fontFamily: T.sans, fontSize: u(10), fontWeight: 600, letterSpacing: u(1.8), textTransform: 'uppercase', color: color || T.ink3, ...style }}>{children}</div>;
}

export default Kicker;
