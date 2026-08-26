import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeProps, makeDownProps, makeMiner, makeOfflineMiner } from '../fixtures/dashboardProps.js';
import { useBTC } from '../../src/hooks/useBTC.js';
import { useChain } from '../../src/hooks/useChain.js';
import { useBitaxe } from '../../src/hooks/useBitaxe.js';
import { useWeather } from '../../src/hooks/useWeather.js';
import { useRSS } from '../../src/hooks/useRSS.js';
import { useClock } from '../../src/hooks/useClock.js';
import { useFeedHealth } from '../../src/hooks/useFeedHealth.js';
import { fmtMempoolMB, nextHalving, circulatingBTC } from '../../src/utils/formatting.js';

/**
 * Contract check for tests/fixtures/dashboardProps.js.
 *
 * The fixture claims every field is transcribed from the hook that produces it.
 * Two careful hand-audits of that claim still left nine wrong fields — mostly
 * wrong TYPES, which render as "$NaNT" or "SUPPLY19900000" without throwing, so
 * the suites that consume the fixture stayed green. This file replaces the audit
 * with a machine check.
 *
 * Method: run the REAL hooks against stubbed `fetch` responses shaped like the
 * upstream APIs, then diff the structural shape of each hook's return value
 * against the matching slot in makeProps() / makeDownProps(). Both directions are
 * checked, so a missing field and an invented one both fail. Chosen over a
 * hand-listed key/type table because a table is one more hand-written
 * transcription of the same hooks — the exact artifact that drifted.
 *
 * Two slots have no JS producer to drive and are handled separately at the bottom:
 * `bitaxe.miners[]`, whose shape comes from bitaxe_api.py plus the BitAxe firmware,
 * and `feedHealth`, which is derived from the fixture's own lastOk/interval values.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ─── Shape diffing ──────────────────────────────────────────────────────────

/**
 * Flatten a value into `dotted.path -> type tag`. Arrays are described by their
 * FIRST element (`path[0]`) — enough to catch a wrong element shape without
 * assuming a length.
 */
function shapeOf(value, prefix = '', out = new Map()) {
  if (value === null) {
    out.set(prefix, 'null');
  } else if (Array.isArray(value)) {
    out.set(prefix, 'array');
    if (value.length > 0) shapeOf(value[0], `${prefix}[0]`, out);
  } else if (typeof value === 'object') {
    out.set(prefix, 'object');
    for (const key of Object.keys(value)) {
      shapeOf(value[key], prefix ? `${prefix}.${key}` : key, out);
    }
  } else {
    out.set(prefix, typeof value);
  }
  return out;
}

/**
 * Diff two shapes. Returns human-readable problem strings, empty when they agree.
 *
 * Deliberate holes, both because the alternative is a false failure:
 *  - `null` on either side matches anything. Nullable fields (img, wxGusts,
 *    athDate) legitimately arrive as null from one side and a value from the other.
 *  - An EMPTY array on either side suppresses only the element comparison for that
 *    path; array-ness itself is still compared. `chartPts: []` in the fixture is
 *    real production state, so its element shape cannot be checked here.
 */
function diffShapes(actual, expected, { actualLabel, expectedLabel }) {
  const a = shapeOf(actual);
  const e = shapeOf(expected);
  const problems = [];

  const elementSuppressed = (p) => {
    const stem = p.replace(/\[0\](\..*)?$/, '');
    return stem !== p && (a.get(stem) === 'array' || e.get(stem) === 'array')
      && (!a.has(`${stem}[0]`) || !e.has(`${stem}[0]`));
  };

  for (const [p, type] of a) {
    if (e.has(p)) {
      const other = e.get(p);
      if (type !== other && type !== 'null' && other !== 'null') {
        problems.push(`${p}: ${actualLabel} is ${type}, ${expectedLabel} is ${other}`);
      }
    } else if (!elementSuppressed(p)) {
      problems.push(`${p}: present in ${actualLabel} (${type}), MISSING from ${expectedLabel}`);
    }
  }
  for (const [p, type] of e) {
    if (!a.has(p) && !elementSuppressed(p)) {
      problems.push(`${p}: present in ${expectedLabel} (${type}), NOT PRODUCED by ${actualLabel}`);
    }
  }
  return problems.sort();
}

