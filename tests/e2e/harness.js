// Shared test harness for every verify flow: import { test, expect } from here, never
// from '@playwright/test' directly.
//
// It overrides the `context` fixture so the guards cover every page a test opens, a
// second page included. Before any navigation it fixes the clock and routes every
// request through one rule list (first match wins, in this order):
//   1. backend 'pages': same-origin /api/* answers 404; the history daemon (:3002) is aborted.
//   2. VERIFY_MODE=live: an origin on the live allow-list (the public https origins in
//      src/index.html's connect-src) is answered from the real API. A GET is fetched
//      once per process and then served from LIVE_RESPONSES (see there); anything
//      else continues. Each real fetch is counted and its origin recorded.
//   3. a `fixtures` entry whose `match` (Playwright route glob) matches is fulfilled from it.
//   4. same-origin requests outside /api/ continue.
//   5. images and fonts get a 1x1 transparent PNG or an empty font body.
//   6. fonts.googleapis.com gets an empty stylesheet.
//   7. anything else is recorded in `unstubbed` and aborted.
// Rules 1-2 and 4-7 are two catch-all handlers registered around the fixture routes;
// Playwright runs the last-registered handler first and route.fallback() hands on to
// the next, so fixture globs are matched by Playwright itself.
//
// After each test, unless `enforce` is off (harness self-tests only), it fails the test
// on any unstubbed URL, any console error or page error not matched by
// `allowConsoleErrors` (or the one built-in entry below), and any rendered
// ErrorBoundary fallback.
//
// `allowConsoleErrors` is a list of RegExp, matched against each message. To list two
// or more in test.use, wrap the list: `allowConsoleErrors: [[/a/, /b/], { option: true }]`.
// test.use reads any array whose second entry is an object (a RegExp is one) as the
// fixture tuple [value, options], so a bare `[/a/, /b/]` would keep only /a/. The
// fixture throws unless the value it gets is an array of RegExp, so that slip fails
// the test instead of quietly changing the allow-list. A one-entry `[/a/]` is safe.
import fs from 'node:fs';
import path from 'node:path';
import { test as base, expect } from '@playwright/test';
import FIXTURES from './fixtures/load.js';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SRC_DIR = path.join(REPO_ROOT, 'src');
const LIVE = process.env.VERIFY_MODE === 'live';

// The default clock: 5 minutes after the public fixtures were recorded, so recorded
// timestamps (the mempool tip, news dates, the weather hours) read as recent. A flow
// that needs a particular time of day sets `now` itself.
const RECORDED_AT = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'recorded-at.json'), 'utf8'),
).recordedAt;
const DEFAULT_NOW = new Date(Date.parse(RECORDED_AT) + 5 * 60 * 1000).toISOString();

// Console errors allowed in every test, on top of each test's `allowConsoleErrors`.
// Only one: Chromium logs this as an error because src/index.html's meta-tag CSP
// carries frame-ancestors, a directive browsers ignore in a <meta> (it works only as
// an HTTP header), so the warning reports a no-op. The app's CSP is out of scope here.
// Anchored to the whole message so no other CSP or console error rides on it; the
// harness self-tests check both directions.
const BUILTIN_ALLOWED_CONSOLE_ERRORS = [
  /^The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element\.$/,
];

// 1x1 transparent PNG.
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

// The public origins the app may call, read from the CSP so the list cannot drift
// from what the page itself allows. Only https entries without a wildcard: the
// localhost backends and http://*:3002 are never live.
function liveOrigins() {
  const html = fs.readFileSync(path.join(SRC_DIR, 'index.html'), 'utf8');
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html);
  const directive = csp && csp[1].split(';').map(d => d.trim()).find(d => d.startsWith('connect-src '));
  const origins = directive
    ? directive.split(/\s+/).slice(1).filter(s => s.startsWith('https://') && !s.includes('*'))
    : [];
  if (origins.length === 0) {
    throw new Error('harness: found no https origins in the connect-src of src/index.html');
  }
  return new Set(origins.map(s => new URL(s).origin));
}

