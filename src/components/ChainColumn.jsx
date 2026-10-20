import React from 'react';
import { useT } from '../theme';
import { u } from '../utils/scale.js';
import Miners from './Miners';
import { NetworkStatusWidget } from './NetworkStatusWidget';
import { ScrollHint } from './ScrollHint';

// Network Status includes the Mining Pools list, so at 1080 it runs past the column
// and scrolls behind the ScrollHint, whose fade and "More" cue mark the overflow.
export function ChainColumn({ bitaxe, chain }) {
  const T = useT();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}>
      <Miners bitaxe={bitaxe} chain={chain} />
      {/* 26, not 32: set when Network Status fit the column (PR #230); kept so a little more
          of it shows above the scroll hint. */}
      <ScrollHint style={{ marginTop: u(26), flexShrink: 1 }}>
        <NetworkStatusWidget chain={chain} T={T} showPools />
      </ScrollHint>
    </div>
  );
}

export default ChainColumn;
