import React from 'react';
globalThis.React = React;

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../../src/theme.js';
import { MobileApp } from '../../../src/components/mobile/MobileApp.jsx';

const baseProps = {
  prefs: { tempUnit: 'fahrenheit' },
  v2prefs: {},
  clock: { timeHM: '10:00', amPm: 'AM', dateLong: 'Mon, May 11' },
  btc:   { data: { price: 100000, changePct: 1.5, hi: 1, lo: 1, cap: '1T', vwap: 0 }, chartPts: [] },
  chain: { data: { mempoolBytes: 50_000_000, fastFee: 30, blockTimeMs: 600000, height: 900000, hashrate: 0, difficulty: 0 } },
  bitaxe: { miners: [] },
  weather: { data: null },
  rss: { items: [{ hed: 'Top story', link: 'https://x', src: 'src', t: 'just now', topic: '', cat: 'BTC' }] },
  feedHealth: { sources: [] },
  dark: false,
  onToggleDark: () => {},
  onOpenSettings: () => {},
};

function wrap(ui) {
  return render(<ThemeCtx.Provider value={LIGHT}>{ui}</ThemeCtx.Provider>);
}

describe('MobileApp', () => {
  it('starts on Home tab', () => {
    wrap(<MobileApp {...baseProps} />);
    expect(screen.getByText(/BTC \/ USD/i)).toBeDefined();
  });

  it('switches to Bitcoin panel when Bitcoin tab clicked', () => {
    wrap(<MobileApp {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /bitcoin/i }));
    expect(screen.getByText(/Field Report/i)).toBeDefined();
  });

  it('switches to News panel when News tab clicked', () => {
    wrap(<MobileApp {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /^news$/i }));
    expect(screen.getByText('Top story')).toBeDefined();
  });

  it('HomePanel tile-click navigates to bitcoin tab', () => {
    wrap(<MobileApp {...baseProps} />);
    fireEvent.click(screen.getByTestId('btc-tile'));
    expect(screen.getByText(/Field Report/i)).toBeDefined();
  });
});
