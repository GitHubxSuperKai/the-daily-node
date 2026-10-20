// Checks that the desktop sidebar's Mining Pools region fits at 1920x1080 without
// scrolling, on a date with no On This Day entry (Feb 14) and on one with an entry
// (Jan 3, the Genesis Block), where the entry takes rail height from the pools.
//
//   npm run check:sidebar-fit
//   node scripts/check-sidebar-fit.cjs [path/to/index.html]   (default: the built index.html)
//
// Not part of npm test or CI. Needs a local Chrome (channel 'chrome'; no bundled Playwright browser is installed).
// Exits 1 if either date overflows.
//
// Determinism: the clock and timezone (UTC) are fixed, mining pools and Open-Meteo
// are mocked, and every other request is aborted except Google Fonts, which load so
// the rows have their real height. The output counts the font faces that loaded and
// warns when none did (offline): the verdict then rests on fallback-font geometry.
// Weather must show the mocked forecast: with Weather on "unavailable" the pools
// region is about 236px taller and the check would pass trivially.
//
// The region is found from its "Mining Pools · " label, not from the data-pool-*
// attributes, so the check also runs against builds from before those existed; rows
// then come from the list's structure, and the output says so. Red control: the
// build before the pool list was sized to fit,
//   git show db65f16:index.html > "${TMPDIR:-/tmp}/pre.html"
//   node scripts/check-sidebar-fit.cjs "${TMPDIR:-/tmp}/pre.html"
// fails on Jan 3 (with Google Fonts loaded: 82px overflow, 3 of 7 rows inside).
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const file = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));

// 12 pools, so MiningPools folds the tail into "Others" at any limit.
const POOL_BLOCKS = [300, 200, 150, 100, 80, 60, 40, 30, 20, 15, 8, 5];
const POOLS = {
  blockCount: 1008,
  pools: POOL_BLOCKS.map((blockCount, i) => ({ name: `MockPool${i}`, slug: `mp${i}`, blockCount })),
};

const HI = 70;
const LO = 50;
// Open-Meteo forecast whose 24 hourly slots (local time) span the fixed noon instant,
// leaving the 8 slots useWeather takes from it.
function forecast(day) {
  const time = Array.from({ length: 24 }, (_, h) => `${day}T${String(h).padStart(2, '0')}:00`);
  const n = time.length;
  return {
    current: {
      temperature_2m: 61, apparent_temperature: 60, weather_code: 1, wind_speed_10m: 5,
      wind_direction_10m: 180, relative_humidity_2m: 40, wind_gusts_10m: 9,
      pressure_msl: 1015, dew_point_2m: 40,
    },
    hourly: {
      time,
      temperature_2m: Array(n).fill(61),
      weather_code: Array(n).fill(1),
      precipitation_probability: Array(n).fill(0),
      precipitation: Array(n).fill(0),
    },
    daily: {
      temperature_2m_max: [HI, HI], temperature_2m_min: [LO, LO],
      sunrise: [`${day}T07:00`, `${day}T07:00`], sunset: [`${day}T17:30`, `${day}T17:30`],
      precipitation_sum: [0, 0], uv_index_max: [3, 3], wind_speed_10m_max: [8, 8],
    },
  };
}

const DATES = [
  { label: 'no On This Day (Feb 14)', day: '2027-02-14', otd: false },
  { label: 'On This Day (Jan 3)', day: '2027-01-03', otd: true },
];

