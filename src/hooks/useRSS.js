import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import CONFIG, { RSS_FEED_MAP } from '../config.js';
import { useResettableInterval } from './useResettableInterval.js';
import { classifyTopic, timeAgo, safeUrl } from '../utils/formatting.js';
import { parseFeedXml, htmlToText } from '../utils/feedXml.js';
import { isBitcoinRelevant, isPodcast, selectNews, pubTime } from '../utils/newsSelect.js';

// rss2json caps a feed at 10 items; the proxy path keeps that cap (applied after the
// Bitcoin filter) so one long feed can't crowd the column.
const PER_FEED_CAP = 10;

// Same-origin proxy in bitaxe_api.py: returns the feed's raw XML for a known key.
// X-Feed-Stale: 1 means the upstream fetch failed and this is the proxy's cached copy.
async function fetchViaProxy(key) {
  const r = await fetch(`/api/rss?feed=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(CONFIG.FETCH_TIMEOUT) });
  if (!r.ok) throw new Error('rss-proxy');
  const stale = r.headers.get('X-Feed-Stale') === '1';
  return { ...parseFeedXml(await r.text()), stale };
}

// rss2json gives pubDate as "YYYY-MM-DD HH:MM:SS" in UTC with no zone, which
// Date parses as local time. Mark that exact form as UTC; leave anything else alone.
const RSS2JSON_DATE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;
function rss2jsonDate(s) {
  const m = typeof s === 'string' && s.match(RSS2JSON_DATE);
  return m ? `${m[1]}T${m[2]}Z` : s;
}

async function fetchViaRss2json(feedUrl) {
  const apiKey = CONFIG.RSS2JSON_KEY ? `&api_key=${CONFIG.RSS2JSON_KEY}` : '';
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}${apiKey}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(CONFIG.FETCH_TIMEOUT) });
  if (!r.ok) throw new Error('rss');
  const j = await r.json();
  if (j.status !== 'ok') throw new Error('rss-status');
  return { title: j.feed.title, items: j.items.map(it => ({ ...it, pubDate: rss2jsonDate(it.pubDate) })) };
}

export function useRSS() {
  // Every Bitcoin-relevant item, newest first; lead and list are derived from it.
  const [pool, setPool] = useState([]);
  // Lead images that failed to load this session; pickLead skips their stories.
  const [failedImgs, setFailedImgs] = useState(() => new Set());
  const [err, setErr] = useState(false);
  const [lastOk, setLastOk] = useState(null);
  // Whether the last fetch got nothing fresh (every feed failed, or the proxy served only
  // stale copies), read by the next one (fetchRSS is stable).
  const hadErrRef = useRef(false);

  // A network blip fails every lead image at once, so forget the failures when the
  // network comes back. Keeps the same Set (no re-render) when nothing has failed.
  const clearFailedImgs = useCallback(() => {
    setFailedImgs(prev => (prev.size ? new Set() : prev));
  }, []);

  const fetchRSS = useCallback(async () => {
    const feeds = CONFIG.RSS_FEEDS || [];

    const results = await Promise.allSettled(
      feeds.map(async feed => {
        let j;
        try {
          j = await fetchViaProxy(feed.key);
        } catch {
          // No /api/rss (dev server, older image) or the proxy's upstream failed.
          j = await fetchViaRss2json(feed.url);
        }
        const known = RSS_FEED_MAP.find(f => f.key === feed.key);
        const src = (known && known.label) || j.title || new URL(feed.url).hostname;
        const items = j.items.map(it => {
          const enclosureType = (it.enclosure && it.enclosure.type) || '';
          const item = {
            feedKey: feed.key,
            cats: Array.isArray(it.categories) ? it.categories : [],
            audio: enclosureType.startsWith('audio/'),
            hed: it.title,
            src,
            pubDate: it.pubDate,
            t: timeAgo(it.pubDate),
            link: safeUrl(it.link),
            img:
              safeUrl(it.thumbnail || null) ||
              (enclosureType.startsWith('image/') ? safeUrl(it.enclosure.link) : null) ||
              (it.description ? safeUrl((it.description.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i) || [])[1] || null) : null) ||
              null,
            snippet: htmlToText(it.description).slice(0, 1000),
          };
          item.topic = isPodcast(item) ? 'PODCASTS' : classifyTopic(item.hed);
          return item;
        }).filter(isBitcoinRelevant).slice(0, PER_FEED_CAP);
        return { items, stale: !!j.stale };
      })
    );

    const all = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value.items)
      // Undated items sort last.
      .sort((a, b) => (pubTime(b) ?? -Infinity) - (pubTime(a) ?? -Infinity));

    // Behind /api/rss an internet-only outage still answers 200 with the proxy's cached
    // copy (flagged stale), and the 'online' listener below doesn't fire since the panel's
    // own connection stayed up. So a round with no fresh feed counts as an outage here,
    // though it still shows the cached stories and no error.
    const fresh = results.some(r => r.status === 'fulfilled' && !r.value.stale);

    if (results.some(r => r.status === 'fulfilled')) {
      // First fresh fetch after an outage: the outage likely failed the images too.
      if (fresh && hadErrRef.current) clearFailedImgs();
      hadErrRef.current = !fresh;
      setPool(all);
      setErr(false);
      setLastOk(Date.now());
    } else {
      hadErrRef.current = true;
      setErr(true);
    }
  }, [clearFailedImgs]);

  const { reset: resetRSS } = useResettableInterval(fetchRSS, CONFIG.REFRESH_INTERVALS.news);

  // The browser saw the connection drop and return (covers blips between fetches).
  useEffect(() => {
    window.addEventListener('online', clearFailedImgs);
    return () => window.removeEventListener('online', clearFailedImgs);
  }, [clearFailedImgs]);

  // Refresh relative times every minute (this also re-checks the lead's 6h window).
  useEffect(() => {
    const id = setInterval(() => {
      setPool(prev => prev.map(it => ({ ...it, t: timeAgo(it.pubDate) })));
    }, 60000);
    return () => clearInterval(id);
  }, []);

  const { leadStory, items } = useMemo(() => selectNews(pool, Date.now(), failedImgs), [pool, failedImgs]);

  const skipLead = useCallback((img) => {
    if (!img) return;
    setFailedImgs(prev => (prev.has(img) ? prev : new Set(prev).add(img)));
  }, []);

  return {
    items,
    leadStory,
    err,
    lastOk,
    interval: CONFIG.REFRESH_INTERVALS.news,
    refresh: resetRSS,
    skipLead,
  };
}
