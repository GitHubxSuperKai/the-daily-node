import React from 'react';
import { useT } from '../theme';
import { u } from '../utils/scale.js';
import Miners from './Miners';
import { NetworkStatusWidget } from './NetworkStatusWidget';
import { ScrollHint } from './ScrollHint';

export function ChainColumn({ bitaxe, chain }) {
  const T = useT();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}>
      <Miners bitaxe={bitaxe} chain={chain} />
      <ScrollHint style={{ marginTop: u(32), flexShrink: 1 }}>
        <NetworkStatusWidget chain={chain} T={T} />
      </ScrollHint>
    </div>
  );
}

export default ChainColumn;
