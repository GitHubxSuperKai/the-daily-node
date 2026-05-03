import { useState, useEffect, useCallback } from 'react';
import CONFIG from '../config.js';
import { useResettableInterval } from './useResettableInterval.js';


export function useRSS() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState(false);
  const [leadStory, setLeadStory] = useState(null);
  const [lastOk, setLastOk] = useState(null);

  const fetchRSS = useCallback(async () => {
    const key = CONFIG.RSS2JSON_KEY ? `&api_key=${CONFIG.RSS2JSON_KEY}` : '';
    const feeds = CONFIG.RSS_FEEDS || [];

    const results = await Promise.allSettled(
      feeds.map(async feedUrl => {
        const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}${key}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error('rss');
        const j = await r.json();
        if (j.status !== 'ok') throw new Error('rss-status');
        const src = j.feed.title || new URL(feedUrl).hostname;
        return j.items.map(it => ({
          cat: it.categories && it.categories[0] ? it.categories[0].toUpperCase().slice(0, 20) : 'BITCOIN',
          topic: classifyTopic(it.title),
          hed: it.title,
          src,
          pubDate: it.pubDate,
          t: timeAgo(it.pubDate),
          link: it.link,
          img:
            it.thumbnail ||
            (it.enclosure && it.enclosure.type && it.enclosure.type.startsWith('image/') ? it.enclosure.link : null) ||
            (it.description ? (it.description.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i) || [])[1] || null : null) ||
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
