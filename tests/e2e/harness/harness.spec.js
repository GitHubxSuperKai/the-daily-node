// Harness self-tests: the guards in tests/e2e/harness.js, checked against themselves.
//
// Every flow relies on the harness to fail a run that reaches an unstubbed host,
// logs a console error, or renders the ErrorBoundary fallback. A guard that never
// fires passes every flow, so each one is exercised here both ways: recorded (with
// enforcement off) and failing the test (with enforcement on, wrapped in test.fail()).
// The test.fail() cases make no assertions of their own on purpose -- the after-test
// check is their only possible failure, so an unexpected pass means that check is off.
//
// Each test loads /__harness, a fixture page with no CSP, so the app's CSP cannot
// block the probes before they reach the router. These tests are tagged @harness and
// are excluded from --live runs.
import { test, expect, checkAllowConsoleErrors, liveFetch } from '../harness.js';

const HARNESS_PAGE = {
  match: '**/__harness',
  status: 200,
  contentType: 'text/html',
  body: '<!doctype html><title>h</title>',
};

// Copied from src/components/ErrorBoundary.jsx: the fallback renders
// `${label} unavailable`, or 'Section unavailable' with no label.
const ERROR_BOUNDARY_PAGE = {
  ...HARNESS_PAGE,
  body: '<!doctype html><title>h</title><div>Section unavailable</div>',
};

const UNSTUBBED_URL = 'https://unstubbed.example/x';

// Chromium's text, verbatim, for a frame-ancestors directive in a <meta> CSP.
const FRAME_ANCESTORS_WARNING =
  "The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element.";

