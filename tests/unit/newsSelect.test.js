import { describe, it, expect } from 'vitest';
import {
  isBitcoinRelevant, isPodcast, pickLead, selectNews, LEAD_WINDOW_MS, NEWS_CAP,
} from '../../src/utils/newsSelect.js';

const NOW = Date.UTC(2026, 9, 19, 12, 0, 0);
const hoursAgo = h => new Date(NOW - h * 3600e3).toUTCString();
const SNIPPET = 'A real summary of the story that runs comfortably past the eighty character minimum.';

const item = (over = {}) => ({
  feedKey: 'coindesk', hed: 'Bitcoin story', cats: [], img: 'https://img.example/a.jpg',
  snippet: SNIPPET, link: `https://example.com/${Math.random()}`, pubDate: hoursAgo(1), ...over,
});

describe('isBitcoinRelevant', () => {
  // Real headlines and categories from the feeds, 2026-10-19.
  it('drops Stacker News sports/AI/celebrity posts', () => {
    expect(isBitcoinRelevant(item({ feedKey: 'stackerNews', hed: '2026 NFL Survivor Pool- Week 6 recap', cats: ['Stacker_Sports'] }))).toBe(false);
    expect(isBitcoinRelevant(item({ feedKey: 'stackerNews', hed: 'US banning Chinese AI DeepSeek from government agency IT systems', cats: ['news', 'AI'] }))).toBe(false);
    expect(isBitcoinRelevant(item({ feedKey: 'stackerNews', hed: 'Elon Musk says he’ll give a SpaceX share to every child in America', cats: ['news', 'Stacker_Stocks'] }))).toBe(false);
  });
  it('keeps Stacker News posts in Bitcoin territories even without the word in the title', () => {
    expect(isBitcoinRelevant(item({ feedKey: 'stackerNews', hed: 'Your sats aren’t sitting in an escrow wallet. So how does Mostro actually work?', cats: ['bitcoin_beginners'] }))).toBe(true);
    expect(isBitcoinRelevant(item({ feedKey: 'stackerNews', hed: 'Channel liquidity question', cats: ['lightning'] }))).toBe(true);
  });
  it('filters off-topic stories from the outlets too', () => {
    expect(isBitcoinRelevant(item({ feedKey: 'newsBitcoin', hed: 'MrBeast’s New Banking App Step Shows No Signs of Crypto', cats: ['Finance', 'adoption', 'Bank', 'Bitmine'] }))).toBe(false);
    expect(isBitcoinRelevant(item({ feedKey: 'coindesk', hed: 'Cardano founder Charles Hoskinson is building a new programming language', cats: ['Tech', 'News'] }))).toBe(false);
  });
  it('keeps outlet stories that mention Bitcoin in the title or tags', () => {
    expect(isBitcoinRelevant(item({ feedKey: 'newsBitcoin', hed: 'Strive Buys 1,223 Bitcoin While Preparing a $630 Million Cash Raise', cats: ['Crypto News'] }))).toBe(true);
    expect(isBitcoinRelevant(item({ feedKey: 'coindesk', hed: 'Bitcoin mining offshoot Nscale loses Microsoft AI deal', cats: ['Tech'] }))).toBe(true);
    expect(isBitcoinRelevant(item({ feedKey: 'newsBitcoin', hed: 'Hyperliquid Whale Down $9 Million This Week', cats: ['Market Updates', 'Bitcoin (BTC)'] }))).toBe(true);
    expect(isBitcoinRelevant(item({ feedKey: 'coindesk', hed: 'Whale moves $34 million in BTC', cats: [] }))).toBe(true);
    expect(isBitcoinRelevant(item({ feedKey: 'tftc', hed: 'Hashprice slides as difficulty climbs', cats: [] }))).toBe(true);
  });
  it('passes everything from Bitcoin-only feeds', () => {
    expect(isBitcoinRelevant(item({ feedKey: 'optech', hed: 'Newsletter #377', cats: [] }))).toBe(true);
    expect(isBitcoinRelevant(item({ feedKey: 'nobsBitcoin', hed: 'Core 30.1 released', cats: [] }))).toBe(true);
  });
  it('does not match Bitcoin words inside other words', () => {
    expect(isBitcoinRelevant(item({ hed: 'Satisfying results from the tribunal', cats: ['Satire', 'Lightningbolt Records'] }))).toBe(false);
  });
});

