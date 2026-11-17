// Playwright config for `npm run verify` (scripts/verify.cjs).
//
// The wrapper picks a free port per run and passes it in VERIFY_PORT, so two runs
// from two worktrees never share a server and nothing uses the history daemon's
// 3002. Run it through `npm run verify`, not `npx playwright test`: the wrapper also
// builds index.html first and prints the summary line consumers read.
const { defineConfig } = require('@playwright/test');

const PORT = process.env.VERIFY_PORT;
if (!PORT) {
  throw new Error(
    'VERIFY_PORT is not set. Run `npm run verify` (scripts/verify.cjs), not '
    + '`npx playwright test` directly: the wrapper builds index.html, picks a free '
    + 'port and prints the verify summary line.',
  );
}

const LIVE = process.env.VERIFY_MODE === 'live';
const BASE_URL = `http://127.0.0.1:${PORT}`;

// In fixture mode nothing outside the harness router may reach the network -- not
// even the fonts <link rel="preconnect"> hints in src/index.html, which bypass route().
const launchOptions = LIVE
  ? {}
  : { args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] };

module.exports = defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/verify',
  forbidOnly: true,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['./tests/e2e/summary-reporter.cjs'],
  ],
  webServer: {
    command: 'node server.js',
    env: { PORT },
    url: `${BASE_URL}/`,
    reuseExistingServer: false,
  },
  use: {
    baseURL: BASE_URL,
    timezoneId: 'UTC',
    locale: 'en-US',
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1440, height: 900 }, launchOptions },
    },
    {
      name: 'mobile',
      use: { viewport: { width: 430, height: 932 }, launchOptions },
    },
  ],
});
