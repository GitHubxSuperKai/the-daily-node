#!/usr/bin/env node
// Re-records the public-API fixtures for `npm run verify` (npm run verify:refresh-fixtures).
//
// Hand-run only, never in CI: it calls the live APIs once per endpoint and rewrites
// tests/e2e/fixtures/public/ and tests/e2e/fixtures/recorded-at.json. Review the diff
// before committing it -- this repo is public.
//
// What it records: each public endpoint the dashboard calls (the https origins in
// src/index.html's CSP connect-src), with the URLs the app builds. What it does to them:
//   - weather is recorded at 0,0, the app default (src/config.js), never a real place,
//     and the coordinates Open-Meteo echoes back (snapped to its grid) are set to 0;
//   - rss2json responses keep 5 items with short fields, and never the article body;
//   - every image URL becomes https://img.invalid/placeholder.png;
//   - a non-2xx or error-shaped answer (a rate limit, say) aborts the run before any
//     file is written: a recorded error would fail every flow.
// What it never does: record the geocoding origin (any real search returns a real
// place; backend/geocoding.js is synthetic), or touch tests/e2e/fixtures/backend/.
//
// The URLs below repeat what src/ builds. tests/unit/verifyFixtures.test.js derives the
// app's requests from src/ and fails if a recorded match no longer answers one.
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.join(REPO_ROOT, 'tests', 'e2e', 'fixtures');
const PUBLIC_DIR = path.join(FIXTURES_DIR, 'public');
const RECORDED_AT = path.join(FIXTURES_DIR, 'recorded-at.json');

const PLACEHOLDER_IMAGE = 'https://img.invalid/placeholder.png';
const RSS_ITEMS = 5;
const RSS_DESCRIPTION_CHARS = 200;
const RSS_CATEGORIES = 5;

const KRAKEN = 'https://api.kraken.com/0/public';
const COINGECKO = 'https://api.coingecko.com/api/v3';
const MEMPOOL = 'https://mempool.space';

// src/utils/chartRange.js RANGES intervals (7d and 30d share 60).
const OHLC_INTERVALS = [1, 5, 60, 1440];

// src/config.js RSS_FEED_MAP entries with `on: true`: the feeds a default session asks
// rss2json for when /api/rss is unavailable.
const DEFAULT_FEEDS = [
  { key: 'bitcoinMagazine', url: 'https://bitcoinmagazine.com/.rss/full/' },
  { key: 'coindesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml' },
  { key: 'newsBitcoin', url: 'https://news.bitcoin.com/feed/' },
];

// src/hooks/useWeather.js, at the app default 0,0 and its default unit.
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0'
  + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,wind_gusts_10m,pressure_msl,dew_point_2m'
  + '&hourly=temperature_2m,weather_code,precipitation_probability,precipitation'
  + '&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,uv_index_max,wind_speed_10m_max'
  + '&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=2&timezone=auto';

const krakenOk = j => (Array.isArray(j.error) && j.error.length === 0 && j.result ? null : `kraken error ${JSON.stringify(j.error)}`);
const coingeckoOk = key => j => (j && j[key] && !j.status?.error_code ? null : `coingecko answered without ${key}: ${JSON.stringify(j.status || j).slice(0, 200)}`);
const rss2jsonOk = j => (j.status === 'ok' && Array.isArray(j.items) && j.items.length > 0 ? null : `rss2json status ${j.status}: ${j.message || ''}`);

// Each endpoint: `name` (file is public/<host>-<name>.js), `url`, optional `match` (the
// route glob; defaults to the exact URL), `check` (returns an error string or null) and
// `transform`. `url` may be a function of the bodies recorded before it.
const ENDPOINTS = [
  { name: 'ticker', url: `${KRAKEN}/Ticker?pair=XBTUSD`, check: krakenOk },
  ...OHLC_INTERVALS.map(i => ({ name: `ohlc-${i}`, url: `${KRAKEN}/OHLC?pair=XBTUSD&interval=${i}`, check: krakenOk })),
  {
    name: 'market-chart',
    url: `${COINGECKO}/coins/bitcoin/market_chart?vs_currency=usd&days=1&interval=hourly`,
    check: coingeckoOk('prices'),
  },
  {
    name: 'bitcoin',
    url: `${COINGECKO}/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`,
    check: coingeckoOk('market_data'),
  },
  { name: 'tip-height', url: `${MEMPOOL}/api/blocks/tip/height` },
  { name: 'hashrate-3d', url: `${MEMPOOL}/api/v1/mining/hashrate/3d` },
  { name: 'fees-recommended', url: `${MEMPOOL}/api/v1/fees/recommended` },
  { name: 'mempool', url: `${MEMPOOL}/api/mempool` },
  { name: 'difficulty-adjustment', url: `${MEMPOOL}/api/v1/difficulty-adjustment` },
  { name: 'pools-1w', url: `${MEMPOOL}/api/v1/mining/pools/1w` },
  {
    // useChain asks for the top pool's blocks; any slug gets the recorded answer.
    name: 'pool-blocks',
    url: recorded => `${MEMPOOL}/api/v1/mining/pool/${encodeURIComponent(recorded['pools-1w'].pools[0].slug)}/blocks`,
    match: `${MEMPOOL}/api/v1/mining/pool/*/blocks`,
  },
  { name: 'blocks', url: `${MEMPOOL}/api/v1/blocks` },
  { name: 'mempool-blocks', url: `${MEMPOOL}/api/v1/fees/mempool-blocks` },
  {
    name: 'forecast',
    url: WEATHER_URL,
    match: 'https://api.open-meteo.com/v1/forecast?*',
    check: j => (j.current && j.hourly && j.daily ? null : 'open-meteo answered without current/hourly/daily'),
    transform: j => ({ ...j, latitude: 0, longitude: 0 }),
  },
  ...DEFAULT_FEEDS.map(feed => ({
    name: feed.key,
    url: `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`,
    check: rss2jsonOk,
    transform: trimRss2json,
  })),
];

