import React from 'react';
import { useT } from '../theme';

function StatusDot({ state }) {
  const T = useT();
  const color = state === 'fresh' ? T.green : state === 'stale' ? T.orange : T.red;
  return <span style={{ color, marginRight: 5 }}>●</span>;
}

export default StatusDot;