// ErrorBoundary renders `${label} unavailable`, or 'Section unavailable' with no
// label (src/components/ErrorBoundary.jsx). Other UI legitimately says "Feed
// unavailable" or "Search unavailable", so match whole-element text against the
// labels the app actually passes rather than any "... unavailable".
function errorBoundaryMarkers() {
  const markers = new Set(['Section unavailable']);
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'vendor') walk(full);
      } else if (/\.jsx?$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8');
        for (const [, attrs] of text.matchAll(/<ErrorBoundary\b([^>]*)>/g)) {
          const label = /\blabel="([^"]+)"/.exec(attrs);
          if (label) markers.add(`${label[1]} unavailable`);
          else if (/\blabel=/.test(attrs)) {
            throw new Error(`harness: ${path.relative(REPO_ROOT, full)} passes ErrorBoundary a non-literal label; teach errorBoundaryMarkers() its text`);
          }
        }
      }
    }
  };
  walk(SRC_DIR);
  return [...markers];
}

// Throws unless `value` is an array whose entries are all RegExp (see the header note
// on the test.use tuple). Exported for harness.spec.js.
export function checkAllowConsoleErrors(value) {
  if (Array.isArray(value) && value.every(pattern => pattern instanceof RegExp)) return;
  const got = Array.isArray(value)
    ? `an array holding ${value.map(p => (p instanceof RegExp ? 'RegExp' : typeof p)).join(', ')}`
    : value instanceof RegExp ? `a single RegExp ${value}` : typeof value;
  throw new Error(
    `harness: allowConsoleErrors must be an array of RegExp, got ${got}. In test.use, `
    + 'wrap a list of two or more as allowConsoleErrors: [[/a/, /b/], { option: true }]: '
    + 'test.use reads [/a/, /b/] as [value, options] and keeps only /a/.',
  );
}

// The --live response cache: GET responses from the allow-listed public APIs, keyed
// by method and exact URL, kept for the whole worker process. scripts/verify.cjs runs
// --live with one worker, but Playwright still starts one worker per project, and a
// fresh one after a failed test, so a run holds one cache per such process (at least
// one per project), not one in total. Every test is a fresh context that
// loads the whole app, so without it a run repeats each call once per test, and
// keyless public APIs rate-limit that: CoinGecko answered every call after the first
// with a 429 and no CORS header, which the page reports as a failed fetch. Each URL
// is still fetched for real once per worker process, so live stays real data. The
// response is cached whatever its status, a 429 included. Unused in fixture mode.
const LIVE_RESPONSES = new Map();

