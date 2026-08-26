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
import { fmtMempoolMB, nextHalving, circulatingBTC, wmoDesc } from '../../src/utils/formatting.js';
import CONFIG from '../../src/config.js';
import { PREFS_DEFAULTS } from '../../src/utils/v2prefs.js';

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
 *
 * NOT covered, so do not read a green run as covering them: `dark`, `settingsOpen`
 * and the callback props, and `prefs`, whose producer is App.jsx's localStorage
 * read rather than a hook. `v2prefs` gets a key-set check only.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ─── Shape diffing ──────────────────────────────────────────────────────────

/**
 * Flatten a value into `dotted.path -> type tag`. EVERY element of an array folds
 * onto one `path[]` entry, so a field present on only the second element still
 * registers. A path carried by some but not all elements is tagged
 * `partial:<type>` — a plain union would let one element's missing `slug` hide
 * behind its sibling's. Where elements disagree on type, a null yields to a real
 * type (one nullable element must not erase the rest) but two real types produce a
 * `clash:` tag rather than silently picking the first.
 */
function shapeOf(value, prefix = '', out = new Map()) {
  if (value === null) {
    out.set(prefix, 'null');
  } else if (Array.isArray(value)) {
    out.set(prefix, 'array');
    const seen = new Map();
    for (const el of value) {
      for (const [p, type] of shapeOf(el, `${prefix}[]`)) {
        const prev = seen.get(p);
        if (!prev) { seen.set(p, { type, count: 1 }); continue; }
        // Keeping the first non-null type would make a wrong type on any later
        // element invisible, and order-dependent at that. Tag the disagreement
        // instead: a `clash:` tag can never equal the other side's single type,
        // so it always surfaces.
        const merged = prev.type === 'null' ? type
          : (type === 'null' || type === prev.type) ? prev.type
            : `clash:${[prev.type, type].sort().join('|')}`;
        seen.set(p, { type: merged, count: prev.count + 1 });
      }
    }
    for (const [p, { type, count }] of seen) {
      out.set(p, count === value.length ? type : `partial:${type}`);
    }
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
 * Two deliberate holes, both because the alternative is a false failure:
 *  - `null` on either side matches any type. Nullable fields (img, wxGusts,
 *    athDate) legitimately arrive as null from one side and a value from the
 *    other. `strict: true` closes this, and every down-state comparison uses it —
 *    with all sources failing, each field has exactly one correct value.
 *  - An EMPTY array suppresses the element comparison for that ONE path; array-ness
 *    itself is still compared. You cannot compare the elements of an array that has
 *    none, and `chartPts: []` is real production state. The stem is the immediate
 *    parent array, which means an empty INNER array stops being checked through its
 *    non-empty outer array — looser, not tighter, than taking the outermost stem.
 *    The non-empty assertions below are the backstop, and they reach `feeRange`
 *    only at element [0].
 */
function diffShapes(actual, expected, { actualLabel, expectedLabel, strict = false }) {
  const a = shapeOf(actual);
  const e = shapeOf(expected);
  const problems = [];

  const nullable = (x, y) => !strict && (x === 'null' || y === 'null');
  const elementSuppressed = (p) => {
    const stem = p.replace(/\[\][^[\]]*$/, '');
    return stem !== p && (a.get(stem) === 'array' || e.get(stem) === 'array')
      && (!a.has(`${stem}[]`) || !e.has(`${stem}[]`));
  };

  for (const [p, type] of a) {
    if (e.has(p)) {
      const other = e.get(p);
      if (type !== other && !nullable(type, other)) {
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

function expectSameShape(actual, fixtureSlot, slot, { strict = false, actualLabel = 'hook' } = {}) {
  const problems = diffShapes(actual, fixtureSlot, {
    actualLabel, expectedLabel: `fixture.${slot}`, strict,
  });
  expect(problems, `${slot} fixture drifted from its source:\n  ${problems.join('\n  ')}`).toEqual([]);
}

// ─── Stubbed upstream payloads ──────────────────────────────────────────────

const ok = (body) => ({ ok: true, json: async () => body });
const NOW = Date.now();
const NOW_SEC = Math.floor(NOW / 1000);

const pad = (n) => String(n).padStart(2, '0');
/**
 * Open-Meteo is called with `timezone=auto` and returns LOCAL wall-clock stamps
 * carrying no offset, which useWeather parses as local. Emitting UTC here would
 * put every slot in the past for any contributor east of UTC+3 and starve the
 * 8-slot window — so build these from local components, as the API does.
 */
function localStamp(msFromNow) {
  const d = new Date(NOW + msFromNow);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const localDay = (msFromNow) => localStamp(msFromNow).slice(0, 10);

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

// Needs 2 forecast days (wxSunriseTomorrow) and >=9 hourly slots from now, since
// useWeather seeks the first entry at or after now and then takes 8.
const OPEN_METEO = ok({
  current: {
    temperature_2m: 75.2, apparent_temperature: 73.8, weather_code: 3,
    wind_speed_10m: 8.1, wind_direction_10m: 315, relative_humidity_2m: 62,
    wind_gusts_10m: 18.4, pressure_msl: 1013.2, dew_point_2m: 55.1,
  },
  hourly: {
    time: Array.from({ length: 12 }, (_, i) => localStamp(i * 3600_000)),
    temperature_2m: Array.from({ length: 12 }, (_, i) => 70 + i),
    weather_code: Array.from({ length: 12 }, () => 3),
    precipitation_probability: Array.from({ length: 12 }, () => 0),
    precipitation: Array.from({ length: 12 }, () => 0),
  },
  daily: {
    temperature_2m_max: [79.4, 81.0], temperature_2m_min: [61.2, 62.5],
    sunrise: [`${localDay(0)}T06:12`, `${localDay(86_400_000)}T06:13`],
    sunset: [`${localDay(0)}T19:44`, `${localDay(86_400_000)}T19:43`],
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
    return ok({
      blockCount: 146,
      pools: [
        { name: 'Foundry USA', slug: 'foundryusa', blockCount: 42 },
        { name: 'AntPool', slug: 'antpool', blockCount: 31 },
      ],
    });
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

// `vi.restoreAllMocks` does not undo a bare `global.fetch = …` assignment, so stub
// through vi.stubGlobal and unstub in afterEach.
function stubHealthy() {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => Promise.resolve(routeAll(url))));
}

function stubDown() {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
}

function unstub() {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
}

// ─── Hook-driven slots ──────────────────────────────────────────────────────

describe('fixture contract — healthy dashboard (makeProps)', () => {
  beforeEach(() => { stubHealthy(); });
  afterEach(() => { unstub(); });

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

    // Applied to the hook's own output first, so these patterns are pinned to the
    // real producer rather than being one more hand transcription of it. A ':30'
    // seconds unit read as '30', or a fabricated `dateLong`, blanks the sidebar
    // date line without throwing.
    for (const clock of [result.current, makeProps().clock]) {
      expect(clock.timeSec).toMatch(/^:\d{2}$/);
      expect(clock.timeHM).toMatch(/^\d{1,2}:\d{2}$/);
      expect(clock.dateShort).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(clock.dayStr).toMatch(/^[A-Z][a-z]+day, [A-Z][a-z]+ \d{1,2}$/);
      expect(clock.amPm).toMatch(/^(AM|PM)$/);
    }
  });

  it('every fixture array except chartPts is non-empty, keeping element checks live', () => {
    // An empty array on either side suppresses its element comparison. chartPts is
    // the one slot where [] is real production state; anywhere else an empty array
    // would silently switch off a shape check that looks like it is running.
    const p = makeProps();
    const arrays = {
      'chain.pools': p.chain.pools,
      'chain.topPoolBlocks': p.chain.topPoolBlocks,
      'chain.recentBlocks': p.chain.recentBlocks,
      'chain.mempoolBlocks': p.chain.mempoolBlocks,
      'chain.recentBlocks[].feeRange': p.chain.recentBlocks[0]?.feeRange,
      'chain.mempoolBlocks[].feeRange': p.chain.mempoolBlocks[0]?.feeRange,
      'rss.items': p.rss.items,
      'bitaxe.miners': p.bitaxe.miners,
      'weather.data.hourly': p.weather.data.hourly,
    };
    for (const [name, arr] of Object.entries(arrays)) {
      expect(arr, `${name} is empty or missing — its element shape check is dead`)
        .toEqual(expect.arrayContaining([expect.anything()]));
    }
  });

  it('v2prefs carries the full PREFS_DEFAULTS key set App.jsx merges over', () => {
    // Only a key-set check: v2prefs has a real producer in v2prefs.js, but the
    // fixture deliberately overrides `theme`, so values cannot be compared.
    expect(Object.keys(makeProps().v2prefs).sort()).toEqual(Object.keys(PREFS_DEFAULTS).sort());
  });

  it('interval values match CONFIG, which feedHealth staleness is measured against', () => {
    const p = makeProps();
    expect(p.btc.interval).toBe(CONFIG.REFRESH_INTERVALS.price);
    expect(p.chain.interval).toBe(CONFIG.REFRESH_INTERVALS.chain);
    expect(p.weather.interval).toBe(CONFIG.REFRESH_INTERVALS.weather);
    expect(p.rss.interval).toBe(CONFIG.REFRESH_INTERVALS.news);
    expect(p.bitaxe.interval).toBe(CONFIG.REFRESH_INTERVALS.bitaxe);
  });
});

describe('fixture contract — every source down (makeDownProps)', () => {
  beforeEach(() => { stubDown(); });
  afterEach(() => { unstub(); });

  // Down-state comparisons run STRICT: with every source failing each field has
  // exactly one correct value, so the nullable escape hatch is not needed and
  // would only hide a fixture claiming a shape the hooks never reach.
  const strict = { strict: true };

  it('btc matches useBTC with fetch failing', async () => {
    const { result } = renderHook(() => useBTC());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expectSameShape(result.current, makeDownProps().btc, 'btc (down)', strict);
  });

  it('chain matches useChain with fetch failing', async () => {
    const { result } = renderHook(() => useChain({}));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expectSameShape(result.current, makeDownProps().chain, 'chain (down)', strict);
  });

  it('weather matches useWeather with fetch failing', async () => {
    const { prefs } = makeProps();
    const { result } = renderHook(() => useWeather(prefs.lat, prefs.lng, prefs.tempUnit));
    await waitFor(() => expect(result.current.err).toBe(true));
    expectSameShape(result.current, makeDownProps().weather, 'weather (down)', strict);
  });

  it('rss matches useRSS with fetch failing', async () => {
    const { result } = renderHook(() => useRSS());
    await waitFor(() => expect(result.current.err).toBe(true));
    expectSameShape(result.current, makeDownProps().rss, 'rss (down)', strict);
  });

  it('bitaxe matches useBitaxe with fetch failing', async () => {
    const { result } = renderHook(() => useBitaxe());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expectSameShape(result.current, makeDownProps().bitaxe, 'bitaxe (down)', strict);
  });

  it('every down-state array is empty, as the hooks leave them', () => {
    // The empty-array suppression fires from the HOOK side here, so without this
    // mirror of the makeProps assertion the down fixture could claim any element
    // shape it liked and nothing would compare it. strict mode does not help:
    // suppression is independent of it.
    const d = makeDownProps();
    const arrays = {
      'chain.pools': d.chain.pools,
      'chain.topPoolBlocks': d.chain.topPoolBlocks,
      'chain.recentBlocks': d.chain.recentBlocks,
      'chain.mempoolBlocks': d.chain.mempoolBlocks,
      'rss.items': d.rss.items,
      'bitaxe.miners': d.bitaxe.miners,
    };
    for (const [name, arr] of Object.entries(arrays)) {
      expect(arr, `${name} should be empty when every source is down`).toEqual([]);
    }
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
    // consumer side: every field any component reads must exist, and the fixture
    // must not invent one nothing reads.
    const components = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.js')) components.push(full);
      }
    };
    walk(path.join(ROOT, 'src/components'));

    // Anchoring on the receiver keeps chain.data/btc.data reads in these files out
    // of the set. `md` is MinerRow's local alias for miner.data, but the name is
    // generic — api.js already uses `md` for CoinGecko market_data — so it is only
    // honoured in a file that actually binds `md` from something's `.data`.
    const RECEIVER = /\b(?:m|miner)\.data\??\.([A-Za-z_$][\w$]*)/g;
    const MD_ALIAS = /\bmd\??\.([A-Za-z_$][\w$]*)/g;
    const BINDS_MD = /\bconst\s+md\s*=[^;\n]*\.data\b/;
    // Firmware alternates production tolerates but the fixture need not model:
    // MinerRow/FleetSummary fall back to `temperature` when `temp` is absent.
    const ALTERNATES = new Set(['temperature']);

    const read = new Set();
    for (const file of components) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(RECEIVER)) read.add(m[1]);
      if (BINDS_MD.test(src)) {
        for (const m of src.matchAll(MD_ALIAS)) read.add(m[1]);
      }
    }
    expect(read.size, 'no miner.data reads found — did the components move?').toBeGreaterThan(5);
    for (const alt of ALTERNATES) read.delete(alt);

    expect(Object.keys(makeMiner().data).sort()).toEqual([...read].sort());
  });

  it('makeProps().bitaxe.miners[0] is the pinned miner shape, not a hand-rolled one', () => {
    // The helper being correct does not help if the slot consumers actually receive
    // was built some other way.
    const miner = makeProps().bitaxe.miners[0];
    expect(miner).toBeDefined();
    expectSameShape(miner, makeMiner(), 'bitaxe.miners[0]', { strict: true, actualLabel: 'makeProps' });
  });

  it('miner fields carry the types the firmware sends, not just the right names', () => {
    // Every other miner check compares NAMES: the two above against bitaxe_api.py
    // and the component read-set, and makeProps().bitaxe.miners[0] against
    // makeMiner() — which cannot catch a type error, since one function builds both
    // sides. No JS producer exists to derive types from, so this table is
    // hand-written on purpose, for the same reason ALTERNATES is. It is paired with
    // the name assertion above so the two cannot drift apart: add a field there
    // without adding it here and this test fails.
    const miner = makeMiner();
    expect(typeof miner.ip).toBe('string');
    expect(typeof miner.online).toBe('boolean');
    expect(typeof makeOfflineMiner().error).toBe('string');

    const TYPES = {
      hostname: 'string', hashRate: 'number', power: 'number', temp: 'number',
      vrTemp: 'number', uptimeSeconds: 'number', sharesAccepted: 'number',
      sharesRejected: 'number', powerLimit: 'number',
    };
    expect(Object.keys(TYPES).sort()).toEqual(Object.keys(miner.data).sort());
    for (const [field, type] of Object.entries(TYPES)) {
      expect(typeof miner.data[field], `miner.data.${field}`).toBe(type);
    }
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

  it('weather.data.wxCond is wmoDesc of its own wxCode', () => {
    const wx = makeProps().weather.data;
    expect(wx.wxCond).toBe(wmoDesc(wx.wxCode));
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
  // Mirrors App.jsx's useFeedHealth call. If that call changes, this hand copy is
  // the thing to update — the feed list is not exported from App.jsx to import.
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
