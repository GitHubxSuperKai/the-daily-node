import React from 'react';

// Import useT hook from theme context (available in build context)

function Kicker({ children, color, style = {} }) {
  const T = useT();
  return <div style={{ fontFamily: T.sans, fontSize: 10, fontWeight: 600, letterSpacing: 1.8, textTransform: 'uppercase', color: color || T.ink3, ...style }}>{children}</div>;
}

export default Kicker;
