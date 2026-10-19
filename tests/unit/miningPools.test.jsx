import React from 'react';
globalThis.React = React;

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../src/theme.js';
import { MiningPools, NetworkStatusWidget } from '../../src/components/NetworkStatusWidget.jsx';
import { CommandCenter } from '../../src/components/CommandCenter.jsx';
import { makeProps } from '../fixtures/dashboardProps.js';

const withTheme = (ui) => render(<ThemeCtx.Provider value={LIGHT}>{ui}</ThemeCtx.Provider>);

afterEach(cleanup);

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

  it('the desktop dashboard renders the pool list exactly once (in the sidebar)', () => {
    withTheme(<CommandCenter {...makeProps()} />);
    expect(screen.getAllByText(/Mining Pools/)).toHaveLength(1);
  });
});
