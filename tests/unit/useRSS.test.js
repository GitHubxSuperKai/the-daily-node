import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import CONFIG, { RSS_FEED_MAP } from '../../src/config.js';

const CONFIG_FEED_URL = key => RSS_FEED_MAP.find(f => f.key === key).url;
import { useRSS } from '../../src/hooks/useRSS.js';
import { pubTime } from '../../src/utils/newsSelect.js';

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
      if (u.pathname === '/api/rss') return { ok: true, headers: new Headers(), text: async () => xml(u.searchParams.get('feed')) };
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

  it('refetches at once when the enabled feeds change, without waiting for the interval', async () => {
    const saved = CONFIG.RSS_FEEDS;
    try {
      const feed = key => ({ key, url: CONFIG_FEED_URL(key) });
      CONFIG.RSS_FEEDS = [feed('coindesk'), feed('bitcoinMagazine')];
      global.fetch = vi.fn().mockImplementation(async (url) => {
        const u = new URL(String(url), 'http://localhost');
        if (u.pathname === '/api/rss') return { ok: false, status: 404 };
        return feedResp(3, u.searchParams.get('rss_url'));
      });
      const { result, rerender } = renderHook(({ keys }) => useRSS(keys), {
        initialProps: { keys: 'coindesk,bitcoinMagazine' },
      });
      await waitFor(() => expect(result.current.leadStory).not.toBeNull());
      const coindeskUrl = CONFIG_FEED_URL('coindesk');
      expect(result.current.items.concat(result.current.leadStory).some(it => it.hed.startsWith(coindeskUrl))).toBe(true);

      // Settings saved with CoinDesk off: App rewrites CONFIG.RSS_FEEDS, then re-renders.
      CONFIG.RSS_FEEDS = [feed('bitcoinMagazine')];
      rerender({ keys: 'bitcoinMagazine' });
      await waitFor(() => {
        const all = result.current.items.concat(result.current.leadStory || []);
        expect(all.length).toBeGreaterThan(0);
        expect(all.some(it => it.hed.startsWith(coindeskUrl))).toBe(false);
      });
    } finally {
      CONFIG.RSS_FEEDS = saved;
    }
  });

  it('a new news interval with the same feeds fetches once, not twice', async () => {
    const savedFeeds = CONFIG.RSS_FEEDS;
    const savedInterval = CONFIG.REFRESH_INTERVALS.news;
    try {
      CONFIG.RSS_FEEDS = [{ key: 'coindesk', url: CONFIG_FEED_URL('coindesk') }];
      // Proxy 404s, so one round is two requests: /api/rss, then rss2json.
      global.fetch = vi.fn().mockImplementation(async (url) => {
        const u = new URL(String(url), 'http://localhost');
        if (u.pathname === '/api/rss') return { ok: false, status: 404 };
        return feedResp(3);
      });
      const { result, rerender } = renderHook(({ keys }) => useRSS(keys), {
        initialProps: { keys: 'coindesk' },
      });
      await waitFor(() => expect(result.current.leadStory).not.toBeNull());
      const before = global.fetch.mock.calls.length;
      expect(before).toBe(2);

      // Settings saved with only the news interval changed.
      CONFIG.REFRESH_INTERVALS.news = savedInterval * 2;
      rerender({ keys: 'coindesk' });
      await waitFor(() => expect(global.fetch.mock.calls.length).toBeGreaterThan(before));
      await new Promise(r => setTimeout(r, 50));
      expect(global.fetch.mock.calls.length - before).toBe(2);
    } finally {
      CONFIG.RSS_FEEDS = savedFeeds;
      CONFIG.REFRESH_INTERVALS.news = savedInterval;
    }
  });

  it('a Save that changes both the feeds and the news interval fetches once, not twice', async () => {
    const savedFeeds = CONFIG.RSS_FEEDS;
    const savedInterval = CONFIG.REFRESH_INTERVALS.news;
    try {
      const feed = key => ({ key, url: CONFIG_FEED_URL(key) });
      CONFIG.RSS_FEEDS = [feed('coindesk')];
      // Proxy 404s, so one round of one feed is two requests: /api/rss, then rss2json.
      global.fetch = vi.fn().mockImplementation(async (url) => {
        const u = new URL(String(url), 'http://localhost');
        if (u.pathname === '/api/rss') return { ok: false, status: 404 };
        return feedResp(3);
      });
      const { result, rerender } = renderHook(({ keys }) => useRSS(keys), {
        initialProps: { keys: 'coindesk' },
      });
      await waitFor(() => expect(result.current.leadStory).not.toBeNull());
      const before = global.fetch.mock.calls.length;
      expect(before).toBe(2);

      // One Save: CoinDesk swapped for Bitcoin Magazine and the interval changed.
      CONFIG.RSS_FEEDS = [feed('bitcoinMagazine')];
      CONFIG.REFRESH_INTERVALS.news = savedInterval * 2;
      rerender({ keys: 'bitcoinMagazine' });
      await waitFor(() => expect(global.fetch.mock.calls.length).toBeGreaterThan(before));
      await new Promise(r => setTimeout(r, 50));
      expect(global.fetch.mock.calls.length - before).toBe(2);
    } finally {
      CONFIG.RSS_FEEDS = savedFeeds;
      CONFIG.REFRESH_INTERVALS.news = savedInterval;
    }
  });

  it('a fetch still in flight at Save cannot bring back a feed the Save switched off', async () => {
    const saved = CONFIG.RSS_FEEDS;
    try {
      const feed = key => ({ key, url: CONFIG_FEED_URL(key) });
      CONFIG.RSS_FEEDS = [feed('coindesk'), feed('bitcoinMagazine')];
      let hold = false;
      const held = [];
      global.fetch = vi.fn().mockImplementation(async (url) => {
        const u = new URL(String(url), 'http://localhost');
        if (u.pathname === '/api/rss') return { ok: false, status: 404 };
        const resp = feedResp(3, u.searchParams.get('rss_url'));
        if (!hold) return resp;
        return new Promise(res => held.push(() => res(resp)));
      });
      const { result, rerender } = renderHook(({ keys }) => useRSS(keys), {
        initialProps: { keys: 'coindesk,bitcoinMagazine' },
      });
      await waitFor(() => expect(result.current.leadStory).not.toBeNull());
      const coindeskUrl = CONFIG_FEED_URL('coindesk');
      const all = () => result.current.items.concat(result.current.leadStory || []);
      expect(all().some(it => it.hed.startsWith(coindeskUrl))).toBe(true);

      // A refresh starts with both feeds on and hangs on the network.
      hold = true;
      act(() => { result.current.refresh(); });
      await waitFor(() => expect(held.length).toBe(2));

      // Settings saved with CoinDesk off; the new fetch answers first.
      hold = false;
      CONFIG.RSS_FEEDS = [feed('bitcoinMagazine')];
      rerender({ keys: 'bitcoinMagazine' });
      await waitFor(() => {
        expect(all().length).toBeGreaterThan(0);
        expect(all().some(it => it.hed.startsWith(coindeskUrl))).toBe(false);
      });

      // Then the old fetch lands.
      await act(async () => {
        held.forEach(release => release());
        await new Promise(r => setTimeout(r, 50));
      });
      expect(all().length).toBeGreaterThan(0);
      expect(all().some(it => it.hed.startsWith(coindeskUrl))).toBe(false);
    } finally {
      CONFIG.RSS_FEEDS = saved;
    }
  });

  it('switching every feed off empties the column without flagging a feed error', async () => {
    const saved = CONFIG.RSS_FEEDS;
    try {
      CONFIG.RSS_FEEDS = [{ key: 'coindesk', url: CONFIG_FEED_URL('coindesk') }];
      global.fetch = vi.fn().mockImplementation(async (url) => {
        const u = new URL(String(url), 'http://localhost');
        if (u.pathname === '/api/rss') return { ok: false, status: 404 };
        return feedResp(3);
      });
      const { result, rerender } = renderHook(({ keys }) => useRSS(keys), {
        initialProps: { keys: 'coindesk' },
      });
      await waitFor(() => expect(result.current.leadStory).not.toBeNull());
      expect(result.current.feedsOff).toBe(false);

      CONFIG.RSS_FEEDS = [];
      rerender({ keys: '' });
      await waitFor(() => expect(result.current.leadStory).toBeNull());
      expect(result.current.items).toEqual([]);
      expect(result.current.err).toBe(false);
      expect(result.current.feedsOff).toBe(true);
    } finally {
      CONFIG.RSS_FEEDS = saved;
    }
  });

  it('switching feeds back on reads as loading until the new fetch lands, not as an empty good round', async () => {
    const saved = CONFIG.RSS_FEEDS;
    try {
      CONFIG.RSS_FEEDS = [];
      const held = [];
      global.fetch = vi.fn().mockImplementation(async (url) => {
        const u = new URL(String(url), 'http://localhost');
        if (u.pathname === '/api/rss') return { ok: false, status: 404 };
        return new Promise(res => held.push(() => res(feedResp(3))));
      });
      const { result, rerender } = renderHook(({ keys }) => useRSS(keys), { initialProps: { keys: '' } });
      await waitFor(() => expect(result.current.lastOk).toBeGreaterThan(0));

      CONFIG.RSS_FEEDS = [{ key: 'coindesk', url: CONFIG_FEED_URL('coindesk') }];
      rerender({ keys: 'coindesk' });
      await waitFor(() => expect(held.length).toBe(1));
      // NewsColumn and the status rows read lastOk null with no err as loading/pending.
      expect(result.current.lastOk).toBeNull();
      expect(result.current.feedsOff).toBe(false);

      await act(async () => { held.forEach(release => release()); });
      await waitFor(() => expect(result.current.leadStory).not.toBeNull());
      expect(result.current.lastOk).toBeGreaterThan(0);
    } finally {
      CONFIG.RSS_FEEDS = saved;
    }
  });

  it('a Save from one feed list to another keeps lastOk while the new fetch is out', async () => {
    // Only a Save coming out of all-off clears lastOk; swapping feeds keeps the
    // old stories and their timestamp on screen until the new round lands.
    const saved = CONFIG.RSS_FEEDS;
    try {
      const feed = key => ({ key, url: CONFIG_FEED_URL(key) });
      CONFIG.RSS_FEEDS = [feed('coindesk')];
      let hold = false;
      const held = [];
      global.fetch = vi.fn().mockImplementation(async (url) => {
        const u = new URL(String(url), 'http://localhost');
        if (u.pathname === '/api/rss') return { ok: false, status: 404 };
        const resp = feedResp(3, u.searchParams.get('rss_url'));
        if (!hold) return resp;
        return new Promise(res => held.push(() => res(resp)));
      });
      const { result, rerender } = renderHook(({ keys }) => useRSS(keys), { initialProps: { keys: 'coindesk' } });
      await waitFor(() => expect(result.current.lastOk).toBeGreaterThan(0));
      const firstOk = result.current.lastOk;

      hold = true;
      CONFIG.RSS_FEEDS = [feed('bitcoinMagazine')];
      rerender({ keys: 'bitcoinMagazine' });
      await waitFor(() => expect(held.length).toBe(1));
      expect(result.current.lastOk).toBe(firstOk);

      // The new feed's round lands and replaces the old stories.
      const bmUrl = CONFIG_FEED_URL('bitcoinMagazine');
      await act(async () => { held.forEach(release => release()); });
      await waitFor(() => expect(result.current.items.concat(result.current.leadStory || [])
        .every(it => it.hed.startsWith(bmUrl))).toBe(true));
    } finally {
      CONFIG.RSS_FEEDS = saved;
    }
  });

  it('a load with every feed off fetches nothing and is not stuck loading', async () => {
    const saved = CONFIG.RSS_FEEDS;
    try {
      CONFIG.RSS_FEEDS = [];
      global.fetch = vi.fn();
      const { result } = renderHook(() => useRSS(''));
      // NewsColumn shows "Loading headlines" until lastOk is set.
      await waitFor(() => expect(result.current.lastOk).toBeGreaterThan(0));
      expect(result.current.err).toBe(false);
      expect(result.current.items).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    } finally {
      CONFIG.RSS_FEEDS = saved;
    }
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

  describe('useRSS pubDate zones', () => {
    // rss2json returns pubDate as "YYYY-MM-DD HH:MM:SS" with no zone; the value is UTC.
    // The bug only shows off UTC, so pin a zone with a non-zero offset.
    const UTC_MS = Date.UTC(2026, 9, 23, 12, 0, 0);
    const FEED = 'newsBitcoin';
    let prevZone;

    beforeAll(() => {
      // Deleting TZ afterwards does not undo it (the zone stays set in this worker), so
      // restore the zone that was actually in effect, not the env var's old value.
      prevZone = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
      process.env.TZ = 'America/Los_Angeles';
      // Here rather than in an it(), so a -t filter cannot skip it and leave the
      // tests below passing on a UTC host without proving anything.
      if (new Date(UTC_MS).getTimezoneOffset() === 0) throw new Error('TZ pin did not take effect');
    });
    afterAll(() => {
      process.env.TZ = prevZone;
    });

    const story = pubDate => ({ title: 'Bitcoin story', link: 'https://example.com/1', pubDate, categories: [], description: '' });

    // /api/rss answers with raw XML for FEED; other feeds are empty.
    const viaProxy = pubDate => vi.fn().mockImplementation(async (url) => {
      const u = new URL(String(url), 'http://localhost');
      const items = u.searchParams.get('feed') === FEED
        ? `<item><title>Bitcoin story</title><link>https://example.com/1</link><pubDate>${pubDate}</pubDate></item>`
        : '';
      return { ok: true, headers: new Headers(), text: async () => `<rss version="2.0"><channel><title>x</title>${items}</channel></rss>` };
    });

    async function onlyItem() {
      const { result } = renderHook(() => useRSS());
      await waitFor(() => expect(result.current.items.length).toBe(1));
      return result.current.items[0];
    }

    it('reads rss2json\'s zone-less "YYYY-MM-DD HH:MM:SS" pubDate as UTC', async () => {
      global.fetch = onlyFeed(FEED, [story('2026-10-23 12:00:00')]);
      const item = await onlyItem();
      expect(item.pubDate).toBe('2026-10-23T12:00:00Z');
      expect(pubTime(item)).toBe(UTC_MS);
    });

    // Only that exact form is rewritten: near misses come back byte-identical, so an
    // unanchored pattern cannot strip an offset or a fraction by matching a prefix.
    ['2026-10-23 12:00:00 +0000', '2026-10-23 12:00:00.123', 'x2026-10-23 12:00:00', '2026-10-23T12:00:00'].forEach((near) => {
      it(`leaves the near miss ${JSON.stringify(near)} untouched`, async () => {
        global.fetch = onlyFeed(FEED, [story(near)]);
        expect((await onlyItem()).pubDate).toBe(near);
      });
    });

    it('leaves an already-zoned rss2json pubDate untouched', async () => {
      global.fetch = onlyFeed(FEED, [story('2026-10-23T05:00:00-07:00')]);
      const item = await onlyItem();
      expect(item.pubDate).toBe('2026-10-23T05:00:00-07:00');
      expect(pubTime(item)).toBe(UTC_MS);
    });

    it('leaves the /api/rss path\'s RFC 822 pubDate untouched', async () => {
      global.fetch = viaProxy('Fri, 23 Oct 2026 08:00:00 -0400');
      const item = await onlyItem();
      expect(item.pubDate).toBe('Fri, 23 Oct 2026 08:00:00 -0400');
      expect(pubTime(item)).toBe(UTC_MS);
    });
  });
});

