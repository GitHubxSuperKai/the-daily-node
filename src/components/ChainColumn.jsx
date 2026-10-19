import React from 'react';
import { useT } from '../theme';
import { u } from '../utils/scale.js';
import Miners from './Miners';
import { NetworkStatusWidget } from './NetworkStatusWidget';
import { ScrollHint } from './ScrollHint';

// Mining pools live in the Sidebar on desktop, so Network Status fits a 1080 canvas
// without scrolling for a small fleet; a bigger fleet scrolls behind the ScrollHint.
export function ChainColumn({ bitaxe, chain }) {
  const T = useT();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}>
      <Miners bitaxe={bitaxe} chain={chain} />
      <ScrollHint style={{ marginTop: u(32), flexShrink: 1 }}>
        <NetworkStatusWidget chain={chain} T={T} showPools={false} />
      </ScrollHint>
    </div>
  );
}

export default ChainColumn;
