import React from 'react';
import { useT } from '../theme';
import { u } from '../utils/scale.js';
import Miners from './Miners';
import { NetworkStatusWidget } from './NetworkStatusWidget';

export function ChainColumn({ bitaxe, chain }) {
  const T = useT();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}>
      <Miners bitaxe={bitaxe} chain={chain} />
      <div className="news-col-wrap" style={{ marginTop: u(32), flexShrink: 1, minHeight: 0 }}>
        <div
          className="no-scrollbar"
          style={{ height: '100%', overflowY: 'auto' }}
          onScroll={(e) => {
            const el = e.currentTarget;
            el.parentElement.classList.toggle('at-bottom', el.scrollHeight - el.scrollTop - el.clientHeight < 4);
          }}
        >
          <NetworkStatusWidget chain={chain} T={T} />
        </div>
      </div>
    </div>
  );
}

export default ChainColumn;
