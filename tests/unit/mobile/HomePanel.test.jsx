import React from 'react';
globalThis.React = React;

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../../src/theme.js';
import { HomePanel } from '../../../src/components/mobile/HomePanel.jsx';

const baseProps = {
  prefs: { tempUnit: 'fahrenheit' },
  clock: { timeHM: '10:00', amPm: 'AM', dayStr: 'Monday, May 11' },
  btc:   { data: { price: 100000, chgPct: 1.5 }, err: null },
  chain: { data: { mempoolBytes: 50_000_000, feeFast: 30, blockTimeMs: 600000, height: 900000 }, err: null },
  bitaxe: {
    err: null,
    miners: [
      { ip: '1.1.1.1', online: true,  data: { hostname: 'a', hashRate: 500, temp: 60 } },
      { ip: '2.2.2.2', online: false, data: null },
    ],
  },
  weather: { data: {
    temp: 72, wxCond: 'Clear', wxCode: 0, wxWindSpeed: 5,
    wxSunriseHr: 6, wxSunsetHr: 19,
    wxHi: 80, wxLo: 65,
    wxSunrise: '06:15', wxSunset: '20:42',
    wxUVIndex: 7,
    wxWind: 'W 12 mph',
    wxHum: '45%',
    hourly: [
      { hr: 10, t: 72, code: 0, pop: 0 },
      { hr: 11, t: 74, code: 1, pop: 20 },
    ],
  }, err: null },
  rss: { leadStory: { hed: 'Top story', link: 'https://x', topic: '', src: 'src', t: 'just now' }, items: [], err: null },
  feedHealth: 'live',
};

function wrap(ui) {
  return render(<ThemeCtx.Provider value={LIGHT}>{ui}</ThemeCtx.Provider>);
}

describe('HomePanel', () => {
  it('renders BTC, Fleet summary, and Lead headline tiles', () => {
    wrap(<HomePanel {...baseProps} onNavigate={() => {}} />);
    expect(screen.getByText(/BTC \/ USD/i)).toBeDefined();
    expect(screen.getByText(/Fleet/i)).toBeDefined();
    expect(screen.getByText('Top story')).toBeDefined();
  });

  it('fleet tile click navigates to miners tab', () => {
    const onNavigate = vi.fn();
    wrap(<HomePanel {...baseProps} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('fleet-tile'));
    expect(onNavigate).toHaveBeenCalledWith('miners');
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
    const tile = screen.getByTestId('lead-tile');
    // No aria-label: the headline itself names the button for screen readers.
    expect(screen.getByRole('button', { name: /Top story/ })).toBe(tile.closest('button'));
    fireEvent.click(tile);
    expect(onNavigate).toHaveBeenCalledWith('news');
  });

  it('shows no Latest tile when there are no further headlines', () => {
    wrap(<HomePanel {...baseProps} onNavigate={() => {}} />);
    expect(screen.queryByTestId('headlines-tile')).toBeNull();
    expect(screen.queryByText('Latest')).toBeNull();
  });

  it('Latest tile lists the next three headlines and opens the News tab', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      hed: `Story ${i + 1}`, link: `https://x/${i}`, src: 'Feed', t: `${i + 1}m ago`,
    }));
    const onNavigate = vi.fn();
    wrap(<HomePanel {...baseProps} rss={{ ...baseProps.rss, items }} onNavigate={onNavigate} />);
    const tile = screen.getByTestId('headlines-tile');
    expect(tile.textContent).toContain('Story 1');
    expect(tile.textContent).toContain('Story 3');
    expect(tile.textContent).not.toContain('Story 4');
    expect(screen.getByText('Feed · 2m ago')).toBeDefined();
    expect(tile.querySelectorAll('a')).toHaveLength(0);
    // No aria-label: the headlines themselves name the button for screen readers.
    expect(screen.getByRole('button', { name: /Story 1/ })).toBe(tile.closest('button'));
    fireEvent.click(tile);
    expect(onNavigate).toHaveBeenCalledWith('news');
  });

  it('weather tile has no expanded detail by default', () => {
    wrap(<HomePanel {...baseProps} onNavigate={() => {}} />);
    expect(screen.queryByText(/W 12 mph/i)).toBeNull();
    expect(screen.queryByText(/UV 7/i)).toBeNull();
  });

  it('clicking weather tile reveals expanded forecast detail', () => {
    wrap(<HomePanel {...baseProps} onNavigate={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /expand weather/i }));
    expect(screen.getByText('W 12 mph')).toBeDefined();
    expect(screen.getByText('UV 7')).toBeDefined();
    expect(screen.getByText(/06:15/)).toBeDefined();
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('clicking expanded weather tile collapses detail', () => {
    wrap(<HomePanel {...baseProps} onNavigate={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /expand weather/i }));
    fireEvent.click(screen.getByRole('button', { name: /collapse weather/i }));
    expect(screen.queryByText('W 12 mph')).toBeNull();
  });
});
