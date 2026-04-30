// src/config.js
// Configuration module for The Daily Node Command Center
// Edit these values to match your setup

const CONFIG = {
  // ─── BitAxe API ───────────────────────────────────────
  // Set these to your local BitAxe API server and miner IPs
  // Leave empty to disable BitAxe monitoring
  // User customization via: Edit before build, or use in-app settings panel
  BITAXE_API_URL: '',
  BITAXE_IPS: [],

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
    price:   30000,        // BTC price every 30s
    chain:   60000,        // Chain vitals every 60s
    weather: 15 * 60 * 1000, // Weather every 15m
    news:    5 * 60 * 1000,  // News every 5m
    bitaxe:  10000,        // Miner stats every 10s
  },
};

const INTERVALS = {
  BTC:     CONFIG.REFRESH_INTERVALS.price,
  CHAIN:   CONFIG.REFRESH_INTERVALS.chain,
  BITAXE:  CONFIG.REFRESH_INTERVALS.bitaxe,
  WEATHER: CONFIG.REFRESH_INTERVALS.weather,
  RSS:     CONFIG.REFRESH_INTERVALS.news,
};

// ES6 export
export default CONFIG;

// CommonJS export (for Node.js testability, removed during build)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