const stripHtml = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const imageOrEmpty = s => (s ? PLACEHOLDER_IMAGE : '');

// 5 items, short fields, no article body (rss2json's `content`) and no byline (`author`,
// which the dashboard does not read).
function trimRss2json(j) {
  return {
    status: j.status,
    feed: { ...j.feed, image: imageOrEmpty(j.feed && j.feed.image) },
    items: j.items.slice(0, RSS_ITEMS).map(it => {
      const enclosure = it.enclosure && it.enclosure.link
        ? { link: /^image\//.test(it.enclosure.type || '') ? PLACEHOLDER_IMAGE : it.enclosure.link, type: it.enclosure.type || '' }
        : {};
      return {
        title: it.title,
        pubDate: it.pubDate,
        link: it.link,
        guid: it.guid,
        thumbnail: imageOrEmpty(it.thumbnail),
        description: stripHtml(it.description).slice(0, RSS_DESCRIPTION_CHARS),
        enclosure,
        categories: (it.categories || []).slice(0, RSS_CATEGORIES),
      };
    }),
  };
}

// Any URL to an image file, anywhere in any string value.
const IMAGE_URL = /https?:\/\/[^\s"'<>]+?\.(?:png|jpe?g|gif|webp|svg|avif|ico)(?:\?[^\s"'<>]*)?(?=$|[\s"'<>])/gi;

function rewriteImages(value) {
  if (typeof value === 'string') return value.replace(IMAGE_URL, PLACEHOLDER_IMAGE);
  if (Array.isArray(value)) return value.map(rewriteImages);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewriteImages(v)]));
  }
  return value;
}

// JSON laid out for a reviewable diff: one key per line, and an array of plain values
// (a Kraken candle, a fee range) on one line.
function format(value, indent = '') {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every(v => v === null || typeof v !== 'object')) return `[${value.map(v => JSON.stringify(v)).join(', ')}]`;
    return `[\n${value.map(v => inner + format(v, inner)).join(',\n')}\n${indent}]`;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return '{}';
  return `{\n${keys.map(k => `${inner}${JSON.stringify(k)}: ${format(value[k], inner)}`).join(',\n')}\n${indent}}`;
}

function moduleSource({ url, match, contentType, json, text }) {
  const body = json === undefined ? JSON.stringify(text) : `JSON.stringify(${format(json, '  ')})`;
  return [
    `// Recorded by scripts/verify-refresh-fixtures.cjs from ${url}`,
    '// Do not edit by hand: rerun `npm run verify:refresh-fixtures` and review the diff.',
    'module.exports = {',
    `  match: ${JSON.stringify(match)},`,
    '  status: 200,',
    `  contentType: ${JSON.stringify(contentType)},`,
    `  body: ${body},`,
    '};',
    '',
  ].join('\n');
}

async function record(endpoint, recorded) {
  const url = typeof endpoint.url === 'function' ? endpoint.url(recorded) : endpoint.url;
  const match = endpoint.match || url;
  if (/[*{}\\]/.test(endpoint.match ? '' : url)) {
    throw new Error(`${url}: glob characters in a URL used as its own match; give it an explicit match`);
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const raw = await res.text();
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status} ${raw.slice(0, 200)}`);
  const contentType = (res.headers.get('content-type') || 'application/json').split(';')[0].trim();
  let json;
  try { json = JSON.parse(raw); } catch { json = undefined; }
  if (json === undefined && contentType === 'application/json') throw new Error(`${url}: body is not JSON`);
  const problem = endpoint.check && endpoint.check(json || {});
  if (problem) throw new Error(`${url}: ${problem}`);
  if (json !== undefined) {
    recorded[endpoint.name] = json;
    json = rewriteImages(endpoint.transform ? endpoint.transform(json) : json);
  }
  const file = `${new URL(url).hostname}-${endpoint.name}.js`;
  return { file, source: moduleSource({ url, match, contentType, json, text: json === undefined ? raw.trim() : undefined }) };
}

async function main() {
  const recorded = {};
  const outputs = [];
  // Sequential, one request per endpoint: kind to the free tiers, and later URLs can
  // depend on earlier bodies.
  for (const endpoint of ENDPOINTS) outputs.push(await record(endpoint, recorded));
  const recordedAt = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();

  // Everything fetched and checked; only now touch the disk.
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  const written = new Set(outputs.map(o => o.file));
  const removed = fs.readdirSync(PUBLIC_DIR).filter(f => f.endsWith('.js') && !written.has(f));
  for (const f of removed) fs.rmSync(path.join(PUBLIC_DIR, f));
  for (const { file, source } of outputs) fs.writeFileSync(path.join(PUBLIC_DIR, file), source);
  fs.writeFileSync(RECORDED_AT, `${JSON.stringify({ recordedAt }, null, 2)}\n`);

  const relPath = p => path.relative(REPO_ROOT, p).split(path.sep).join('/');
  console.log(`verify:refresh-fixtures: recorded ${outputs.length} endpoints at ${recordedAt}`);
  for (const { file } of outputs) console.log(`  wrote   ${relPath(path.join(PUBLIC_DIR, file))}`);
  for (const f of removed) console.log(`  removed ${relPath(path.join(PUBLIC_DIR, f))}`);
  console.log(`  wrote   ${relPath(RECORDED_AT)}`);
  console.log('review the diff before committing');
}

main().catch(err => {
  console.error(`verify:refresh-fixtures: ${err.message}`);
  console.error('Nothing was written.');
  process.exit(1);
});
