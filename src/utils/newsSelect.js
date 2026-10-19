// Pure news selection for useRSS: which items are about Bitcoin, which one leads
// the slot under the chart, and what the news list shows.
//
// Items are useRSS's mapped shape: { feedKey, hed, cats, img, snippet, topic,
// audio, pubDate, ... }. feedKey is the RSS_FEED_MAP key, never the feed's own title.

// Outlets trusted to lead when they have a recent story with an image.
const LEAD_FEEDS = ['bitcoinMagazine', 'coindesk', 'newsBitcoin'];
// Never in the lead: Stacker News posts have no image and a "Comments"-only description.
const NEVER_LEAD_FEEDS = ['stackerNews'];
// Bitcoin-only by charter: every item passes the relevance filter.
const BITCOIN_ONLY_FEEDS = ['optech', 'nobsBitcoin'];

const LEAD_WINDOW_MS = 6 * 60 * 60 * 1000;
// A pubDate further ahead than this is a feed clock/timezone error, not a recent story.
const FUTURE_SKEW_MS = 10 * 60 * 1000;
const MIN_SNIPPET = 80;
const NEWS_CAP = 30;

const BITCOIN_WORDS = /\b(bitcoin\w*|btc|sats|satoshis?|lightning|mining|miners?|hashrate|hash rate|hashprice|asics?|halving|mempool|taproot|ordinals|saylor|microstrategy)\b/i;

function isBitcoinRelevant(it) {
  if (BITCOIN_ONLY_FEEDS.includes(it.feedKey)) return true;
  return BITCOIN_WORDS.test(it.hed || '') || (it.cats || []).some(c => BITCOIN_WORDS.test(c));
}

// By category or audio enclosure, not by feed: TFTC publishes articles too.
function isPodcast(it) {
  return Boolean(it.audio) || (it.cats || []).some(c => /podcast/i.test(c));
}

function pubTime(it) {
  const t = Date.parse(it.pubDate);
  return Number.isFinite(t) ? t : null;
}

// pool is sorted newest first.
function pickLead(pool, now = Date.now(), failedImgs = new Set()) {
  const eligible = pool.filter(it =>
    it.img && !failedImgs.has(it.img) && pubTime(it) != null &&
    !NEVER_LEAD_FEEDS.includes(it.feedKey) && it.topic !== 'PODCASTS' && !isPodcast(it));
  return (
    eligible.find(it => LEAD_FEEDS.includes(it.feedKey) &&
      now - pubTime(it) <= LEAD_WINDOW_MS && pubTime(it) - now <= FUTURE_SKEW_MS) ||
    eligible.find(it => (it.snippet || '').length >= MIN_SNIPPET) ||
    null
  );
}

function selectNews(pool, now = Date.now(), failedImgs = new Set()) {
  const leadStory = pickLead(pool, now, failedImgs);
  return { leadStory, items: pool.filter(it => it !== leadStory).slice(0, NEWS_CAP) };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isBitcoinRelevant, isPodcast, pickLead, selectNews, pubTime, LEAD_WINDOW_MS, NEWS_CAP,
  };
}
