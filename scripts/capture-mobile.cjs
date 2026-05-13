const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3002/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('canvas')?.innerHTML?.length > 5000, { timeout: 15000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.updateScale && window.updateScale());
  await page.waitForTimeout(800);
  const out = path.resolve(__dirname, '..', 'docs', 'screenshots', 'mobile-home.png');
  await page.screenshot({ path: out, fullPage: false });
  console.log('saved', out);
  await browser.close();
})();
