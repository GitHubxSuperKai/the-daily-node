// ─── API Fetch Helpers ────────────────────────────────────────
// Extracted from Command Center.html
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

/**
 * Fetch chain stats from Mempool.space
 * Returns: { height, hashrate, difficulty, mempoolBytes, mempoolTx, feeFast, feeEco, diffAdj, blockTimeMs, remainingBlocks, progressPercent, estimatedRetargetDate }
 */
async function fetchChainStats() {
  try {
    const [blockRes, hashrateRes, feesRes, mempoolRes, diffRes] = await Promise.all([
      fetch('https://mempool.space/api/blocks/tip/height', { signal: AbortSignal.timeout(FETCH_TIMEOUT) }),
      fetch('https://mempool.space/api/v1/mining/hashrate/3d', { signal: AbortSignal.timeout(FETCH_TIMEOUT) }),
      fetch('https://mempool.space/api/v1/fees/recommended', { signal: AbortSignal.timeout(FETCH_TIMEOUT) }),
      fetch('https://mempool.space/api/mempool', { signal: AbortSignal.timeout(FETCH_TIMEOUT) }),
      fetch('https://mempool.space/api/v1/difficulty-adjustment', { signal: AbortSignal.timeout(FETCH_TIMEOUT) }),
    ]);

    if (!blockRes.ok || !hashrateRes.ok || !feesRes.ok || !mempoolRes.ok || !diffRes.ok) {
      throw new Error('mempool api response not ok');
    }

    const height = await blockRes.json();
    const hashrateData = await hashrateRes.json();
    const fees = await feesRes.json();
    const mempool = await mempoolRes.json();
    const diff = await diffRes.json();

    const currentHashrate = hashrateData.currentHashrate || 0;
    const currentDiff = diff.difficultyChange !== undefined
      ? diff.difficulty || hashrateData.currentDifficulty
      : hashrateData.currentDifficulty;

    return {
      height,
      hashrate: currentHashrate,
      difficulty: currentDiff || hashrateData.currentDifficulty,
      mempoolBytes: mempool.vsize,
      mempoolTx: mempool.count,
      feeFast: fees.fastestFee,
      feeEco: fees.economyFee,
      diffAdj: diff.difficultyChange,
      blockTimeMs: diff.timeAvg,
      remainingBlocks: diff.remainingBlocks,
      progressPercent: diff.progressPercent,
      estimatedRetargetDate: diff.estimatedRetargetDate,
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
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m&hourly=temperature_2m,weather_code,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&temperature_unit=${tempUnit}&wind_speed_unit=mph&forecast_days=1&timezone=${tzName}`;

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
          cat: (it.categories && it.categories[0]) ? it.categories[0].toUpperCase().slice(0, 10) : 'BITCOIN',
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
    fetchBTCPrice,
    fetchChainStats,
    fetchWeather,
    fetchRSSFeeds,
    fetchBitAxeMiners,
    fetchBitAxeMiner,
  };
}