describe('isPodcast', () => {
  it('detects podcasts by category or audio enclosure, not by feed', () => {
    expect(isPodcast(item({ feedKey: 'tftc', cats: ['Podcasts', 'Markets'] }))).toBe(true);
    expect(isPodcast(item({ feedKey: 'bitcoinMagazine', cats: [], audio: true }))).toBe(true);
    // TFTC articles carry an image/jpeg enclosure on every item; they are not podcasts.
    expect(isPodcast(item({ feedKey: 'tftc', cats: ['Technology', 'Protocol'] }))).toBe(false);
  });
});

describe('pickLead', () => {
  it('takes the newest recent primary-outlet story with an image', () => {
    const a = item({ feedKey: 'newsBitcoin', pubDate: hoursAgo(2) });
    const b = item({ feedKey: 'coindesk', pubDate: hoursAgo(1), snippet: '' });
    const newerFallback = item({ feedKey: 'tftc', pubDate: hoursAgo(0.1) });
    expect(pickLead([newerFallback, b, a], NOW)).toBe(b);
  });
  it('ignores primary stories older than the window or without an image', () => {
    // No snippet, so it cannot qualify as the fallback either (a stale primary
    // story WITH a real snippet is a legitimate fallback).
    const old = item({ feedKey: 'bitcoinMagazine', snippet: '', pubDate: new Date(NOW - LEAD_WINDOW_MS - 1000).toUTCString() });
    const noImg = item({ feedKey: 'bitcoinMagazine', img: null });
    const fallback = item({ feedKey: 'tftc', pubDate: hoursAgo(10) });
    expect(pickLead([noImg, old, fallback], NOW)).toBe(fallback);
  });
  it('falls back to the newest item with an image and a real snippet', () => {
    const shortSnip = item({ feedKey: 'tftc', pubDate: hoursAgo(7), snippet: 'Comments' });
    const good = item({ feedKey: 'hashrateIndex', pubDate: hoursAgo(8) });
    expect(pickLead([shortSnip, good], NOW)).toBe(good);
  });
  it('never leads with Stacker News or a podcast', () => {
    const sn = item({ feedKey: 'stackerNews', pubDate: hoursAgo(0.5) });
    const pod = item({ feedKey: 'coindesk', topic: 'PODCASTS', pubDate: hoursAgo(0.5) });
    expect(pickLead([sn, pod], NOW)).toBeNull();
  });
  it('skips stories whose image failed to load', () => {
    const a = item({ feedKey: 'coindesk', pubDate: hoursAgo(1), img: 'https://img.example/broken.jpg' });
    const b = item({ feedKey: 'coindesk', pubDate: hoursAgo(2) });
    expect(pickLead([a, b], NOW, new Set(['https://img.example/broken.jpg']))).toBe(b);
  });
  it('never leads with an undated item', () => {
    expect(pickLead([item({ pubDate: 'not a date' })], NOW)).toBeNull();
  });
  it('returns null when nothing qualifies', () => {
    expect(pickLead([item({ img: null })], NOW)).toBeNull();
  });
});

describe('selectNews', () => {
  it('removes the lead from the list and caps the list', () => {
    const pool = Array.from({ length: NEWS_CAP + 10 }, (_, i) => item({ pubDate: hoursAgo(i * 0.1) }));
    const { leadStory, items } = selectNews(pool, NOW);
    expect(leadStory).toBe(pool[0]);
    expect(items).toHaveLength(NEWS_CAP);
    expect(items).not.toContain(leadStory);
    expect(items[0]).toBe(pool[1]);
  });
  it('keeps every item in the list when there is no lead', () => {
    const pool = [item({ img: null }), item({ img: null })];
    const { leadStory, items } = selectNews(pool, NOW);
    expect(leadStory).toBeNull();
    expect(items).toEqual(pool);
  });
  it('caps the list at 30', () => {
    expect(NEWS_CAP).toBe(30);
  });
});
