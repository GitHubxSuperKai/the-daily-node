import React from 'react';
globalThis.React = React;

import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../../src/theme.js';

let capturedOnHover = null;
vi.mock('../../../src/components/LineChart.jsx', () => ({
  default: (props) => {
    capturedOnHover = props.onHover;
    return <div data-testid="line-chart" />;
  },
}));

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

describe('BitcoinPanel — chart readout', () => {
  const live = { price: 81607, chgPct: -0.64, hi: 82500, lo: 80100, cap: 1.6e12, volBtc: 20000, vwap: 81000 };
  const mount = (data = live) =>
    wrap(<BitcoinPanel btc={{ data, chartPts: [] }} chain={chainProps} />);
  const hover = (p) => act(() => { capturedOnHover(p); });
  const headline = (text) => screen.getByText(text, { selector: 'span' });
  const rgb = (hex) => {
    const m = /^#(..)(..)(..)$/.exec(hex);
    return `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})`;
  };

  it('live by default', () => {
    mount();
    expect(headline('$81,607')).toBeDefined();
    expect(screen.getByText('-0.64%')).toBeDefined();
  });

  it('hover swaps headline and slot', () => {
    mount();
    hover({ t: 1, price: 80912 });
    expect(headline('$80,912')).toBeDefined();
    const slot = screen.getByText(/\+0\.86%/);
    expect(slot.textContent).toContain('▲');
    expect(slot.textContent).toContain('since');
  });

  it('downward move is red with ▼', () => {
    mount();
    hover({ t: 1, price: 82000 });
    const slot = screen.getByText(/-0\.48%/);
    expect(slot.textContent).toContain('▼');
    expect(slot.style.color).toBe(rgb(LIGHT.red));
  });

  it('onHover(null) restores live', () => {
    mount();
    hover({ t: 1, price: 80912 });
    hover(null);
    expect(headline('$81,607')).toBeDefined();
    expect(screen.getByText('-0.64%')).toBeDefined();
  });

  it('no live price shows — in the slot', () => {
    mount({ ...live, price: undefined });
    hover({ t: 1, price: 80912 });
    expect(headline('$80,912')).toBeDefined();
    const slot = screen.getByText((_, el) => el.tagName === 'SPAN' && el.textContent.startsWith('—') && el.textContent.includes('since'));
    expect(slot).toBeDefined();
  });

  it('no data and no hover shows a bare —', () => {
    mount(null);
    expect(screen.queryByText('$—')).toBeNull();
    expect(headline('—')).toBeDefined();
  });

  it('chart wrapper has a 120px height', () => {
    mount();
    expect(screen.getByTestId('line-chart').parentElement.style.height).toBe('120px');
  });
});
