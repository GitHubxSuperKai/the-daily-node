import React from 'react';

// Import useT hook from theme context (available in build context)

function Rule({ double, dash, weight = 1, style = {} }) {
  const T = useT();
  if (double) return <div style={{ borderTop: '2px solid ' + T.rule, borderBottom: '1px solid ' + T.rule, height: 5, ...style }} />;
  return <div style={{ borderTop: `${weight}px ${dash ? 'dashed' : 'solid'} ${T.rule2}`, ...style }} />;
}

export default Rule;
