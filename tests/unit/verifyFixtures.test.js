// Contract test for the `npm run verify` fixtures under tests/e2e/fixtures/.
//
// Every fixture module is self-registering: tests/e2e/fixtures/load.js collects each
// module under public/ (recorded by scripts/verify-refresh-fixtures.cjs) and backend/
// (hand-written synthetic data), and the harness routes requests to them. This file
// checks four things the harness cannot check for itself:
//   1. every module has the { match, status, contentType, body } shape;
//   2. load.js refuses a duplicate `match` and a catch-all `match`, either of which
//      would silently shadow other data or the harness's unstubbed-request guard;
//   3. every request the app makes is answered by some fixture, judged by Playwright's
//      own glob matcher, and every public origin in the page CSP has such a request,
//      so a new origin added to connect-src fails here first;
//   4. the repo is public, so no fixture carries a real address or location.
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import FIXTURES, { loadFixtures, isCatchAll } from '../e2e/fixtures/load.js';
import CONFIG from '../../src/config.js';
import { RANGES } from '../../src/utils/chartRange.js';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURES_DIR = path.join(REPO_ROOT, 'tests', 'e2e', 'fixtures');
const MODULE_DIRS = ['public', 'backend'].map(d => path.join(FIXTURES_DIR, d));

// Playwright's own route matcher, so this test judges a glob exactly as context.route()
// will. It is internal API (exported from playwright-core/lib/coreBundle under `iso`),
// pinned by the exact @playwright/test version in package.json; if an upgrade moves it,
// the guard below fails loudly rather than letting the coverage check pass vacuously.
const { urlMatches } = require('playwright-core/lib/coreBundle').iso;

const BASE_URL = 'http://127.0.0.1:4173';

const moduleFiles = () => MODULE_DIRS.flatMap(dir => (fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f))
  : []));

function allFixtureFiles(dir = FIXTURES_DIR) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? allFixtureFiles(full) : [full];
  });
}

const rel = file => path.relative(REPO_ROOT, file).split(path.sep).join('/');

// ─── 1. shape ────────────────────────────────────────────────────────────────

describe('fixture modules', () => {
  it('there are recorded and synthetic modules to check', () => {
    for (const dir of MODULE_DIRS) {
      expect(fs.readdirSync(dir).filter(f => f.endsWith('.js')).length, rel(dir)).toBeGreaterThan(0);
    }
  });

  it('every module exports match, status, contentType and body', () => {
    for (const file of moduleFiles()) {
      const mod = require(file);
      expect(Object.keys(mod).sort(), rel(file)).toEqual(['body', 'contentType', 'match', 'status']);
      expect(typeof mod.match === 'string' && mod.match.length > 0, `${rel(file)} match`).toBe(true);
      expect(Number.isInteger(mod.status), `${rel(file)} status`).toBe(true);
      expect(typeof mod.contentType === 'string' && mod.contentType.length > 0, `${rel(file)} contentType`).toBe(true);
      expect(typeof mod.body, `${rel(file)} body`).toBe('string');
    }
  });

  it('load.js default-exports every module, sorted by file path', () => {
    const files = moduleFiles().map(rel).sort();
    expect(FIXTURES.length).toBe(files.length);
    expect(FIXTURES).toEqual(files.map(f => require(path.join(REPO_ROOT, f))));
  });

  it('recorded-at.json holds the recording time as an ISO instant', () => {
    const { recordedAt } = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'recorded-at.json'), 'utf8'));
    expect(typeof recordedAt).toBe('string');
    expect(new Date(recordedAt).toISOString()).toBe(recordedAt);
  });
});

// ─── 2. load.js refuses shadowing patterns ───────────────────────────────────

