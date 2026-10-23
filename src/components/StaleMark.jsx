import React from 'react';
import { useT } from '../theme';

// "stale · " prefix for fleet readouts. On a failed fetch useBitaxe keeps the last
// good list and sets fetchFailed; there is nothing to mark when no list was ever
// retained. Unsized (inherits its parent's font), so it is safe in the mobile tree.
export function StaleMark({ bitaxe }) {
  const T = useT();
  if (!bitaxe.fetchFailed || !(bitaxe.miners?.length > 0)) return null;
  return <span style={{ color: T.orange }}>stale · </span>;
}

export default StaleMark;
