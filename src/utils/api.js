// ─── API Fetch Helpers ────────────────────────────────────────
// Extracted from Command Center.html (now index.html)
// All functions use fetch() with 5s timeout and sensible error handling

const FETCH_TIMEOUT = 5000;

/**
 * Fetch BTC price from Kraken
 * Returns: { price, open, chgAbs, chgPct, hi, lo, vwap, volBtc }
 */
async function fetchBTCPrice() {
  try {
    const r = await fetch('https://api.kraken.com/0/public/Ticker?pair=XBTUSD', {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!r.ok) throw new Error('kraken api not ok');
    const j = await r.json();
    if (j.error && j.error.length) throw new Error(j.error[0]);

    const t = j.result.XXBTZUSD;
    const price = parseFloat(t.c[0]);
    const open = parseFloat(t.o);
    const chgAbs = price - open;
    const chgPct = ((price - open) / open) * 100;
    const hi = parseFloat(t.h[1]);
    const lo = parseFloat(t.l[1]);
    const vwap = parseFloat(t.p[1]);
    const volBtc = parseFloat(t.v[1]);

    return { price, chgAbs, chgPct, hi, lo, vwap, volBtc };
  } catch (err) {
    console.error('fetchBTCPrice error:', err);
    return {};
  }
}

// Used by all mempool fetch functions. Override via opts.baseUrl.
const MEMPOOL_PUBLIC = 'https://mempool.space';

// Routes custom mempool URLs through the server-side proxy to avoid CORS and
// self-signed cert issues with self-hosted nodes (e.g. Start9).
async function mempoolGet(base, apiPath) {
  if (base !== MEMPOOL_PUBLIC) {
    const url = `/api/mempool-proxy?base=${encodeURIComponent(base)}&path=${encodeURIComponent(apiPath)}`;
    return fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  }
  return fetch(`${base}${apiPath}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
}

/**
 * Fetch chain stats from Mempool.space
 * Returns: { height, hashrate, difficulty, mempoolBytes, mempoolTx, feeFast, feeMid, feeEco,
 *            diffAdj, previousDiffAdj, previousRetargetDate, blockTimeMs, remainingBlocks,
 *            progressPercent, estimatedRetargetDate }
 * opts: { baseUrl?: string, fallbackToPublic?: boolean }
 */
async function fetchChainStats(opts = {}) {
  const base = (opts.baseUrl && opts.baseUrl.trim())
    ? opts.baseUrl.replace(/\/$/, '')
    : MEMPOOL_PUBLIC;

  try {
    const results = await Promise.allSettled([
      mempoolGet(base, '/api/blocks/tip/height'),
      mempoolGet(base, '/api/v1/mining/hashrate/3d'),
      mempoolGet(base, '/api/v1/fees/recommended'),
      mempoolGet(base, '/api/mempool'),
      mempoolGet(base, '/api/v1/difficulty-adjustment'),
    ]);

    const [blockResult, hashrateResult, feesResult, mempoolResult, diffResult] = results;

    // Critical endpoints: height, fees, mempool — must succeed
    const criticalFailed = [blockResult, feesResult, mempoolResult].some(
      r => r.status !== 'fulfilled' || !r.value.ok
    );

    if (criticalFailed) {
      // Retry with public fallback if requested and we were using a custom base
      if (opts.fallbackToPublic && base !== MEMPOOL_PUBLIC) {
        console.warn('fetchChainStats: critical endpoint failed on', base, '— falling back to public');
        return fetchChainStats({ baseUrl: MEMPOOL_PUBLIC, fallbackToPublic: false });
      }
      throw new Error('mempool critical endpoint failed');
    }

    const height = await blockResult.value.json();
    const fees = await feesResult.value.json();
    const mempool = await mempoolResult.value.json();

    // Non-critical: hashrate, difficulty-adjustment — use null on failure
    let hashrateData = null;
    if (hashrateResult.status === 'fulfilled' && hashrateResult.value.ok) {
      hashrateData = await hashrateResult.value.json();
    }

    let diff = null;
    if (diffResult.status === 'fulfilled' && diffResult.value.ok) {
      diff = await diffResult.value.json();
    }

    const currentHashrate = hashrateData ? (hashrateData.currentHashrate || 0) : null;
    const currentDiff = diff && diff.difficultyChange !== undefined
      ? diff.difficulty || (hashrateData && hashrateData.currentDifficulty)
      : (hashrateData && hashrateData.currentDifficulty);

    return {
      height,
      hashrate: currentHashrate,
      difficulty: currentDiff || null,
      mempoolBytes: mempool.vsize,
      mempoolTx: mempool.count,
      feeFast: fees.fastestFee,
      feeMid:  fees.halfHourFee,
      feeEco:  fees.economyFee,
      diffAdj: diff ? diff.difficultyChange : null,
      previousDiffAdj: diff ? diff.previousRetarget : null,
      // Approximation: elapsed blocks × current-epoch timeAvg. Accurate to within a few hours.
      previousRetargetDate: (diff && diff.remainingBlocks != null && diff.timeAvg)
        ? Math.round((Date.now() - (2016 - diff.remainingBlocks) * diff.timeAvg) / 1000)
        : null,
      blockTimeMs: diff ? diff.timeAvg : null,
      remainingBlocks: diff ? diff.remainingBlocks : null,
      progressPercent: diff ? diff.progressPercent : null,
      estimatedRetargetDate: diff ? diff.estimatedRetargetDate : null,
    };
  } catch (err) {
    console.error('fetchChainStats error:', err);
    return {};
  }
}

/**
 * Fetch weather from Open-Meteo
 * Returns: { temp, feels, wxCond, wxCode, wxWindSpeed, wxWind, wxHum, wxHi, wxLo, wxSunriseHr, wxSunsetHr, hourly }
 */
async function fetchWeather(lat, lng, tempUnit = 'fahrenheit', tzName = 'auto') {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,wind_gusts_10m,pressure_msl,dew_point_2m&hourly=temperature_2m,weather_code,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,wind_speed_10m_max&temperature_unit=${tempUnit}&wind_speed_unit=mph&forecast_days=1&timezone=${tzName}`;

    const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!r.ok) throw new Error('open-meteo api not ok');
    const j = await r.json();

    const cur = j.current;
    const windDirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const windDir = windDirs[Math.round(cur.wind_direction_10m / 45) % 8];
    const now = new Date();
    const curHour = now.getHours();

    // Build 8 hourly slots starting from current hour
    const hourly = [];
    for (let i = 0; i < 8; i++) {
      const idx = j.hourly.time.findIndex(t => {
        const h = new Date(t).getHours();
        return h === (curHour + i) % 24;
      });
      if (idx >= 0) {
        const t = new Date(j.hourly.time[idx]);
        const hr = t.getHours();
        hourly.push({
          hr,
          t: Math.round(j.hourly.temperature_2m[idx]),
          code: j.hourly.weather_code[idx],
          pop: j.hourly.precipitation_probability[idx] ?? 0,
        });
      }
    }

    return {
      temp: Math.round(cur.temperature_2m),
      feels: Math.round(cur.apparent_temperature),
      wxCond: cur.weather_code,
      wxCode: cur.weather_code,
      wxWindSpeed: Math.round(cur.wind_speed_10m),
      wxWind: `${windDir} ${Math.round(cur.wind_speed_10m)} mph`,
      wxHum: `${cur.relative_humidity_2m}%`,
      wxHi: Math.round(j.daily.temperature_2m_max[0]),
      wxLo: Math.round(j.daily.temperature_2m_min[0]),
      wxSunriseHr: parseInt(j.daily.sunrise[0].split('T')[1]),
      wxSunsetHr: parseInt(j.daily.sunset[0].split('T')[1]),
      wxSunrise: j.daily.sunrise[0].split('T')[1]?.slice(0, 5),
      wxSunset: j.daily.sunset[0].split('T')[1]?.slice(0, 5),
      wxUVIndex: Math.round(j.daily.uv_index_max?.[0] ?? 0),
      wxDailyWindMax: Math.round(j.daily.wind_speed_10m_max?.[0]),
      wxGusts: cur.wind_gusts_10m != null ? Math.round(cur.wind_gusts_10m) : null,
      wxPressure: cur.pressure_msl != null ? Math.round(cur.pressure_msl) : null,
      wxDewPoint: cur.dew_point_2m != null ? Math.round(cur.dew_point_2m) : null,
      hourly: hourly.slice(0, 8),
    };
  } catch (err) {
    console.error('fetchWeather error:', err);
    return {};
  }
}