function expectSameShape(hookResult, fixtureSlot, slot) {
  const problems = diffShapes(hookResult, fixtureSlot, {
    actualLabel: 'hook', expectedLabel: `fixture.${slot}`,
  });
  expect(problems, `${slot} fixture drifted from its hook:\n  ${problems.join('\n  ')}`).toEqual([]);
}

// ─── Stubbed upstream payloads ──────────────────────────────────────────────

const ok = (body) => ({ ok: true, json: async () => body });
const NOW = Date.now();
const NOW_SEC = Math.floor(NOW / 1000);
const iso = (msFromNow) => new Date(NOW + msFromNow).toISOString().slice(0, 16);

const KRAKEN = ok({
  error: [],
  result: {
    XXBTZUSD: {
      c: ['78408.0', '0.5'], o: '78510.4', v: ['1000', '14200'],
      h: ['79000', '79923'], l: ['78000', '77850'], p: ['77900', '78000'],
    },
  },
});

const CG_CHART = ok({
  prices: [[NOW - 7200_000, 77000], [NOW - 3600_000, 78000], [NOW, 78408]],
  market_caps: [[NOW - 3600_000, 1.55e12], [NOW, 1.56e12]],
});

const CG_META = ok({
  market_data: {
    ath: { usd: 109_350 },
    ath_date: { usd: '2025-01-20T09:14:32.000Z' },
    circulating_supply: 19_900_000,
  },
});

// Open-Meteo needs 2 forecast days (wxSunriseTomorrow) and >=8 hourly slots at or
// after "now" (useWeather seeks the first future entry, then takes 8).
const OPEN_METEO = ok({
  current: {
    temperature_2m: 75.2, apparent_temperature: 73.8, weather_code: 3,
    wind_speed_10m: 8.1, wind_direction_10m: 315, relative_humidity_2m: 62,
    wind_gusts_10m: 18.4, pressure_msl: 1013.2, dew_point_2m: 55.1,
  },
  hourly: {
    time: Array.from({ length: 12 }, (_, i) => iso(i * 3600_000)),
    temperature_2m: Array.from({ length: 12 }, (_, i) => 70 + i),
    weather_code: Array.from({ length: 12 }, () => 3),
    precipitation_probability: Array.from({ length: 12 }, () => 0),
    precipitation: Array.from({ length: 12 }, () => 0),
  },
  daily: {
    temperature_2m_max: [79.4, 81.0], temperature_2m_min: [61.2, 62.5],
    sunrise: [`${iso(0).slice(0, 10)}T06:12`, `${iso(86_400_000).slice(0, 10)}T06:13`],
    sunset: [`${iso(0).slice(0, 10)}T19:44`, `${iso(86_400_000).slice(0, 10)}T19:43`],
    precipitation_sum: [0, 0.2], uv_index_max: [6.1, 7.4], wind_speed_10m_max: [14.2, 16.0],
  },
});

// rss2json: two items per feed so leadStory (all[0]) and items (all.slice(1)) are
// both populated regardless of how many feeds CONFIG lists. Headlines and pubDates
// are unique per feed — identical stubs across feeds would make the lead story a
// duplicate of an item and mask useRSS's positional split.
const rssFeedIds = new Map();
function rss2json(url) {
  const feed = new URL(String(url)).searchParams.get('rss_url') || String(url);
  if (!rssFeedIds.has(feed)) rssFeedIds.set(feed, rssFeedIds.size);
  const n = rssFeedIds.get(feed);
  const at = (offsetMin) => new Date(NOW - offsetMin * 60_000).toUTCString();
  return ok({
    status: 'ok',
    feed: { title: `Feed ${n}` },
    items: [
      {
        title: `Feed ${n} lead`, pubDate: at(n * 10), link: `https://example.com/${n}/lead`,
        categories: ['BTC'], thumbnail: `https://example.com/${n}/lead.jpg`,
        description: `<p>Feed ${n} lead snippet.</p>`,
      },
      {
        title: `Feed ${n} second`, pubDate: at(n * 10 + 5), link: `https://example.com/${n}/2`,
        categories: ['BTC'], thumbnail: '', description: `<p>Feed ${n} second snippet.</p>`,
      },
    ],
  });
}