test.describe('harness', { tag: '@harness' }, () => {
  // Pinned so a later change to the harness default cannot move these assertions.
  test.use({ now: '2026-06-15T15:00:00Z', fixtures: [HARNESS_PAGE] });

  test.describe('unstubbed request is recorded', () => {
    test.use({ enforce: false });
    test('unstubbed request is recorded', async ({ page, unstubbed }) => {
      await page.goto('/__harness');
      await page.evaluate(url => fetch(url).catch(() => {}), UNSTUBBED_URL);
      expect(unstubbed).toEqual([UNSTUBBED_URL]);
    });
  });

  test.describe('unstubbed request fails the test', () => {
    test.use({ enforce: true, allowConsoleErrors: [/.*/] });
    test('unstubbed request fails the test', async ({ page }) => {
      test.fail();
      await page.goto('/__harness');
      await page.evaluate(url => fetch(url).catch(() => {}), UNSTUBBED_URL);
    });
  });

  test.describe('console error is recorded and allow-listed', () => {
    test.describe('recorded', () => {
      test.use({ enforce: false });
      test('console error is recorded', async ({ page, consoleErrors }) => {
        await page.goto('/__harness');
        await page.evaluate(() => console.error('boom'));
        await expect.poll(() => consoleErrors).toContain('boom');
      });
    });

    test.describe('allow-listed', () => {
      test.use({ enforce: true, allowConsoleErrors: [/boom/] });
      test('allow-listed console error passes', async ({ page, consoleErrors }) => {
        await page.goto('/__harness');
        await page.evaluate(() => console.error('boom'));
        await expect.poll(() => consoleErrors).toContain('boom');
      });
    });
  });

  test.describe('unlisted console error fails the test', () => {
    test.use({ enforce: true });
    test('unlisted console error fails the test', async ({ page }) => {
      test.fail();
      await page.goto('/__harness');
      await page.evaluate(() => console.error('boom'));
    });
  });

  // A list of two or more patterns has to be wrapped as [[...], { option: true }]: a
  // bare [/a/, /b/] reaches the fixture as the single RegExp /a/ (Playwright reads it
  // as [value, options]), and the harness refuses any value that is not an array of
  // RegExp (checkAllowConsoleErrors).
  test.describe('allow-list shape', () => {
    test.describe('wrapped two-pattern list', () => {
      test.use({ enforce: true, allowConsoleErrors: [[/^alpha$/, /^beta$/], { option: true }] });
      test('a wrapped two-pattern list keeps both patterns', async ({ page, consoleErrors }) => {
        await page.goto('/__harness');
        await page.evaluate(() => { console.error('alpha'); console.error('beta'); });
        await expect.poll(() => consoleErrors).toEqual(['alpha', 'beta']);
      });
    });

    test.describe('bare two-pattern list', () => {
      test.use({ enforce: true, allowConsoleErrors: [/^alpha$/, /^beta$/] });
      // Declared with test.fail(title, body): the shape check throws while the context
      // is set up, before the body runs, so a test.fail() call inside it would never run.
      // The page logs nothing, so the shape check is the only possible failure.
      test.fail('a bare two-pattern list fails the test', async ({ page }) => {
        await page.goto('/__harness');
      });
    });

    test('the shape check names the problem and the fix', () => {
      for (const ok of [[], [/a/], [/a/, /b/]]) expect(() => checkAllowConsoleErrors(ok)).not.toThrow();
      const fix = 'allowConsoleErrors: [[/a/, /b/], { option: true }]';
      expect(() => checkAllowConsoleErrors(/^alpha$/))
        .toThrow(`harness: allowConsoleErrors must be an array of RegExp, got a single RegExp /^alpha$/. In test.use, wrap a list of two or more as ${fix}`);
      expect(() => checkAllowConsoleErrors(['boom'])).toThrow('got an array holding string');
      expect(() => checkAllowConsoleErrors('boom')).toThrow('got string');
    });
  });

  // The harness allows one browser message on every test: Chromium's warning that the
  // app's meta-tag CSP carries frame-ancestors (see BUILTIN_ALLOWED_CONSOLE_ERRORS).
  test.describe('built-in console allow-list', () => {
    test.use({ enforce: true });
    test('the meta-CSP frame-ancestors warning passes', async ({ page, consoleErrors }) => {
      await page.goto('/__harness');
      await page.evaluate(m => console.error(m), FRAME_ANCESTORS_WARNING);
      await expect.poll(() => consoleErrors).toContain(FRAME_ANCESTORS_WARNING);
    });

    // A near miss (another directive, same sentence) must still fail: the built-in
    // entry is anchored to the one message, not to CSP warnings in general.
    test('another CSP warning still fails the test', async ({ page }) => {
      test.fail();
      await page.goto('/__harness');
      await page.evaluate(m => console.error(m),
        FRAME_ANCESTORS_WARNING.replace("'frame-ancestors'", "'sandbox'"));
    });
  });

  test.describe('ErrorBoundary fallback fails the test', () => {
    test.use({ enforce: true, fixtures: [ERROR_BOUNDARY_PAGE] });
    test('ErrorBoundary fallback fails the test', async ({ page }) => {
      test.fail();
      await page.goto('/__harness');
    });
  });

  test('clock and timezone are fixed', async ({ page }) => {
    await page.goto('/__harness');
    const [iso, hour, zone] = await page.evaluate(() => [
      new Date().toISOString(),
      new Date().getHours(),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ]);
    expect(iso.startsWith('2026-06-15T15:00')).toBe(true);
    expect(hour).toBe(15);
    expect(zone).toBe('UTC');
  });

  // The --live response cache (liveFetch): one real fetch per key per process, so a
  // run cannot trip a keyless API's rate limit with its own repeat calls. These run
  // the helper directly with a counting fetcher; no network is involved.
  test.describe('live response cache', () => {
    const ENTRY = { status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from('{}') };

    test('the first request fetches and later ones are served from the cache', async () => {
      const cache = new Map();
      let calls = 0;
      const fetchEntry = async () => { calls += 1; return ENTRY; };
      const first = await liveFetch(cache, 'GET https://a.example/x', fetchEntry);
      const second = await liveFetch(cache, 'GET https://a.example/x', fetchEntry);
      expect(calls).toBe(1);
      expect(first).toEqual({ entry: ENTRY, fetched: true });
      expect(second).toEqual({ entry: ENTRY, fetched: false });
    });

    test('concurrent requests for one key share one fetch', async () => {
      const cache = new Map();
      let calls = 0;
      const fetchEntry = async () => { calls += 1; return ENTRY; };
      const results = await Promise.all([1, 2, 3].map(() => liveFetch(cache, 'GET https://a.example/x', fetchEntry)));
      expect(calls).toBe(1);
      expect(results.map(r => r.fetched)).toEqual([true, false, false]);
    });

    test('different keys fetch separately', async () => {
      const cache = new Map();
      let calls = 0;
      const fetchEntry = async () => { calls += 1; return ENTRY; };
      await liveFetch(cache, 'GET https://a.example/x', fetchEntry);
      await liveFetch(cache, 'GET https://a.example/x?y=1', fetchEntry);
      expect(calls).toBe(2);
    });

    test('a failed fetch is not cached', async () => {
      const cache = new Map();
      let calls = 0;
      const failing = async () => { calls += 1; throw new Error('boom'); };
      await expect(liveFetch(cache, 'GET https://a.example/x', failing)).rejects.toThrow('boom');
      const retried = await liveFetch(cache, 'GET https://a.example/x', async () => { calls += 1; return ENTRY; });
      expect(calls).toBe(2);
      expect(retried.fetched).toBe(true);
    });
  });
});
