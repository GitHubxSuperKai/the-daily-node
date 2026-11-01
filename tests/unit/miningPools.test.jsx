import React from 'react';

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../src/theme.js';
import { MiningPools, NetworkStatusWidget } from '../../src/components/NetworkStatusWidget.jsx';
import { CommandCenter } from '../../src/components/CommandCenter.jsx';
import { makeProps } from '../fixtures/dashboardProps.js';

const withTheme = (ui) => render(<ThemeCtx.Provider value={LIGHT}>{ui}</ThemeCtx.Provider>);

afterEach(cleanup);

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
};

describe('MiningPools', () => {
  const POOLS = [
    { name: 'Alpha', slug: 'a', sharePct: '31.0', blockCount: 310 },
    { name: 'Beta', slug: 'b', sharePct: '25.5', blockCount: 255 },
    { name: 'Gamma', slug: 'c', sharePct: '20.0', blockCount: 200 },
    { name: 'Delta', slug: 'd', sharePct: '10.0', blockCount: 101 },
  ];

  it('folds pools past the limit into one Others row', () => {
    withTheme(<MiningPools pools={POOLS} limit={2} T={LIGHT} />);
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.queryByText('Gamma')).toBeNull();
    expect(screen.getByText('Others (2)')).toBeTruthy();
    // The hidden pools' shares (20.0 + 10.0) and block counts, summed from the same rows.
    expect(screen.getByText('30.0%')).toBeTruthy();
    expect(screen.getByText('301')).toBeTruthy();
  });

  it('shows every pool and no Others row when within the limit or unlimited', () => {
    const { unmount } = withTheme(<MiningPools pools={POOLS} limit={4} T={LIGHT} />);
    expect(screen.getByText('Delta')).toBeTruthy();
    expect(screen.queryByText(/^Others/)).toBeNull();
    unmount();
    withTheme(<MiningPools pools={POOLS} T={LIGHT} />);
    expect(screen.getByText('Delta')).toBeTruthy();
    expect(screen.queryByText(/^Others/)).toBeNull();
  });

  it('shows a single pool past the limit by name instead of an Others (1) row', () => {
    withTheme(<MiningPools pools={POOLS} limit={3} T={LIGHT} />);
    expect(screen.getByText('Delta')).toBeTruthy();
    expect(screen.queryByText(/^Others/)).toBeNull();
  });

  it('never paints the Others row in the concentration-risk red', () => {
    const many = [
      { name: 'Alpha', slug: 'a', sharePct: '12.0', blockCount: 120 },
      ...Array.from({ length: 8 }, (_, i) => ({ name: `Small${i}`, slug: `s${i}`, sharePct: '11.0', blockCount: 110 })),
    ];
    withTheme(<MiningPools pools={many} limit={1} T={LIGHT} />);
    const pct = screen.getByText('88.0%');   // 8 hidden pools x 11.0, above the 40% risk line
    expect(pct.style.color.replace(/\s/g, '')).toBe(hexToRgb(LIGHT.ink));
  });

  it('paints a named pool above 40% in the concentration-risk red', () => {
    const heavy = [{ name: 'Whale', slug: 'w', sharePct: '45.0', blockCount: 450 }, ...POOLS.slice(1)];
    withTheme(<MiningPools pools={heavy} T={LIGHT} />);
    expect(screen.getByText('45.0%').style.color.replace(/\s/g, '')).toBe(hexToRgb(LIGHT.red));
    expect(screen.getByText('Concentration ⚠')).toBeTruthy();
  });

  it('renders nothing without pools', () => {
    const { container } = withTheme(<MiningPools pools={[]} limit={6} T={LIGHT} />);
    expect(container.textContent).toBe('');
  });
});

describe('Mining pools placement', () => {
  it('NetworkStatusWidget keeps the pool list by default (mobile) and drops it on request', () => {
    const { chain } = makeProps();
    const { unmount } = withTheme(<NetworkStatusWidget chain={chain} T={LIGHT} />);
    expect(screen.getAllByText(/Mining Pools/)).toHaveLength(1);
    unmount();
    withTheme(<NetworkStatusWidget chain={chain} T={LIGHT} showPools={false} />);
    expect(screen.queryByText(/Mining Pools/)).toBeNull();
  });

  it('the desktop dashboard renders the pool list exactly once (in Network Status)', () => {
    withTheme(<CommandCenter {...makeProps()} />);
    expect(screen.getAllByText(/Mining Pools/)).toHaveLength(1);
  });
});