async function checkDate(browser, { label, day, otd }) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, timezoneId: 'UTC' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(`${day}T12:00:00Z`));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.protocol === 'file:' || url.protocol === 'data:') return route.continue();
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') return route.continue();
    if (url.pathname.startsWith('/api/v1/mining/pools/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(POOLS) });
    }
    if (url.hostname === 'api.open-meteo.com') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(forecast(day)) });
    }
    return route.abort();
  });
  await page.goto(pathToFileURL(file).href);

  const findLabel = () => [...document.querySelectorAll('div')]
    .find(d => d.children.length === 0 && /^Mining Pools · /.test(d.textContent));
  await page.waitForFunction(findLabel, null, { timeout: 30000 });
  await page.waitForFunction(text => document.body.innerText.includes(text), `H${HI} L${LO}`, { timeout: 30000 })
    .catch(() => { throw new Error(`${label}: Weather never showed the mocked forecast (H${HI} L${LO})`); });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  // A late font swap can re-measure the pool limit; give it one more settled frame.
  await page.waitForTimeout(500);

  const r = await page.evaluate(() => {
    const region = [...document.querySelectorAll('div')]
      .find(d => d.children.length === 0 && /^Mining Pools · /.test(d.textContent))
      .closest('.scroll-hint');
    let rows = [...region.querySelectorAll('[data-pool-row]')];
    let rowSource = '[data-pool-row]';
    if (rows.length === 0) {
      // Pre-data-pool-* builds: scroll-hint > scroller > list > [label, rows].
      rows = [...region.firstElementChild.firstElementChild.children[1].children];
      rowSource = 'structure (no data-pool-row)';
    }
    const box = region.getBoundingClientRect();
    const inside = rows.filter(row => {
      const b = row.getBoundingClientRect();
      return b.top >= box.top - 0.5 && b.bottom <= box.bottom + 0.5;
    }).length;
    return {
      hasPoolList: !!region.querySelector('[data-pool-list]'),
      rowSource,
      region: region.clientHeight,
      content: region.scrollHeight,
      scrollTop: region.scrollTop,
      rows: rows.length,
      inside,
      names: rows.map(row => (row.firstElementChild || row).textContent).join(', '),
      moreBelow: region.hasAttribute('data-more-below'),
      moreButton: !!region.parentElement.querySelector('.scroll-more'),
      otdShown: document.body.innerText.includes('Genesis Block'),
      otdKicker: [...document.querySelectorAll('*')]
        .some(e => e.children.length === 0 && /^On This Day$/i.test(e.textContent.trim())),
      // document.fonts.status reads 'loaded' even when every face failed, so count.
      fontsLoaded: [...document.fonts].filter(f => f.status === 'loaded').length,
      fontsFailed: [...document.fonts].filter(f => f.status === 'error').length,
    };
  });
  await ctx.close();

  const problems = [];
  if (r.rows < 2) problems.push(`only ${r.rows} pool rows found`);
  if (r.content - r.region > 2) problems.push(`overflows by ${r.content - r.region}px`);
  if (r.scrollTop !== 0) problems.push(`scrollTop ${r.scrollTop}`);
  if (r.moreBelow) problems.push('data-more-below set');
  if (r.moreButton) problems.push('.scroll-more button shown');
  if (r.inside !== r.rows) problems.push(`${r.inside} of ${r.rows} rows fully inside`);
  // Positive controls: the date must actually produce (or not) an On This Day entry.
  if (otd && !r.otdShown) problems.push('On This Day entry missing on an entry date');
  if (!otd && r.otdKicker) problems.push('On This Day shown on a no-entry date');

  console.log(`${problems.length ? 'FAIL' : 'PASS'} ${label}: region=${r.region}px content=${r.content}px`
    + ` rows=${r.rows} inside=${r.inside} moreBelow=${r.moreBelow} moreButton=${r.moreButton}`
    + ` otd=${r.otdShown} weather=H${HI}/L${LO} fonts=${r.fontsLoaded}-loaded/${r.fontsFailed}-failed`
    + ` rows-by=${r.rowSource} pool-list=${r.hasPoolList}`);
  console.log(`     ${r.names}`);
  if (r.fontsLoaded === 0) console.log('     WARNING: no web font loaded (offline?); measured with fallback fonts');
  else if (r.fontsFailed > 0) console.log(`     WARNING: ${r.fontsFailed} web font face(s) failed; some text measured with fallback fonts`);
  if (problems.length) console.log(`     -> ${problems.join('; ')}`);
  return problems.length === 0;
}

(async () => {
  console.log(`check-sidebar-fit: ${path.relative(process.cwd(), file) || file}`);
  const browser = await chromium.launch({ channel: 'chrome' });
  let failed = 0;
  try {
    for (const d of DATES) if (!(await checkDate(browser, d))) failed++;
  } finally {
    await browser.close();
  }
  process.exit(failed ? 1 : 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