describe('load.js guards', () => {
  const tmpDirs = [];
  afterAll(() => {
    for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  // A directory of fixture modules, one per { name: match } entry.
  function fixtureDir(entries) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dn-verify-fixtures-'));
    tmpDirs.push(dir);
    for (const [name, match] of Object.entries(entries)) {
      fs.writeFileSync(path.join(dir, `${name}.js`), `module.exports = ${JSON.stringify({
        match, status: 200, contentType: 'text/plain', body: name,
      })};\n`);
    }
    return dir;
  }

  it('loads distinct, specific patterns in file-path order', () => {
    const dir = fixtureDir({ b: '**/api/miners', a: 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD' });
    expect(loadFixtures([dir]).map(f => f.body)).toEqual(['a', 'b']);
  });

  it('throws on two modules with the same match, naming both files', () => {
    const dir = fixtureDir({ one: '**/api/miners', two: '**/api/miners' });
    expect(() => loadFixtures([dir])).toThrow(/one\.js[\s\S]*two\.js/);
  });

  it('throws on a duplicate match across directories', () => {
    const a = fixtureDir({ one: '**/api/firmware' });
    const b = fixtureDir({ two: '**/api/firmware' });
    expect(() => loadFixtures([a, b])).toThrow(/same match/);
  });

  it.each(['**', '**/*', '*', 'http*://**', 'https://**', '**/**', '**/?*', '{**,*}', '**/*/*'])(
    'throws on the catch-all match %s', match => {
      expect(isCatchAll(match)).toBe(true);
      const dir = fixtureDir({ wide: match });
      expect(() => loadFixtures([dir])).toThrow(/catch-all/);
    },
  );

  it.each([
    '**/v1/search?*',
    '**/api/miners',
    '**:3002/history/*',
    'https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=60',
    'https://mempool.space/api/v1/mining/pool/*/blocks',
    'https://api.open-meteo.com/v1/forecast?*',
  ])('accepts the specific match %s', match => {
    expect(isCatchAll(match)).toBe(false);
  });

  it('throws on a module missing a field', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dn-verify-fixtures-'));
    tmpDirs.push(dir);
    fs.writeFileSync(path.join(dir, 'bad.js'), 'module.exports = { match: "**/api/x", status: 200, body: "" };\n');
    expect(() => loadFixtures([dir])).toThrow(/bad\.js/);
  });
});

// ─── 3. coverage ─────────────────────────────────────────────────────────────

// The public origins the page may call: https entries of the CSP connect-src without a
// wildcard (the localhost backends and http://*:3002 are covered by the same-origin and
// history samples below). Parsed here rather than shared with the harness, so this test
// does not trust the code it checks.
function cspHttpsOrigins() {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'src', 'index.html'), 'utf8');
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html);
  expect(csp, 'src/index.html has a CSP meta tag').not.toBeNull();
  const directive = csp[1].split(';').map(d => d.trim()).find(d => d.startsWith('connect-src '));
  expect(directive, 'the CSP has a connect-src directive').toBeTruthy();
  return directive.split(/\s+/).slice(1)
    .filter(s => s.startsWith('https://') && !s.includes('*'))
    .map(s => new URL(s).origin);
}

const MEMPOOL_PATHS = [
  '/api/blocks/tip/height',
  '/api/v1/mining/hashrate/3d',
  '/api/v1/fees/recommended',
  '/api/mempool',
  '/api/v1/difficulty-adjustment',
  '/api/v1/mining/pools/1w',
  '/api/v1/mining/pool/samplepool/blocks',
  '/api/v1/blocks',
  '/api/v1/fees/mempool-blocks',
];

