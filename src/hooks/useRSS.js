import { useState, useEffect, useCallback, useMemo } from 'react';
import CONFIG, { RSS_FEED_MAP } from '../config.js';
import { useResettableInterval } from './useResettableInterval.js';
import { classifyTopic, timeAgo, safeUrl } from '../utils/formatting.js';
import { parseFeedXml } from '../utils/feedXml.js';
import { isBitcoinRelevant, isPodcast, selectNews, pubTime } from '../utils/newsSelect.js';

// rss2json caps a feed at 10 items; the proxy path keeps that cap (applied after the
// Bitcoin filter) so one long feed can't crowd the column.
const PER_FEED_CAP = 10;

// Same-origin proxy in bitaxe_api.py: returns the feed's raw XML for a known key.
async function fetchViaProxy(key) {
  const r = await fetch(`/api/rss?feed=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(CONFIG.FETCH_TIMEOUT) });
  if (!r.ok) throw new Error('rss-proxy');
  return parseFeedXml(await r.text());
}

async function fetchViaRss2json(feedUrl) {
  const apiKey = CONFIG.RSS2JSON_KEY ? `&api_key=${CONFIG.RSS2JSON_KEY}` : '';
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}${apiKey}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(CONFIG.FETCH_TIMEOUT) });
  if (!r.ok) throw new Error('rss');
  const j = await r.json();
  if (j.status !== 'ok') throw new Error('rss-status');
  return { title: j.feed.title, items: j.items };
}

export function useRSS() {
  // Every Bitcoin-relevant item, newest first; lead and list are derived from it.
  const [pool, setPool] = useState([]);
  // Lead images that failed to load this session; pickLead skips their stories.
  const [failedImgs, setFailedImgs] = useState(() => new Set());
  const [err, setErr] = useState(false);
  const [lastOk, setLastOk] = useState(null);

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
        return j.items.map(it => {
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
            snippet: it.description
              ? it.description.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 1000)
              : '',
          };
          item.topic = isPodcast(item) ? 'PODCASTS' : classifyTopic(item.hed);
          return item;
        }).filter(isBitcoinRelevant).slice(0, PER_FEED_CAP);
      })
    );

    const all = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)
      // Undated items sort last.
      .sort((a, b) => (pubTime(b) ?? -Infinity) - (pubTime(a) ?? -Infinity));

    if (results.some(r => r.status === 'fulfilled')) {
      setPool(all);
      setErr(false);
      setLastOk(Date.now());
    } else {
      setErr(true);
    }
  }, []);

  const { reset: resetRSS } = useResettableInterval(fetchRSS, CONFIG.REFRESH_INTERVALS.news);

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
