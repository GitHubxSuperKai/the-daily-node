import { useState, useEffect, useCallback } from 'react';
import CONFIG from '../config.js';
import { useResettableInterval } from './useResettableInterval.js';
import { classifyTopic, timeAgo, safeUrl } from '../utils/formatting.js';
import { parseFeedXml } from '../utils/feedXml.js';

// Same-origin proxy in bitaxe_api.py: returns the feed's raw XML for a known key.
async function fetchViaProxy(key) {
  const r = await fetch(`/api/rss?feed=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(CONFIG.FETCH_TIMEOUT) });
  if (!r.ok) throw new Error('rss-proxy');
  const feed = parseFeedXml(await r.text());
  // rss2json caps a feed at 10 items; keep that so one long feed can't crowd the column.
  return { ...feed, items: feed.items.slice(0, 10) };
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
  const [items, setItems] = useState([]);
  const [err, setErr] = useState(false);
  const [leadStory, setLeadStory] = useState(null);
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
        const src = j.title || new URL(feed.url).hostname;
        return j.items.map(it => ({
          cat: it.categories && it.categories[0] ? it.categories[0].toUpperCase().slice(0, 20) : 'BITCOIN',
          topic: classifyTopic(it.title),
          hed: it.title,
          src,
          pubDate: it.pubDate,
          t: timeAgo(it.pubDate),
          link: safeUrl(it.link),
          img:
            safeUrl(it.thumbnail || null) ||
            (it.enclosure && it.enclosure.type && it.enclosure.type.startsWith('image/') ? safeUrl(it.enclosure.link) : null) ||
            (it.description ? safeUrl((it.description.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i) || [])[1] || null) : null) ||
            null,
          snippet: it.description
            ? it.description.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 1000)
            : '',
        }));
      })
    );

    const all = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    if (all.length > 0) {
      setLeadStory(all[0]);
      setItems(all.slice(1, 15));
      setErr(false);
      setLastOk(Date.now());
    } else {
      setErr(true);
    }
  }, []);

  const { reset: resetRSS } = useResettableInterval(fetchRSS, CONFIG.REFRESH_INTERVALS.news);

  // Refresh relative times every minute
  useEffect(() => {
    const id = setInterval(() => {
      setItems(prev => prev.map(it => ({ ...it, t: timeAgo(it.pubDate) })));
      setLeadStory(prev => prev ? { ...prev, t: timeAgo(prev.pubDate) } : prev);
    }, 60000);
    return () => clearInterval(id);
  }, []);

  return {
    items,
    leadStory,
    err,
    lastOk,
    interval: CONFIG.REFRESH_INTERVALS.news,
    refresh: resetRSS,
  };
}