// One URL per request the app makes with default prefs, enumerated from src/ (hooks/
// and utils/api.js). Parameters the app derives from src/ are derived the same way here,
// so a new chart interval or a new default feed fails this test.
function appRequestUrls() {
  const intervals = [...new Set(Object.values(RANGES).map(r => r.interval))];
  return [
    'https://api.kraken.com/0/public/Ticker?pair=XBTUSD',
    ...intervals.map(i => `${CONFIG.KRAKEN_OHLC}${i}`),
    'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1&interval=hourly',
    'https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false',
    ...MEMPOOL_PATHS.map(p => `https://mempool.space${p}`),
    `https://api.open-meteo.com/v1/forecast?latitude=${CONFIG.WEATHER_LAT}&longitude=${CONFIG.WEATHER_LNG}&current=temperature_2m&temperature_unit=fahrenheit&timezone=auto`,
    'https://geocoding-api.open-meteo.com/v1/search?name=Paris&count=5&language=en&format=json',
    ...CONFIG.RSS_FEEDS.map(f => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(f.url)}`),
    `${BASE_URL}/api/miners`,
    `${BASE_URL}/api/firmware`,
    `${BASE_URL}/api/setup`,
    ...CONFIG.RSS_FEEDS.map(f => `${BASE_URL}/api/rss?feed=${encodeURIComponent(f.key)}`),
    ...MEMPOOL_PATHS.map(p => `${BASE_URL}/api/mempool-proxy?base=${encodeURIComponent('https://192.0.2.50:4080')}&path=${encodeURIComponent(p)}`),
    'http://127.0.0.1:3002/history/price?from=1794800000&to=1794886400&bucket=min',
  ];
}

describe('fixture coverage', () => {
  it("Playwright's matcher is reachable (otherwise every check below is vacuous)", () => {
    expect(typeof urlMatches).toBe('function');
    expect(urlMatches(BASE_URL, 'https://a.example/x?y=1', '**/x?y=1')).toBe(true);
    expect(urlMatches(BASE_URL, 'https://a.example/x?y=1', '**/z')).toBe(false);
  });

  it('every request the app makes is answered by a fixture', () => {
    const unanswered = appRequestUrls()
      .filter(url => !FIXTURES.some(f => urlMatches(BASE_URL, url, f.match)));
    expect(unanswered).toEqual([]);
  });

  it('every public origin in the connect-src has an answered request', () => {
    const origins = cspHttpsOrigins();
    expect(origins.length).toBeGreaterThan(0);
    const covered = new Set(appRequestUrls().map(u => new URL(u).origin));
    expect(origins.filter(o => !covered.has(o))).toEqual([]);
  });

  it('the coverage check fails for an origin with no fixture (positive control)', () => {
    expect(FIXTURES.some(f => urlMatches(BASE_URL, 'https://api.example.invalid/v1/x', f.match))).toBe(false);
  });
});

// ─── 4. nothing private ──────────────────────────────────────────────────────

// Dotted quads other than the RFC 5737 documentation range and loopback.
function forbiddenIps(text) {
  return [...text.matchAll(/(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?![\d.])/g)]
    .map(m => m[0])
    .filter(ip => !/^192\.0\.2\.\d{1,3}$/.test(ip) && ip !== '127.0.0.1');
}

// A coordinate anywhere other than 0 (0.0 and -0.0 included). JSON keys and query
// parameters both, since a recorded body or a match glob could carry either.
function nonZeroCoordinates(text) {
  const pattern = /("(?:lat|lon|lng|latitude|longitude)"\s*:\s*|\b(?:lat|lon|lng|latitude|longitude)=)(-?[\d.]+)/g;
  return [...text.matchAll(pattern)]
    .filter(m => Number(m[2]) !== 0)
    .map(m => m[0]);
}

// Both scans over a fixture file's text and, for a module, over the body it serves.
// The body is what reaches the page, and a hand-written module may build it from a JS
// literal with unquoted keys (`latitude: 34.05`) that the text patterns cannot see;
// JSON.stringify output always quotes them. load.js (the only .js file directly under
// fixtures/) is code, not a module, and recorded-at.json is plain JSON.
function scanFixtureFile(file) {
  const texts = [fs.readFileSync(file, 'utf8')];
  if (file.endsWith('.js') && path.dirname(file) !== FIXTURES_DIR) texts.push(require(file).body);
  const unique = list => [...new Set(list)];
  return {
    ips: unique(texts.flatMap(forbiddenIps)),
    coordinates: unique(texts.flatMap(nonZeroCoordinates)),
  };
}

// Private addresses for the cases below, assembled at runtime so this file stays clean
// under scripts/check-secrets.cjs, which scans tests/ too.
const RFC1918_A = ['10', '1', '2', '3'].join('.');
const RFC1918_C = ['192', '168', '1', '20'].join('.');

describe('fixture privacy', () => {
  it.each([
    [RFC1918_A, [RFC1918_A]],
    [`{"ip":"${RFC1918_C}"}`, [RFC1918_C]],
    ['192.0.2.11 and 127.0.0.1', []],
    ['version 2.15.3 and 1.2.3.4.5', []],
  ])('forbiddenIps(%j)', (text, expected) => {
    expect(forbiddenIps(text)).toEqual(expected);
  });

  it.each([
    ['"latitude": 34.05', 1],
    ['"longitude":-118.24', 1],
    ['?lat=51.5&lon=0', 1],
    ['latitude=0.035', 1],
    ['"latitude": 0, "longitude": 0.0', 0],
    ['"latitude":-0.0,"longitude":0', 0],
    ['latitude=0&longitude=0', 0],
    ['"lat": 34.05', 1],
    ['?lng=-118.2', 1],
    ['"lng": 0', 0],
  ])('nonZeroCoordinates(%j)', (text, count) => {
    expect(nonZeroCoordinates(text)).toHaveLength(count);
  });

  // A hand-written module can spell a key unquoted (`latitude: 34.05`), which the text
  // patterns above do not see; its served `body` is JSON, where every key is quoted.
  describe('scanFixtureFile reads the served body too', () => {
    const tmpDirs = [];
    afterAll(() => {
      for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
    });

    function tempModule(source) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dn-verify-privacy-'));
      tmpDirs.push(dir);
      const file = path.join(dir, 'm.js');
      fs.writeFileSync(file, source);
      return file;
    }

    it('flags an unquoted non-zero coordinate in a module body', () => {
      const file = tempModule("module.exports = { match: '**/x', status: 200, contentType: 'application/json',\n"
        + '  body: JSON.stringify({ results: [{ latitude: 34.05, longitude: -118.24 }] }) };\n');
      expect(scanFixtureFile(file).coordinates).toHaveLength(2);
    });

    it('flags a private address assembled in a module body', () => {
      const file = tempModule("module.exports = { match: '**/x', status: 200, contentType: 'application/json',\n"
        + "  body: JSON.stringify({ ip: ['10', '1', '2', '3'].join('.') }) };\n");
      expect(scanFixtureFile(file).ips).toEqual([RFC1918_A]);
    });

    it('passes an unquoted zero coordinate', () => {
      const file = tempModule("module.exports = { match: '**/x', status: 200, contentType: 'application/json',\n"
        + '  body: JSON.stringify({ latitude: 0, longitude: 0 }) };\n');
      expect(scanFixtureFile(file)).toEqual({ ips: [], coordinates: [] });
    });
  });

  it('no fixture contains an IPv4 outside 192.0.2.0/24 or 127.0.0.1', () => {
    const hits = allFixtureFiles().flatMap(f => scanFixtureFile(f).ips.map(ip => `${rel(f)}: ${ip}`));
    expect(hits).toEqual([]);
  });

  it('no fixture contains a latitude or longitude other than 0', () => {
    const hits = allFixtureFiles().flatMap(f => scanFixtureFile(f).coordinates.map(c => `${rel(f)}: ${c}`));
    expect(hits).toEqual([]);
  });
});
