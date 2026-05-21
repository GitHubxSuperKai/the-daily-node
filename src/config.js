// src/config.js
// Configuration module for The Daily Node Command Center
// Edit these values to match your setup

const CONFIG = {
  // ─── RSS Feeds ────────────────────────────────────────
  // Bitcoin news sources (all fetched and merged)
  RSS_FEEDS: [
    'https://bitcoinmagazine.com/.rss/full/',
    'https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml',
    'https://news.bitcoin.com/feed/',
  ],

  // ─── API & Network ────────────────────────────────────
  FETCH_TIMEOUT: 5000,
  // rss2json API key — free tier works without one, or get one at rss2json.com
  RSS2JSON_KEY: '',

  // ─── Weather ──────────────────────────────────────────
  // Your location for weather (decimal degrees)
  // User customization via: in-app location search or edit before build
  WEATHER_LAT: 0,
  WEATHER_LNG: 0,

  // ─── Refresh Intervals (milliseconds) ──────────────────
  REFRESH_INTERVALS: {
    clock:   1000,
    price:   30000,           // BTC price every 30s
    chart:   5 * 60 * 1000,   // CoinGecko 24h chart every 5m (hourly data)
    chain:   60000,           // Chain vitals every 60s
    weather: 15 * 60 * 1000,  // Weather every 15m
    news:    5 * 60 * 1000,   // News every 5m
    bitaxe:  30000,           // Miner stats every 30s
    pools:   5 * 60 * 1000,   // Mining pools + bitcoin meta every 5m
  },

  // ─── Content staleness thresholds (ms) ────────────────
  // A source can be reachable yet serving stale content. Flag chain data
  // when the latest block's timestamp is older than this (blocks avg ~10m;
  // 60m is conservative to avoid false "stale" flags).
  CONTENT_STALE: {
    chain: 60 * 60 * 1000,
  },

  // ─── Auto-Refresh ────────────────────────────────────
  // Minimum time a tab must be hidden before refocus triggers a full refresh
  HIDDEN_STALE_THRESHOLD: 30 * 1000,
  // Stagger between each hook's refresh call to avoid thundering herd
  REFRESH_STAGGER_MS: 100,
};

const INTERVALS = {
  BTC:     CONFIG.REFRESH_INTERVALS.price,
  CHART:   CONFIG.REFRESH_INTERVALS.chart,
  CHAIN:   CONFIG.REFRESH_INTERVALS.chain,
  BITAXE:  CONFIG.REFRESH_INTERVALS.bitaxe,
  WEATHER: CONFIG.REFRESH_INTERVALS.weather,
  RSS:     CONFIG.REFRESH_INTERVALS.news,
};

const RSS_FEED_MAP = [
  { key: 'bitcoinMagazine', url: 'https://bitcoinmagazine.com/.rss/full/' },
  { key: 'coindesk',        url: 'https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml' },
  { key: 'newsBitcoin',     url: 'https://news.bitcoin.com/feed/' },
];

// ES6 export
export default CONFIG;

// CommonJS export (for Node.js testability, removed during build)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
  module.exports.RSS_FEED_MAP = RSS_FEED_MAP;
}
