import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRSS } from '../../src/hooks/useRSS.js';

const feedResp = (count, prefix = 'a') => ({
  ok: true,
  json: async () => ({
    status: 'ok',
    feed: { title: `Stub-${prefix}` },
    items: Array.from({ length: count }, (_, i) => ({
      title: `${prefix} Story ${i}`,
      link: `https://example.com/${prefix}/${i}`,
      pubDate: new Date(2026, 0, i + 1).toISOString(),
      description: '',
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
            title: 'Safe story',
            link: 'https://example.com/safe',
            pubDate: new Date(2026, 0, 2).toISOString(),
            description: '',
            categories: ['News'],
          },
          {
            title: 'XSS story',
            link: 'javascript:alert(document.cookie)',
            pubDate: new Date(2026, 0, 1).toISOString(),
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
    const xssItems = result.current.items.filter(i => i.hed === 'XSS story');
    expect(xssItems.length).toBeGreaterThan(0);
    xssItems.forEach(i => expect(i.link).toBeNull());

    // Safe items must keep their https: link
    const allItems = [
      ...(result.current.leadStory ? [result.current.leadStory] : []),
      ...result.current.items,
    ];
    const safeItems = allItems.filter(i => i.hed === 'Safe story');
    expect(safeItems.length).toBeGreaterThan(0);
    safeItems.forEach(i => expect(i.link).toBe('https://example.com/safe'));
  });

  it('reads feeds from the same-origin /api/rss proxy and skips rss2json when it answers', async () => {
    const xml = (key) => `<rss version="2.0"><channel><title>Proxy ${key}</title>${
      Array.from({ length: 12 }, (_, i) =>
        `<item><title>${key} ${i}</title><link>https://example.com/${key}/${i}</link>` +
        `<pubDate>${new Date(Date.UTC(2026, 0, 1 + i)).toUTCString()}</pubDate></item>`).join('')
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
    expect(result.current.leadStory.src).toMatch(/^Proxy /);
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
    expect(result.current.leadStory.src).toBe('Stub-a');
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
});
