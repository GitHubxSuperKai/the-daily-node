import React from 'react';

// Import useT hook from theme context (available in build context)

function StatusDot({ ok }) {
  const T = useT();
  return <span style={{ color: ok ? T.green : T.red, marginRight: 5 }}>●</span>;
}

export default StatusDot;
