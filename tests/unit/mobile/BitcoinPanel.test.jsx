import React from 'react';
globalThis.React = React;

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../../src/theme.js';
import { BitcoinPanel } from '../../../src/components/mobile/BitcoinPanel.jsx';

function wrap(ui) {
  return render(<ThemeCtx.Provider value={LIGHT}>{ui}</ThemeCtx.Provider>);
}

// jsdom normalizes hex colors to rgb() on read-back; convert for assertions
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

const btcProps = {
  data: { price: 67000, chgPct: 2.1, hi: 68000, lo: 65000, cap: 1.3e12 },
  chartPts: [],
};

const chainProps = {
  data: {
    hashrate: 800e18,
    difficulty: 95e12,
    blockTimeMs: 600000,
    mempoolBytes: 9_000_000,
    feeFast: 30,
    feeEco: 8,
    height: 900000,
    progressPercent: 71.3,
    remainingBlocks: 591,
    circulating: '19.86M BTC',
    nextHalvingDate: 'Apr 2028',
  },
  recentBlocks: [],
  mempoolBlocks: [],
};

describe('BitcoinPanel — Chain Vitals', () => {
  it('renders eco fee', () => {
    wrap(<BitcoinPanel btc={btcProps} chain={chainProps} />);
    expect(screen.getByText('8 sat/vB')).toBeDefined();
  });

  it('renders CLR blocks', () => {
    wrap(<BitcoinPanel btc={btcProps} chain={chainProps} />);
    expect(screen.getByText('9 blk')).toBeDefined();
  });

  it('CLR value is red when > 8 blocks', () => {
    const { container: _container } = wrap(<BitcoinPanel btc={btcProps} chain={chainProps} />);
    const clrEl = screen.getByText('9 blk');
    expect(clrEl.style.color).toBe(hexToRgb(LIGHT.red));
  });

  it('CLR value is green when <= 2 blocks', () => {
    // 900_000 bytes → Math.ceil(0.9) = 1 blk → green threshold (≤ 2)
    const smallMempool = { data: { ...chainProps.data, mempoolBytes: 900_000 }, recentBlocks: [], mempoolBlocks: [] };
    wrap(<BitcoinPanel btc={btcProps} chain={smallMempool} />);
    const clrEl = screen.getByText('1 blk');
    expect(clrEl.style.color).toBe(hexToRgb(LIGHT.green));
  });
});