function mempoolRouter(url) {
  const u = String(url);
  if (u.includes('/api/blocks/tip/height')) return ok(900_000);
  if (u.includes('/api/v1/mining/hashrate/3d')) return ok({ currentHashrate: 6e20, currentDifficulty: 1.1e14 });
  if (u.includes('/api/v1/fees/recommended')) return ok({ fastestFee: 30, halfHourFee: 18, economyFee: 5 });
  if (u.includes('/api/v1/fees/mempool-blocks')) {
    return ok([{ nTx: 3100, medianFee: 22.4, feeRange: [2, 45, 91] }]);
  }
  if (u.includes('/api/v1/difficulty-adjustment')) {
    return ok({
      progressPercent: 59.7, difficultyChange: 1.8, previousRetarget: -0.9,
      remainingBlocks: 812, timeAvg: 600_000, difficulty: 1.1e14,
      estimatedRetargetDate: NOW + 480_000_000,
    });
  }
  if (u.includes('/api/v1/mining/pools/1w')) {
    return ok({ blockCount: 146, pools: [{ name: 'Foundry USA', slug: 'foundryusa', blockCount: 42 }] });
  }
  if (u.includes('/api/v1/mining/pool/') && u.includes('/blocks')) {
    return ok([{ height: 899_998, timestamp: NOW_SEC - 1800, tx_count: 3100 }]);
  }
  if (u.includes('/api/v1/blocks')) {
    return ok([{
      height: 900_000, timestamp: NOW_SEC - 300, tx_count: 3421, size: 1_480_000, weight: 3_992_000,
      extras: { medianFee: 21.4, totalFees: 12_400_000, feeRange: [1, 40, 84], pool: { name: 'Foundry USA' } },
    }]);
  }
  // fetchChainStats' mempool call — must not swallow the two paths above.
  if (u.includes('/api/mempool')) return ok({ count: 18_400, vsize: 50_000_000, total_fee: 100_000 });
  return ok({});
}

function routeAll(url) {
  const u = String(url);
  if (u.includes('api.kraken.com')) return KRAKEN;
  if (u.includes('/market_chart')) return CG_CHART;
  if (u.includes('api.coingecko.com/api/v3/coins/bitcoin')) return CG_META;
  if (u.includes('api.open-meteo.com')) return OPEN_METEO;
  if (u.includes('api.rss2json.com')) return rss2json(u);
  if (u.includes('/api/miners')) return ok({ miners: [] });
  return mempoolRouter(u);
}

function stubHealthy() {
  global.fetch = vi.fn().mockImplementation((url) => Promise.resolve(routeAll(url)));
}

function stubDown() {
  global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
}

// ─── Hook-driven slots ──────────────────────────────────────────────────────

describe('fixture contract — healthy dashboard (makeProps)', () => {
  beforeEach(() => { stubHealthy(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('btc matches useBTC', async () => {
    const { result } = renderHook(() => useBTC());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.data?.cap).not.toBeNull());
    await waitFor(() => expect(result.current.data?.ath).not.toBeNull());

    expectSameShape(result.current, makeProps().btc, 'btc');
  });

  it('chain matches useChain', async () => {
    const { result } = renderHook(() => useChain({}));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.pools.length).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.topPoolBlocks.length).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.mempoolBlocks.length).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.recentBlocks.length).toBeGreaterThan(0));

    expectSameShape(result.current, makeProps().chain, 'chain');
  });

  it('weather matches useWeather', async () => {
    const { prefs } = makeProps();
    const { result } = renderHook(() => useWeather(prefs.lat, prefs.lng, prefs.tempUnit));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expectSameShape(result.current, makeProps().weather, 'weather');
  });

  it('weather.data.hourly slots match useWeather', async () => {
    const { prefs } = makeProps();
    const { result } = renderHook(() => useWeather(prefs.lat, prefs.lng, prefs.tempUnit));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    // Guards the count the fixture hard-codes: 8 slots, not "some".
    expect(result.current.data.hourly).toHaveLength(makeProps().weather.data.hourly.length);
  });

  it('rss matches useRSS', async () => {
    const { result } = renderHook(() => useRSS());
    await waitFor(() => expect(result.current.leadStory).not.toBeNull());
    await waitFor(() => expect(result.current.items.length).toBeGreaterThan(0));

    expectSameShape(result.current, makeProps().rss, 'rss');
  });

  it('rss.leadStory is disjoint from rss.items, as useRSS produces it', async () => {
    const { result } = renderHook(() => useRSS());
    await waitFor(() => expect(result.current.leadStory).not.toBeNull());
    expect(result.current.items.map(i => i.hed)).not.toContain(result.current.leadStory.hed);

    const { rss } = makeProps();
    expect(rss.items.map(i => i.hed)).not.toContain(rss.leadStory.hed);
  });

  it('bitaxe envelope matches useBitaxe', async () => {
    const { result } = renderHook(() => useBitaxe());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // miners[] is server passthrough, so only the envelope is hook-derived here;
    // the per-miner shape is checked against bitaxe_api.py below.
    expectSameShape(
      { ...result.current, miners: [] },
      { ...makeProps().bitaxe, miners: [] },
      'bitaxe',
    );
  });

  it('clock matches useClock', () => {
    const { prefs } = makeProps();
    const { result } = renderHook(() => useClock(prefs.timeFormat));
    expectSameShape(result.current, makeProps().clock, 'clock');
  });

  it('clock strings match the formats useClock emits', () => {
    const { clock } = makeProps();
    // A ':30' seconds unit read as '30', or a fabricated `dateLong`, blanks the
    // sidebar date line without throwing.
    expect(clock.timeSec).toMatch(/^:\d{2}$/);
    expect(clock.timeHM).toMatch(/^\d{1,2}:\d{2}$/);
    expect(clock.dateShort).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(clock.dayStr).toMatch(/^[A-Z][a-z]+day, [A-Z][a-z]+ \d{1,2}$/);
  });
});

