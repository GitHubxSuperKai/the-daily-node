// Source-failure harness: verify the dashboard degrades gracefully (never blanks)
// when an external data source becomes unreachable — e.g. a VPN blocking mempool.space.
//
// Prereqs: `npx playwright install chromium`, and a built index.html served locally.
//   node build.js
//   python -m http.server 3002
//   node scripts/repro-vpn.cjs
//
// Options (env vars):
//   BLOCK_HOST  host substring to block       (default: mempool.space)
//   URL         dashboard URL                 (default: http://localhost:3002/index.html)
//   STALE_HOURS clock fast-forward in scenario B to fake an old tip block (default: 3)
const { chromium } = require('playwright');

const BLOCK_HOST = process.env.BLOCK_HOST || 'mempool.space';
const URL = process.env.URL || 'http://localhost:3002/index.html';
const STALE_HOURS = Number(process.env.STALE_HOURS || 3);

async function waitForCanvas(page) {
  try {
    await page.waitForFunction(() => document.getElementById('canvas')?.innerHTML?.length > 5000, { timeout: 15000 });
  } catch { /* never rendered = blank/crashed */ }
}

async function report(page, label, errs) {
  const canvasLen = await page.evaluate(() => document.getElementById('canvas')?.innerHTML?.length ?? 0);
  const hasNaN = await page.evaluate(() => /\bNaN\b/.test(document.body.innerText));
  const verdict = errs.pageErrors.length === 0 && canvasLen > 1000 ? 'PASS (graceful)' : 'FAIL (crashed/blank)';
  console.log(`\n=== ${label} -> ${verdict} ===`);
  console.log('canvas length     :', canvasLen, canvasLen < 1000 ? '<-- BLANK' : '');
  console.log('NaN visible in DOM:', hasNaN);
  console.log('pageerror count   :', errs.pageErrors.length);
  errs.pageErrors.forEach((e, i) => console.log(`  pageerror[${i}]:`, e));
}

(async () => {
  const browser = await chromium.launch();

  // Scenario A: source already unreachable at first paint.
  {
    const page = await browser.newContext({ viewport: { width: 1920, height: 1080 } }).then(c => c.newPage());
    const errs = { pageErrors: [] };
    page.on('pageerror', e => errs.pageErrors.push(e.message));
    await page.route(`**://*${BLOCK_HOST}/**`, r => r.abort('connectionrefused'));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await waitForCanvas(page);
    await page.waitForTimeout(3000);
    await report(page, `A: ${BLOCK_HOST} blocked at load`, errs);
  }

  // Scenario B: good load, then source cut + clock fast-forwarded (fakes a stale/old tip block).
  {
    const page = await browser.newContext({ viewport: { width: 1920, height: 1080 } }).then(c => c.newPage());
    const errs = { pageErrors: [] };
    page.on('pageerror', e => errs.pageErrors.push(e.message));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await waitForCanvas(page);
    await page.waitForTimeout(3000);
    await page.route(`**://*${BLOCK_HOST}/**`, r => r.abort('connectionrefused'));
    await page.evaluate((h) => {
      const real = Date.now.bind(Date);
      const shift = h * 60 * 60 * 1000;
      Date.now = () => real() + shift;
    }, STALE_HOURS);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(4000);
    await report(page, `B: ${BLOCK_HOST} cut mid-session, +${STALE_HOURS}h clock`, errs);
  }

  await browser.close();
})();
