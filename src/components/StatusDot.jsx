import React from 'react';

// Import useT hook from theme context (available in build context)

function StatusDot({ state }) {
  const T = useT();
  const color = state === 'fresh' ? T.green : state === 'stale' ? T.orange : T.red;
  return <span style={{ color, marginRight: 5 }}>●</span>;
}

export default StatusDot;