describe('fixture contract — every source down (makeDownProps)', () => {
  beforeEach(() => { stubDown(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('btc matches useBTC with fetch failing', async () => {
    const { result } = renderHook(() => useBTC());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expectSameShape(result.current, makeDownProps().btc, 'btc (down)');
  });

  it('chain matches useChain with fetch failing', async () => {
    const { result } = renderHook(() => useChain({}));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expectSameShape(result.current, makeDownProps().chain, 'chain (down)');
  });

  it('weather matches useWeather with fetch failing', async () => {
    const { prefs } = makeProps();
    const { result } = renderHook(() => useWeather(prefs.lat, prefs.lng, prefs.tempUnit));
    await waitFor(() => expect(result.current.err).toBe(true));
    expectSameShape(result.current, makeDownProps().weather, 'weather (down)');
  });

  it('rss matches useRSS with fetch failing', async () => {
    const { result } = renderHook(() => useRSS());
    await waitFor(() => expect(result.current.err).toBe(true));
    expectSameShape(result.current, makeDownProps().rss, 'rss (down)');
  });

  it('bitaxe matches useBitaxe with fetch failing', async () => {
    const { result } = renderHook(() => useBitaxe());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expectSameShape(result.current, makeDownProps().bitaxe, 'bitaxe (down)');
  });

  it('down props keep the error flags hooks actually set — booleans, not strings', () => {
    const down = makeDownProps();
    expect(down.btc.error).toBe(true);
    expect(down.chain.error).toBe(true);
    expect(down.weather.err).toBe(true);
    expect(down.rss.err).toBe(true);
    expect(down.bitaxe.err).toBe(true);
  });
});

// ─── Slots with no JS producer ──────────────────────────────────────────────

describe('fixture contract — miner shape', () => {
  it('miner envelopes match the keys bitaxe_api.py emits', () => {
    const py = fs.readFileSync(path.join(ROOT, 'bitaxe_api.py'), 'utf8');
    const start = py.indexOf('def fetch_miner(');
    const end = py.indexOf('def fetch_all_miners(');
    expect(start, 'fetch_miner not found in bitaxe_api.py').toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const emitted = [...py.slice(start, end).matchAll(/return \{([^}]*)\}/g)]
      .map(m => [...m[1].matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'\s*:/g)].map(k => k[1]).sort());
    // One return for the online path, one for the failure path.
    expect(emitted).toHaveLength(2);

    const online = emitted.find(keys => keys.includes('data'));
    const offline = emitted.find(keys => keys.includes('error'));
    expect(Object.keys(makeMiner()).sort()).toEqual(online);
    expect(Object.keys(makeOfflineMiner()).sort()).toEqual(offline);
  });

  it('miner.data carries exactly the fields production reads', () => {
    // The BitAxe firmware is the producer, so the contract is defined from the
    // consumer side: every field the miner components read must exist, and the
    // fixture must not invent one nothing reads.
    const files = [
      'src/components/MinerRow.jsx',
      'src/components/FleetSummary.jsx',
      'src/components/mobile/MinersPanel.jsx',
    ];
    // `md` is MinerRow's local alias for miner.data; anchoring on the receiver
    // keeps chain.data/btc.data reads in the same files out of the set.
    const patterns = [
      /\b(?:m|miner)\.data\??\.([A-Za-z_$][\w$]*)/g,
      /\bmd\??\.([A-Za-z_$][\w$]*)/g,
    ];
    // Firmware alternates production tolerates but the fixture need not model:
    // MinerRow/FleetSummary fall back to `temperature` when `temp` is absent.
    const ALTERNATES = new Set(['temperature']);

    const read = new Set();
    for (const rel of files) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      for (const re of patterns) {
        for (const m of src.matchAll(re)) read.add(m[1]);
      }
    }
    expect(read.size, 'no miner.data reads found — did the components move?').toBeGreaterThan(5);
    for (const alt of ALTERNATES) read.delete(alt);

    expect(Object.keys(makeMiner().data).sort()).toEqual([...read].sort());
  });

  it('makeMiner merges data overrides instead of discarding the defaults', () => {
    const m = makeMiner({ data: { temp: 71 } });
    expect(m.data.temp).toBe(71);
    expect(m.data.hostname).toBe(makeMiner().data.hostname);
  });

  it('makeMiner drops a field set to undefined, modelling firmware that omits it', () => {
    const m = makeMiner({ data: { uptimeSeconds: undefined } });
    expect('uptimeSeconds' in m.data).toBe(false);
    expect(m.data.hashRate).toBe(makeMiner().data.hashRate);
  });
});

describe('fixture contract — derived values inside the right type', () => {
  // A shape diff sees `mempoolMB: '50.0'` and `mempoolMB: '50.0 MB'` as identical:
  // both strings. These fields are computed by real formatters from other fields
  // the fixture already carries, so they can be recomputed and compared exactly.
  const { data } = makeProps().chain;

  it('chain.data.mempoolMB is fmtMempoolMB of its own mempoolBytes, unit included', () => {
    expect(data.mempoolMB).toBe(fmtMempoolMB(data.mempoolBytes));
  });

  it('chain.data.circulating is circulatingBTC of its own height', () => {
    expect(data.circulating).toBe(circulatingBTC(data.height));
  });

  it('chain.data.nextHalvingDate is nextHalving of its own height', () => {
    expect(data.nextHalvingDate).toBe(nextHalving(data.height));
  });

  it('chain.pools[].sharePct keeps the one-decimal string toFixed(1) produces', () => {
    for (const pool of makeProps().chain.pools) {
      expect(pool.sharePct).toMatch(/^\d+\.\d$/);
    }
  });

  it('btc.data.athDate is a full CoinGecko timestamp, not a date-only string', () => {
    // A date-only '2025-01-20' round-trips to '2025-01-20T00:00:00.000Z' and would
    // render a wrong ATH time without ever throwing.
    const { athDate } = makeProps().btc.data;
    expect(new Date(athDate).toISOString()).toBe(athDate);
  });

  it('chain timestamps stay in seconds, the unit mempool.space returns', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const seconds = [
      data.previousRetargetDate,
      ...makeProps().chain.topPoolBlocks.map(b => b.timestamp),
      ...makeProps().chain.recentBlocks.map(b => b.timestamp),
    ];
    // Milliseconds would land ~1000x above this bound.
    for (const t of seconds) expect(t).toBeLessThan(nowSec * 2);
    // estimatedRetargetDate is the one field mempool.space returns in ms.
    expect(data.estimatedRetargetDate).toBeGreaterThan(nowSec * 100);
  });
});

describe('fixture contract — feedHealth', () => {
  const feedsOf = (p) => [p.btc, { ...p.chain, contentStale: p.chain.stale }, p.weather, p.rss, p.bitaxe];

  it('makeProps feeds actually produce its declared feedHealth', () => {
    const props = makeProps();
    const { result } = renderHook(() => useFeedHealth(feedsOf(props)));
    expect(result.current).toBe(props.feedHealth);
  });

  it('makeDownProps feeds actually produce its declared feedHealth', () => {
    const props = makeDownProps();
    const { result } = renderHook(() => useFeedHealth(feedsOf(props)));
    expect(result.current).toBe(props.feedHealth);
  });
});