// Answers `key` from `cache`, calling `fetchEntry` only on a miss. In-flight fetches
// are shared; a fetch that throws is dropped from the cache, so the next request
// retries it. `fetched` is true only for the caller whose call did the real fetch.
// Exported for harness.spec.js.
export async function liveFetch(cache, key, fetchEntry) {
  if (cache.has(key)) return { entry: await cache.get(key), fetched: false };
  const pending = fetchEntry();
  cache.set(key, pending);
  try {
    return { entry: await pending, fetched: true };
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}

const LIVE_ORIGINS = liveOrigins();
const ERROR_BOUNDARY_MARKERS = errorBoundaryMarkers();

export const test = base.extend({
  // Every module under fixtures/public and fixtures/backend (fixtures/load.js).
  fixtures: [FIXTURES, { option: true }],
  allowConsoleErrors: [[], { option: true }],
  now: [DEFAULT_NOW, { option: true }],
  backend: ['docker', { option: true }],
  enforce: [true, { option: true }],

  // eslint-disable-next-line no-empty-pattern
  unstubbed: async ({}, use) => { await use([]); },
  // eslint-disable-next-line no-empty-pattern
  consoleErrors: async ({}, use) => { await use([]); },

  context: async ({
    context, baseURL, fixtures, now, backend, enforce, allowConsoleErrors, unstubbed, consoleErrors,
  }, use, testInfo) => {
    checkAllowConsoleErrors(allowConsoleErrors);
    const site = new URL(baseURL);
    const historyOrigin = `${site.protocol}//${site.hostname}:3002`;
    let externalRequests = 0;
    const externalOrigins = new Set();

    context.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    context.on('weberror', webError => consoleErrors.push(String(webError.error())));

    await context.clock.install({ time: now });

    // Registered first, so it runs last: rules 4-7.
    await context.route('**/*', route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === site.origin && !url.pathname.startsWith('/api/')) return route.continue();
      const type = request.resourceType();
      if (type === 'image') return route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_PNG });
      if (type === 'font') return route.fulfill({ status: 200, contentType: 'font/woff2', body: '' });
      if (url.origin === 'https://fonts.googleapis.com') {
        return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      }
      unstubbed.push(request.url());
      return route.abort();
    });

    // Rule 3. Reversed so the first entry is the last registered, and wins.
    for (const fixture of [...fixtures].reverse()) {
      await context.route(fixture.match, route => route.fulfill({
        status: fixture.status,
        contentType: fixture.contentType,
        body: fixture.body,
      }));
    }

    // Registered last, so it runs first: rules 1-2.
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (backend === 'pages') {
        if (url.origin === site.origin && url.pathname.startsWith('/api/')) {
          return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' });
        }
        if (url.origin === historyOrigin) return route.abort();
      }
      if (LIVE && LIVE_ORIGINS.has(url.origin)) return answerLive(route, url);
      return route.fallback();
    });

    // Rule 2's live answer. Only allow-listed https origins get here, so /api/* and
    // :3002 never do: they stay on fixtures (or rule 1) in live mode too.
    const countLive = url => {
      externalRequests += 1;
      externalOrigins.add(url.origin);
    };
    async function answerLive(route, url) {
      const request = route.request();
      if (request.method() !== 'GET') {
        countLive(url);
        return route.continue();
      }
      let result;
      try {
        result = await liveFetch(LIVE_RESPONSES, `GET ${request.url()}`, async () => {
          const response = await route.fetch();
          // The body comes back decoded, so the encoding and length headers no longer
          // describe it.
          const headers = { ...response.headers() };
          for (const name of ['content-encoding', 'content-length', 'transfer-encoding']) delete headers[name];
          return { status: response.status(), headers, body: await response.body() };
        });
      } catch {
        return route.abort();
      }
      if (result.fetched) countLive(url);
      return route.fulfill(result.entry);
    }

    await use(context);

    // Read by tests/e2e/summary-reporter.cjs. Origins only, never full URLs.
    await testInfo.attach('verify-external-requests', {
      body: String(externalRequests),
      contentType: 'text/plain',
    });
    await testInfo.attach('verify-external-origins', {
      body: JSON.stringify([...externalOrigins].sort()),
      contentType: 'application/json',
    });

    if (!enforce) return;
    const problems = [];
    for (const url of unstubbed) problems.push(`unstubbed request: ${url}`);
    for (const message of consoleErrors) {
      const allowed = [...BUILTIN_ALLOWED_CONSOLE_ERRORS, ...allowConsoleErrors];
      if (!allowed.some(pattern => message.search(pattern) !== -1)) {
        problems.push(`console error: ${message}`);
      }
    }
    for (const page of context.pages()) {
      if (page.isClosed()) continue;
      const marker = await page.evaluate(markers => {
        for (const el of document.querySelectorAll('body *')) {
          if (el.childElementCount === 0 && markers.includes(el.textContent.trim())) {
            return el.textContent.trim();
          }
        }
        return null;
      }, ERROR_BOUNDARY_MARKERS);
      if (marker) problems.push(`ErrorBoundary fallback rendered: "${marker}" on ${page.url()}`);
    }
    if (problems.length > 0) {
      throw new Error(`verify harness found ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
    }
  },

  // Playwright will not let an override change a built-in fixture's `auto` flag, so
  // this auto fixture pulls the guarded context into every test instead.
  _guardedContext: [async ({ context: _context }, use) => { await use(); }, { auto: true }],
});

export { expect };
