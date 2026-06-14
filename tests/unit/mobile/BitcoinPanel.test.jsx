import React from 'react';
globalThis.React = React;

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../../src/theme.js';
import { BitcoinPanel } from '../../../src/components/mobile/BitcoinPanel.jsx';

function wrap(ui) {
  return render(<ThemeCtx.Provider value={LIGHT}>{ui}</ThemeCtx.Provider>);
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

describe('BitcoinPanel — Halving', () => {
  it('renders circulating supply', () => {
    wrap(<BitcoinPanel btc={btcProps} chain={chainProps} />);
    expect(screen.getByText('19.86M BTC')).toBeDefined();
  });

  it('renders next halving date', () => {
    wrap(<BitcoinPanel btc={btcProps} chain={chainProps} />);
    expect(screen.getByText('Apr 2028')).toBeDefined();
  });

  it('renders halving blocks remaining', () => {
    // height 900000 → next multiple of 210000 is 1050000 → 150000 blk remaining
    wrap(<BitcoinPanel btc={btcProps} chain={chainProps} />);
    expect(screen.getByText('150,000 blk')).toBeDefined();
  });

  it('halving section is hidden when chain.data is null', () => {
    wrap(<BitcoinPanel btc={btcProps} chain={{ data: null, recentBlocks: [], mempoolBlocks: [] }} />);
    expect(screen.queryByText('19.86M BTC')).toBeNull();
  });
});
