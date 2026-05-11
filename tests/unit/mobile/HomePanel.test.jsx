import React from 'react';
globalThis.React = React;

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../../src/theme.js';
import { HomePanel } from '../../../src/components/mobile/HomePanel.jsx';

const baseProps = {
  prefs: { tempUnit: 'fahrenheit' },
  clock: { timeHM: '10:00', amPm: 'AM', dateLong: 'Mon, May 11' },
  btc:   { data: { price: 100000, changePct: 1.5 } },
  chain: { data: { mempoolBytes: 50_000_000, fastFee: 30, blockTimeMs: 600000, height: 900000 } },
  bitaxe: {
    miners: [
      { ip: '1.1.1.1', online: true,  data: { hostname: 'a', hashRate_1m: 500e9, temp: 60 } },
      { ip: '2.2.2.2', online: false, data: null },
    ],
  },
  weather: { data: { temp: 72, wxCond: 'Clear', wxCode: 0, wxWindSpeed: 5, wxSunriseHr: 6, wxSunsetHr: 19 } },
  rss: { items: [{ hed: 'Top story', link: 'https://x', topic: '', src: 'src', t: 'just now' }] },
  feedHealth: { sources: [] },
};

function wrap(ui) {
  return render(<ThemeCtx.Provider value={LIGHT}>{ui}</ThemeCtx.Provider>);
}

describe('HomePanel', () => {
  it('renders BTC, Fleet summary, and Lead headline tiles', () => {
    wrap(<HomePanel {...baseProps} onNavigate={() => {}} />);
    expect(screen.getByText(/BTC/i)).toBeDefined();
    expect(screen.getByText(/Fleet/i)).toBeDefined();
    expect(screen.getByText('Top story')).toBeDefined();
  });

  it('fleet tile is collapsed by default, expands on click', () => {
    wrap(<HomePanel {...baseProps} onNavigate={() => {}} />);
    expect(screen.queryByTestId('fleet-row-1.1.1.1')).toBeNull();
    fireEvent.click(screen.getByTestId('fleet-tile'));
    expect(screen.getByTestId('fleet-row-1.1.1.1')).toBeDefined();
    expect(screen.getByTestId('fleet-row-2.2.2.2')).toBeDefined();
  });

  it('BTC tile click navigates to bitcoin tab', () => {
    const onNavigate = vi.fn();
    wrap(<HomePanel {...baseProps} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('btc-tile'));
    expect(onNavigate).toHaveBeenCalledWith('bitcoin');
  });

  it('Lead headline tile click navigates to news tab', () => {
    const onNavigate = vi.fn();
    wrap(<HomePanel {...baseProps} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('lead-tile'));
    expect(onNavigate).toHaveBeenCalledWith('news');
  });
});
