import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { RSS_FEED_MAP } from '../../src/config.js';

const CONFIG_FEED_URL = key => RSS_FEED_MAP.find(f => f.key === key).url;
import { useRSS } from '../../src/hooks/useRSS.js';

const feedResp = (count, prefix = 'a') => ({
  ok: true,
  json: async () => ({
    status: 'ok',
    feed: { title: `Stub-${prefix}` },
    items: Array.from({ length: count }, (_, i) => ({
      title: `${prefix} Bitcoin story ${i}`,
      link: `https://example.com/${prefix}/${i}`,
      // Clock-relative on purpose: the lead takes recent primary stories, so these
      // must stay inside its 6h window whenever the suite runs.
      pubDate: new Date(Date.now() - (count - i) * 60_000).toISOString(),
      description: '',
      thumbnail: `https://img.example/${prefix}/${i}.jpg`,
      categories: ['News'],
    })),
  }),
});

describe('useRSS', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // useRSS references classifyTopic + timeAgo as build-time globals (concatenated
    // from src/utils/formatting.js by build.js). Tests run the source directly, so
    // stub the names the hook expects.
    globalThis.classifyTopic = () => 'BITCOIN';
    globalThis.timeAgo = () => '1m';
  });

  it('flattens items from all feeds and exposes leadStory + items', async () => {
    global.fetch = vi.fn().mockResolvedValue(feedResp(5));
    const { result } = renderHook(() => useRSS());
    await waitFor(() => expect(result.current.leadStory).not.toBeNull());

    expect(result.current.items.length).toBeGreaterThan(0);
    expect(result.current.err).toBe(false);
    expect(result.current.lastOk).toBeGreaterThan(0);
    expect(result.current.leadStory).toHaveProperty('hed');
  });

  it('marks err=true when every feed fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('network'));
    const { result } = renderHook(() => useRSS());
    await waitFor(() => expect(result.current.err).toBe(true));
    expect(result.current.items).toEqual([]);
    expect(result.current.leadStory).toBeNull();
  });

  it('strips javascript: links — unsafe link becomes null', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ok',
        feed: { title: 'XSSFeed' },
        items: [
          {
            title: 'Safe bitcoin story',
            link: 'https://example.com/safe',
            pubDate: new Date(Date.now() - 60_000).toISOString(),
            description: '',
            thumbnail: 'https://img.example/safe.jpg',
            categories: ['News'],
          },
          {
            title: 'XSS bitcoin story',
            link: 'javascript:alert(document.cookie)',
            pubDate: new Date(Date.now() - 120_000).toISOString(),
            description: '',
            categories: ['News'],
          },
        ],
      }),
    });
    const { result } = renderHook(() => useRSS());
    await waitFor(() => expect(result.current.leadStory).not.toBeNull());

    // CONFIG.RSS_FEEDS has 3 feeds; mock returns same 2 items per feed,
    // so items contains duplicates. Filter by title to find the XSS item
    // regardless of position.
    const xssItems = result.current.items.filter(i => i.hed === 'XSS bitcoin story');
    expect(xssItems.length).toBeGreaterThan(0);
    xssItems.forEach(i => expect(i.link).toBeNull());

    // Safe items must keep their https: link
    const allItems = [
      ...(result.current.leadStory ? [result.current.leadStory] : []),
      ...result.current.items,
    ];
    const safeItems = allItems.filter(i => i.hed === 'Safe bitcoin story');
    expect(safeItems.length).toBeGreaterThan(0);
    safeItems.forEach(i => expect(i.link).toBe('https://example.com/safe'));
  });

  it('reads feeds from the same-origin /api/rss proxy and skips rss2json when it answers', async () => {
    const xml = (key) => `<rss version="2.0"><channel><title>Proxy ${key}</title>${
      Array.from({ length: 12 }, (_, i) =>
        `<item><title>${key} bitcoin ${i}</title><link>https://example.com/${key}/${i}</link>` +
        `<media:thumbnail xmlns:media="http://search.yahoo.com/mrss/" url="https://img.example/${key}/${i}.jpg"/>` +
        `<pubDate>${new Date(Date.now() - (12 - i) * 60_000).toUTCString()}</pubDate></item>`).join('')
    }</channel></rss>`;
    global.fetch = vi.fn().mockImplementation(async (url) => {
      const u = new URL(String(url), 'http://localhost');
      if (u.pathname === '/api/rss') return { ok: true, text: async () => xml(u.searchParams.get('feed')) };
      throw new Error(`unexpected fetch ${url}`);
    });
    const { result } = renderHook(() => useRSS());
    await waitFor(() => expect(result.current.leadStory).not.toBeNull());

    const requested = global.fetch.mock.calls.map(([u]) => String(u));
    expect(requested.every(u => u.startsWith('/api/rss?feed='))).toBe(true);
    expect(result.current.err).toBe(false);
    // The label comes from RSS_FEED_MAP, not the feed's self-reported title.
    expect(['Bitcoin Magazine', 'CoinDesk', 'News.Bitcoin.com']).toContain(result.current.leadStory.src);
    // Per-feed cap of 10 (rss2json parity): items 10 and 11 of each feed are dropped,
    // and those are each feed's two NEWEST, so the lead must be item 9.
    expect(result.current.leadStory.hed).toMatch(/ 9$/);
  });

  it('falls back to rss2json per feed when /api/rss is unavailable', async () => {
    global.fetch = vi.fn().mockImplementation(async (url) => {
      const u = new URL(String(url), 'http://localhost');
      if (u.pathname === '/api/rss') return { ok: false, status: 404 };
      return feedResp(3);
    });
    const { result } = renderHook(() => useRSS());
    await waitFor(() => expect(result.current.leadStory).not.toBeNull());

    const hosts = global.fetch.mock.calls.map(([u]) => new URL(String(u), 'http://localhost').hostname);
    expect(hosts.filter(h => h === 'api.rss2json.com').length).toBe(hosts.filter(h => h === 'localhost').length);
    expect(['Bitcoin Magazine', 'CoinDesk', 'News.Bitcoin.com']).toContain(result.current.leadStory.src);
  });

  it('bounds every fetch with a timeout signal, so a hung request cannot stall the feed', async () => {
    // A bare fetch() has no deadline: a request that never settles left the feed stuck on
    // stale data with no error. Every call must carry an AbortSignal.
    global.fetch = vi.fn().mockResolvedValue(feedResp(5));
    renderHook(() => useRSS());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    for (const [, init] of global.fetch.mock.calls) {
      expect(init?.signal, 'fetch called without a signal').toBeInstanceOf(AbortSignal);
    }
  });

  // One feed answers through rss2json with `items`; the other default feeds 404.
  const onlyFeed = (key, items) => vi.fn().mockImplementation(async (url) => {
    const u = new URL(String(url), 'http://localhost');
    if (u.pathname === '/api/rss') return { ok: false, status: 404 };
    const feedUrl = u.searchParams.get('rss_url') || '';
    const wanted = CONFIG_FEED_URL(key);
    return { ok: true, json: async () => ({ status: 'ok', feed: { title: 'Self-reported title' }, items: feedUrl === wanted ? items : [] }) };
  });
  const recent = (min) => new Date(Date.now() - min * 60_000).toISOString();

  it('drops items that are not about Bitcoin and labels items with the outlet name', async () => {
    global.fetch = onlyFeed('newsBitcoin', [
      { title: 'Strive Buys 1,223 Bitcoin', link: 'https://example.com/1', pubDate: recent(1), categories: ['Crypto News'], thumbnail: 'https://img.example/1.jpg', description: '' },
      { title: 'MrBeast’s New Banking App Step Shows No Signs of Crypto', link: 'https://example.com/2', pubDate: recent(2), categories: ['Finance'], description: '' },
      { title: 'MARA Ships $83 Million in Bitcoin to Exchanges', link: 'https://example.com/3', pubDate: recent(3), categories: ['Mining'], description: '' },
    ]);
    const { result } = renderHook(() => useRSS());
    await waitFor(() => expect(result.current.leadStory).not.toBeNull());
    const all = [result.current.leadStory, ...result.current.items];
    expect(all.map(i => i.hed)).toEqual(['Strive Buys 1,223 Bitcoin', 'MARA Ships $83 Million in Bitcoin to Exchanges']);
    all.forEach(i => expect(i.src).toBe('News.Bitcoin.com'));
  });

  it('files podcasts under PODCASTS and keeps them out of the lead', async () => {
    global.fetch = onlyFeed('coindesk', [
      { title: 'Bitcoin podcast episode', link: 'https://example.com/p', pubDate: recent(1), categories: ['Podcasts'], thumbnail: 'https://img.example/p.jpg', description: 'x'.repeat(200) },
    ]);
    const { result } = renderHook(() => useRSS());
    await waitFor(() => expect(result.current.items.length).toBe(1));
    expect(result.current.items[0].topic).toBe('PODCASTS');
    expect(result.current.leadStory).toBeNull();
  });

  it('skipLead moves the lead to the next story when its image fails', async () => {
    global.fetch = onlyFeed('coindesk', [
      { title: 'Bitcoin first', link: 'https://example.com/a', pubDate: recent(1), categories: [], thumbnail: 'https://img.example/a.jpg', description: '' },
      { title: 'Bitcoin second', link: 'https://example.com/b', pubDate: recent(2), categories: [], thumbnail: 'https://img.example/b.jpg', description: '' },
    ]);
    const { result } = renderHook(() => useRSS());
    await waitFor(() => expect(result.current.leadStory?.hed).toBe('Bitcoin first'));
    act(() => result.current.skipLead('https://img.example/a.jpg'));
    expect(result.current.leadStory.hed).toBe('Bitcoin second');
    // The skipped story is not lost: it drops back into the list.
    expect(result.current.items.map(i => i.hed)).toContain('Bitcoin first');
  });

  it('applies the per-feed cap of 10 after the Bitcoin filter, so off-topic items cannot crowd out on-topic ones', async () => {
    // 10 off-topic items first, then 3 Bitcoin items: capping before filtering would keep none.
    const offTopic = Array.from({ length: 10 }, (_, i) => ({ title: `Cardano update ${i}`, link: `https://example.com/off/${i}`, pubDate: recent(i + 1), categories: ['Tech'], description: '' }));
    const onTopic = Array.from({ length: 3 }, (_, i) => ({ title: `Bitcoin story ${i}`, link: `https://example.com/on/${i}`, pubDate: recent(20 + i), categories: [], description: '' }));
    global.fetch = onlyFeed('coindesk', [...offTopic, ...onTopic]);
    const { result } = renderHook(() => useRSS());
    await waitFor(() => expect(result.current.items.length).toBe(3));
    expect(result.current.items.map(i => i.hed)).toEqual(['Bitcoin story 0', 'Bitcoin story 1', 'Bitcoin story 2']);
  });
});