/**
 * Fetch multiple RSS feeds via rss2json
 * Returns: array of feed items sorted by pubDate
 */
async function fetchRSSFeeds(feeds = [], apiKey = '') {
  try {
    if (!Array.isArray(feeds) || feeds.length === 0) {
      return [];
    }

    const key = apiKey ? `&api_key=${apiKey}` : '';
    const results = await Promise.allSettled(
      feeds.map(async feedUrl => {
        const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}${key}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
        if (!r.ok) throw new Error('rss2json api not ok');
        const j = await r.json();
        if (j.status !== 'ok') throw new Error('rss2json status not ok');

        const src = j.feed.title || new URL(feedUrl).hostname;
        return j.items.map(it => ({
          cat: (it.categories && it.categories[0]) ? it.categories[0].toUpperCase().slice(0, 20) : 'BITCOIN',
          topic: classifyTopic(it.title),
          hed: it.title,
          src,
          pubDate: it.pubDate,
          link: it.link,
          img: it.thumbnail
            || (it.enclosure && it.enclosure.type && it.enclosure.type.startsWith('image/') ? it.enclosure.link : null)
            || (it.description ? (it.description.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i) || [])[1] || null : null)
            || null,
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

    return all;
  } catch (err) {
    console.error('fetchRSSFeeds error:', err);
    return [];
  }
}

/**
 * Fetch top mining pools from Mempool.space (7-day window)
 * Returns: [{ name, slug, blockCount, sharePct }] (top 6)
 * opts: { baseUrl?: string }
 */
async function fetchMiningPools(opts = {}) {
  const base = (opts.baseUrl && opts.baseUrl.trim()) ? opts.baseUrl.replace(/\/$/, '') : MEMPOOL_PUBLIC;
  try {
    const r = await mempoolGet(base, '/api/v1/mining/pools/1w');
    if (!r.ok) throw new Error('mining pools api not ok');
    const j = await r.json();
    const total = j.blockCount || 1;
    return (j.pools || []).map(p => ({
      name: p.name,
      slug: p.slug,
      blockCount: p.blockCount,
      sharePct: ((p.blockCount / total) * 100).toFixed(1),
    }));
  } catch (err) {
    if (opts.fallbackToPublic && base !== MEMPOOL_PUBLIC) {
      console.warn('fetchMiningPools: failed on', base, '— falling back to public');
      return fetchMiningPools({ baseUrl: MEMPOOL_PUBLIC, fallbackToPublic: false });
    }
    console.error('fetchMiningPools error:', err);
    return [];
  }
}

/**
 * Fetch recent blocks mined by a specific pool
 * Returns: [{ height, timestamp, txCount }] (first 5)
 * opts: { baseUrl?: string }
 */
async function fetchPoolBlocks(slug, opts = {}) {
  const base = (opts.baseUrl && opts.baseUrl.trim()) ? opts.baseUrl.replace(/\/$/, '') : MEMPOOL_PUBLIC;
  try {
    const r = await mempoolGet(base, `/api/v1/mining/pool/${slug}/blocks`);
    if (!r.ok) throw new Error('pool blocks api not ok');
    const blocks = await r.json();
    return (blocks || []).slice(0, 5).map(b => ({
      height: b.height,
      timestamp: b.timestamp,
      txCount: b.tx_count,
    }));
  } catch (err) {
    if (opts.fallbackToPublic && base !== MEMPOOL_PUBLIC) {
      console.warn('fetchPoolBlocks: failed on', base, '— falling back to public');
      return fetchPoolBlocks(slug, { baseUrl: MEMPOOL_PUBLIC, fallbackToPublic: false });
    }
    console.error('fetchPoolBlocks error:', err);
    return [];
  }
}

/**
 * Fetch recent confirmed blocks
 * Returns: { blocks: [{ height, timestamp, txCount, size, weight, medianFee, totalFees, feeRange, poolName }], stale: boolean }
 *          stale is true if the most recent block timestamp is >60 min old
 * opts: { baseUrl?: string }
 */
async function fetchRecentBlocks(opts = {}) {
  const base = (opts.baseUrl && opts.baseUrl.trim()) ? opts.baseUrl.replace(/\/$/, '') : MEMPOOL_PUBLIC;
  try {
    const r = await mempoolGet(base, '/api/v1/blocks');
    if (!r.ok) throw new Error('blocks api not ok');
    const blocks = await r.json();
    const fallbackExt = (blocks || []).find(b => b.extras && b.extras.medianFee != null)
      ? (blocks || []).find(b => b.extras && b.extras.medianFee != null).extras
      : {};
    const mapped = (blocks || []).slice(0, 6).map(b => {
      const ext = b.extras || fallbackExt;
      return {
        height:    b.height,
        timestamp: b.timestamp,
        txCount:   b.tx_count,
        size:      b.size,
        weight:    b.weight != null ? b.weight : null,
        medianFee: ext.medianFee != null ? Math.round(ext.medianFee * 10) / 10 : null,
        totalFees: b.extras && b.extras.totalFees != null ? b.extras.totalFees : null,
        feeRange:  b.extras && b.extras.feeRange != null ? b.extras.feeRange : null,
        poolName:  ext.pool && ext.pool.name ? ext.pool.name : '—',
      };
    });
    // Staleness: most recent block older than 60 min indicates stale/cached data
    const stale = blocks && blocks.length > 0 &&
      (blocks[0].timestamp * 1000 < Date.now() - 60 * 60 * 1000);
    return { blocks: mapped, stale: Boolean(stale) };
  } catch (err) {
    if (opts.fallbackToPublic && base !== MEMPOOL_PUBLIC) {
      console.warn('fetchRecentBlocks: failed on', base, '— falling back to public');
      return fetchRecentBlocks({ baseUrl: MEMPOOL_PUBLIC, fallbackToPublic: false });
    }
    console.error('fetchRecentBlocks error:', err);
    return { blocks: [], stale: false };
  }
}

/**
 * Fetch projected fee rates for next mempool blocks
 * Returns: [{ nTx, medianFee, feeRange: [min, max] }] (first 3)
 * opts: { baseUrl?: string }
 */
async function fetchMempoolBlocks(opts = {}) {
  const base = (opts.baseUrl && opts.baseUrl.trim()) ? opts.baseUrl.replace(/\/$/, '') : MEMPOOL_PUBLIC;
  try {
    const r = await mempoolGet(base, '/api/v1/fees/mempool-blocks');
    if (!r.ok) throw new Error('mempool-blocks api not ok');
    const blocks = await r.json();
    return (blocks || []).slice(0, 3).map(b => ({
      nTx: b.nTx,
      medianFee: Math.round(b.medianFee),
      feeRange: b.feeRange && b.feeRange.length >= 2
        ? [Math.round(b.feeRange[0]), Math.round(b.feeRange[b.feeRange.length - 1])]
        : null,
    }));
  } catch (err) {
    if (opts.fallbackToPublic && base !== MEMPOOL_PUBLIC) {
      console.warn('fetchMempoolBlocks: failed on', base, '— falling back to public');
      return fetchMempoolBlocks({ baseUrl: MEMPOOL_PUBLIC, fallbackToPublic: false });
    }
    console.error('fetchMempoolBlocks error:', err);
    return [];
  }
}

/**
 * Fetch Bitcoin metadata from CoinGecko
 * Returns: { ath, athDate, circulatingSupply }
 */
async function fetchBitcoinMeta() {
  try {
    const r = await fetch(
      'https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false',
      { signal: AbortSignal.timeout(FETCH_TIMEOUT) }
    );
    if (!r.ok) throw new Error('coingecko bitcoin meta api not ok');
    const j = await r.json();
    const md = j.market_data;
    return {
      ath: md?.ath?.usd ?? null,
      athDate: md?.ath_date?.usd ?? null,
      circulatingSupply: md?.circulating_supply ?? null,
    };
  } catch (err) {
    console.error('fetchBitcoinMeta error:', err);
    return {};
  }
}

/**
 * Fetch BitAxe fleet data via API proxy
 * Returns: array of miners with { ip, online, data }
 */
async function fetchBitAxeMiners(apiUrl) {
  try {
    if (!apiUrl) return [];

    const r = await fetch(apiUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!r.ok) throw new Error('bitaxe api not ok');
    const body = await r.json();
    return body.miners || [];
  } catch (err) {
    console.error('fetchBitAxeMiners error:', err);
    return [];
  }
}

/**
 * Fetch single BitAxe miner directly via HTTP
 * Returns: { ip, online: true, data } or { ip, online: false }
 */
async function fetchBitAxeMiner(ip) {
  try {
    const r = await fetch(`http://${ip}/api/system/info`, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!r.ok) throw new Error('bitaxe direct fetch not ok');
    const data = await r.json();
    return { ip, online: true, data };
  } catch (err) {
    console.error(`fetchBitAxeMiner(${ip}) error:`, err);
    return { ip, online: false };
  }
}

// CommonJS exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MEMPOOL_PUBLIC,
    fetchBTCPrice,
    fetchChainStats,
    fetchMiningPools,
    fetchPoolBlocks,
    fetchRecentBlocks,
    fetchMempoolBlocks,
    fetchBitcoinMeta,
    fetchWeather,
    fetchRSSFeeds,
    fetchBitAxeMiners,
    fetchBitAxeMiner,
  };
}
