import React from 'react';
globalThis.React = React;

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../../src/theme.js';
import { NewsPanel } from '../../../src/components/mobile/NewsPanel.jsx';

function wrap(ui) {
  return render(<ThemeCtx.Provider value={LIGHT}>{ui}</ThemeCtx.Provider>);
}

const leadWithImage = {
  hed: 'Bitcoin breaks all-time high',
  link: 'https://example.com/story',
  src: 'CoinDesk',
  t: '5m ago',
  topic: 'MARKETS',
  cat: 'BTC',
  img: 'https://example.com/image.jpg',
  snippet: 'Institutional investors drove a surge past previous records as ETF inflows hit a new single-day record.',
};

const leadNoImage = {
  hed: 'Lightning Network grows',
  link: 'https://example.com/story2',
  src: 'BitcoinMagazine',
  t: '10m ago',
  topic: '',
  cat: 'TECH',
  img: null,
  snippet: '',
};

const rssWithImage = { leadStory: leadWithImage, items: [], err: null };
const rssNoImage   = { leadStory: leadNoImage, items: [], err: null };

describe('NewsPanel — lead story', () => {
  it('renders lead headline', () => {
    wrap(<NewsPanel rss={rssWithImage} />);
    expect(screen.getByText('Bitcoin breaks all-time high')).toBeDefined();
  });

  it('renders lead image when lead.img is present', () => {
    const { container } = wrap(<NewsPanel rss={rssWithImage} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('https://example.com/image.jpg');
  });

  it('does not render image when lead.img is null', () => {
    const { container } = wrap(<NewsPanel rss={rssNoImage} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders snippet when lead.snippet is truthy', () => {
    wrap(<NewsPanel rss={rssWithImage} />);
    expect(screen.getByText(/Institutional investors drove/)).toBeDefined();
  });

  it('does not render snippet when lead.snippet is empty', () => {
    // NewsPanel has no <p> elements besides the snippet; absence proves no snippet rendered
    const { container } = wrap(<NewsPanel rss={rssNoImage} />);
    expect(container.querySelector('p')).toBeNull();
  });

  it('truncates snippet longer than 160 chars', () => {
    const longSnippet = 'A'.repeat(200);
    const rssLong = { leadStory: { ...leadWithImage, snippet: longSnippet }, items: [], err: null };
    wrap(<NewsPanel rss={rssLong} />);
    const truncated = screen.getByText('A'.repeat(160) + '…');
    expect(truncated).toBeDefined();
  });
});

describe('NewsPanel — empty states', () => {
  it('loaded with no headlines and no lead: "No Bitcoin headlines right now"', () => {
    wrap(<NewsPanel rss={{ leadStory: null, items: [], err: null, lastOk: 1 }} />);
    expect(screen.getByText('No Bitcoin headlines right now')).toBeDefined();
    expect(screen.queryByText('No more headlines right now')).toBeNull();
  });

  it('loaded with no headlines but a lead shown: "No more headlines right now"', () => {
    wrap(<NewsPanel rss={{ leadStory: leadNoImage, items: [], err: null, lastOk: 1 }} />);
    expect(screen.getByText('No more headlines right now')).toBeDefined();
    expect(screen.queryByText('No Bitcoin headlines right now')).toBeNull();
  });

  it('not loaded yet: loading copy, neither empty state', () => {
    wrap(<NewsPanel rss={{ leadStory: null, items: [], err: null, lastOk: null }} />);
    expect(screen.getByText('Loading…')).toBeDefined();
    expect(screen.queryByText(/headlines right now/)).toBeNull();
  });

  it('a feed error wins over the empty states', () => {
    wrap(<NewsPanel rss={{ leadStory: null, items: [], err: true, lastOk: 1 }} />);
    expect(screen.getByText('Feed unavailable')).toBeDefined();
    expect(screen.queryByText(/headlines right now/)).toBeNull();
  });

  it('a feed error wins over the empty states with a lead still shown', () => {
    wrap(<NewsPanel rss={{ leadStory: leadNoImage, items: [], err: true, lastOk: 1 }} />);
    expect(screen.getByText('Feed unavailable')).toBeDefined();
    expect(screen.queryByText(/headlines right now/)).toBeNull();
  });
});

describe('NewsPanel — lead image fallback', () => {
  it('an image load error calls skipLead with the failing image', () => {
    const skipLead = vi.fn();
    const { container } = wrap(<NewsPanel rss={{ ...rssWithImage, skipLead }} />);
    fireEvent.error(container.querySelector('img'));
    expect(skipLead).toHaveBeenCalledTimes(1);
    expect(skipLead).toHaveBeenCalledWith('https://example.com/image.jpg');
  });

  it('an image load error without skipLead does not throw', () => {
    const { container } = wrap(<NewsPanel rss={rssWithImage} />);
    // React reports a throwing event handler on window, not to the caller, so
    // .not.toThrow() alone would pass vacuously.
    const errors = [];
    const onWinError = (e) => { errors.push(e.error); e.preventDefault(); };
    window.addEventListener('error', onWinError);
    try {
      fireEvent.error(container.querySelector('img'));
    } finally {
      window.removeEventListener('error', onWinError);
    }
    expect(errors).toEqual([]);
  });
});
