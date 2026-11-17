// FLOW: On desktop, open the dashboard the way GitHub Pages serves it: no backend, so
//       every same-origin /api/* route answers 404 and the history daemon on :3002
//       never answers (harness router rule 1, `backend: 'pages'`). Open Settings.
// EXPECT: The page renders with no ErrorBoundary fallback (the harness checks after
//         every test). The news column shows headlines from the rss2json fixtures.
//         The Field Report shows its no-miners state, "No miners connected", and
//         Settings' Miners section reads "No miners configured."
// WHY: deploy.yml publishes this mode on every push to main, so it is the public face
//      of the app. useRSS falls back to rss2json when /api/rss fails, and useBitaxe
//      keeps an empty fleet on a failed /api/miners; a regression in either shows up
//      only here, since every other flow runs with the backend fixtures.
import { test, expect } from '../harness.js';
import FIXTURES from '../fixtures/load.js';

// Chromium logs every failed resource load as a console error, and this mode fails
// them on purpose. Neither message names its URL, so each entry covers every request
// of its kind; the response and requestfailed checks below pin which requests those
// are. Anchored to the whole message, like the harness's built-in entry.
const ALLOWED_CONSOLE_ERRORS = [
  // Each /api/* request answering 404 (/api/miners, /api/firmware, /api/rss per feed).
  /^Failed to load resource: the server responded with a status of 404 \(Not Found\)$/,
  // The history daemon request the harness aborts (:3002, useHistory).
  /^Failed to load resource: net::ERR_FAILED$/,
];

test.use({
  backend: 'pages',
  // Wrapped as [value, options]: test.use reads any array whose second element is an
  // object (a RegExp is one) as that tuple, and would keep only the first pattern.
  allowConsoleErrors: [ALLOWED_CONSOLE_ERRORS, { option: true }],
});

// Every headline in the recorded rss2json fixtures (tests/e2e/fixtures/public).
const RSS2JSON_TITLES = FIXTURES
  .filter(f => f.match.startsWith('https://api.rss2json.com/'))
  .flatMap(f => JSON.parse(f.body).items.map(item => item.title));

// Records the traffic the two allow-listed messages stand for, so the allow-list cannot
// hide anything else: a 404 from anywhere but same-origin /api/*, or a failed request
// anywhere but the history daemon, is collected as `stray` and fails the flow.
function watchTraffic(page, baseURL) {
  const site = new URL(baseURL);
  const traffic = { api: [], history: [], stray: [] };
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === site.origin && url.pathname.startsWith('/api/')) {
      traffic.api.push(`${response.status()} ${url.pathname}`);
    } else if (response.status() === 404) {
      traffic.stray.push(`404 ${response.url()}`);
    }
  });
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    if (url.hostname === site.hostname && url.port === '3002') traffic.history.push(url.pathname);
    else traffic.stray.push(`${request.failure()?.errorText} ${request.url()}`);
  });
  return traffic;
}

// The mode really was Pages: the backend routes were asked for and every one got 404,
// the history daemon was asked for and never answered, and nothing else failed.
async function expectPagesTraffic(traffic) {
  await expect.poll(() => traffic.api.some(r => r.endsWith(' /api/miners'))).toBe(true);
  await expect.poll(() => traffic.history.length).toBeGreaterThan(0);
  expect(traffic.api.filter(r => !r.startsWith('404 '))).toEqual([]);
  expect(traffic.stray).toEqual([]);
}

test('without a backend the page degrades cleanly', async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const traffic = watchTraffic(page, baseURL);

  await page.goto('/');
  await expect(page.getByText('No miners connected', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '⚙ Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog.getByText('No miners configured.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();

  await expectPagesTraffic(traffic);
});

test('without a backend news falls back to rss2json @fixtures-only', async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  expect(RSS2JSON_TITLES.length).toBeGreaterThan(0);
  const traffic = watchTraffic(page, baseURL);
  await page.goto('/');
  const news = page.getByTestId('news-column');
  await expect.poll(async () => {
    const text = await news.innerText();
    return RSS2JSON_TITLES.filter(title => text.includes(title)).length;
  }).toBeGreaterThan(0);
  await expectPagesTraffic(traffic);
});
