import React from 'react';
globalThis.React = React;

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