// A network blip fails every lead image at once; recovery must let them be retried.
describe('useRSS failed lead images after a network blip', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  const up = () => vi.fn().mockResolvedValue(feedResp(2));

  // Each lead's image fails to load, as all do during a blip, until no lead is left.
  function failEveryLead(result) {
    for (let i = 0; i < 10 && result.current.leadStory; i++) {
      act(() => result.current.skipLead(result.current.leadStory.img));
    }
    expect(result.current.leadStory).toBeNull();
  }

  async function mountLoaded() {
    global.fetch = up();
    const hook = renderHook(() => useRSS());
    await waitFor(() => expect(hook.result.current.leadStory).not.toBeNull());
    return hook;
  }

  it('retries failed lead images on the first successful fetch after a fetch error', async () => {
    const { result } = await mountLoaded();
    failEveryLead(result);

    global.fetch = vi.fn().mockRejectedValue(new TypeError('network'));
    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(result.current.err).toBe(true));
    expect(result.current.leadStory).toBeNull();

    global.fetch = up();
    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(result.current.err).toBe(false));
    expect(result.current.leadStory).not.toBeNull();
  });

  it('an outage, then every feed off, then feeds back on still retries the failed images', async () => {
    // The all-off round is not a fresh fetch, so it must leave the outage flag alone:
    // the first fresh fetch after the feeds come back on still clears the failures.
    const saved = CONFIG.RSS_FEEDS;
    const keysOf = list => list.map(f => f.key).join(',');
    try {
      global.fetch = up();
      const { result, rerender } = renderHook(({ keys }) => useRSS(keys), { initialProps: { keys: keysOf(saved) } });
      await waitFor(() => expect(result.current.leadStory).not.toBeNull());
      failEveryLead(result);

      global.fetch = vi.fn().mockRejectedValue(new TypeError('network'));
      await act(async () => { result.current.refresh(); });
      await waitFor(() => expect(result.current.err).toBe(true));

      CONFIG.RSS_FEEDS = [];
      rerender({ keys: '' });
      await waitFor(() => expect(result.current.feedsOff).toBe(true));
      await waitFor(() => expect(result.current.err).toBe(false));

      global.fetch = up();
      CONFIG.RSS_FEEDS = saved;
      rerender({ keys: keysOf(saved) });
      await waitFor(() => expect(result.current.leadStory).not.toBeNull());
    } finally {
      CONFIG.RSS_FEEDS = saved;
    }
  });

  it('clears once per outage: a later success with no outage keeps skipping', async () => {
    const { result } = await mountLoaded();
    failEveryLead(result);
    global.fetch = vi.fn().mockRejectedValue(new TypeError('network'));
    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(result.current.err).toBe(true));
    global.fetch = up();
    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(result.current.leadStory).not.toBeNull());

    // Recovered. Images fail again with no outage this time: they stay skipped.
    failEveryLead(result);
    const before = global.fetch.mock.calls.length;
    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(global.fetch.mock.calls.length).toBeGreaterThan(before));
    await act(async () => {});
    expect(result.current.leadStory).toBeNull();
  });

  // /api/rss on an internet-only outage: 200 with the proxy's cached copy, flagged stale.
  const proxy = (stale) => vi.fn().mockImplementation(async (url) => {
    const u = new URL(String(url), 'http://localhost');
    if (u.pathname !== '/api/rss') throw new Error(`unexpected fetch ${url}`);
    const key = u.searchParams.get('feed');
    const items = [0, 1].map(i =>
      `<item><title>${key} bitcoin ${i}</title><link>https://example.com/${key}/${i}</link>` +
      `<media:thumbnail xmlns:media="http://search.yahoo.com/mrss/" url="https://img.example/${key}/${i}.jpg"/>` +
      `<pubDate>${new Date(Date.now() - (2 - i) * 60_000).toUTCString()}</pubDate></item>`).join('');
    return {
      ok: true,
      headers: new Headers(stale ? { 'X-Feed-Stale': '1' } : {}),
      text: async () => `<rss version="2.0"><channel><title>x</title>${items}</channel></rss>`,
    };
  });

  it('retries failed lead images on the first fresh fetch after the proxy served only stale copies', async () => {
    global.fetch = proxy(false);
    const { result } = renderHook(() => useRSS());
    await waitFor(() => expect(result.current.leadStory).not.toBeNull());
    failEveryLead(result);

    // Upstream outage behind the proxy: every feed answers 200 with its stale copy. Still
    // shown, and not an error, but the images stay skipped until the upstream is back.
    global.fetch = proxy(true);
    const before = global.fetch.mock.calls.length;
    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(global.fetch.mock.calls.length).toBeGreaterThan(before));
    await act(async () => {});
    expect(result.current.err).toBe(false);
    expect(result.current.items.length).toBeGreaterThan(0);
    expect(result.current.leadStory).toBeNull();

    // A second stale round mid-outage (the flag is now set) must not clear either.
    const before2 = global.fetch.mock.calls.length;
    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(global.fetch.mock.calls.length).toBeGreaterThan(before2));
    await act(async () => {});
    expect(result.current.leadStory).toBeNull();

    global.fetch = proxy(false);
    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(result.current.leadStory).not.toBeNull());
  });

  it('retries failed lead images when the browser comes back online', async () => {
    const { result } = await mountLoaded();
    failEveryLead(result);

    act(() => { window.dispatchEvent(new Event('online')); });
    expect(result.current.leadStory).not.toBeNull();
  });

  it('keeps skipping failed images across fetches when there was no outage', async () => {
    const { result } = await mountLoaded();
    failEveryLead(result);

    const before = global.fetch.mock.calls.length;
    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(global.fetch.mock.calls.length).toBeGreaterThan(before));
    await act(async () => {});
    expect(result.current.leadStory).toBeNull();
  });
});
