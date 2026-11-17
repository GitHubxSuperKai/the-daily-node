#!/usr/bin/env node
// `npm run verify [-- --live]`: build index.html, run the Playwright flows against it
// on a free port, then print exactly one summary line for ship-it and agents to read:
//
//   verify: pass
//   verify: fail (<comma-separated flow names>)
//   verify: fail (setup)      -- the build failed, Playwright never produced a passing
//                                summary, or it failed with no flow to name
//
// `pass` needs BOTH Playwright's exit code 0 and a fresh summary.json with status
// 'passed'. The old summary.json is deleted first, so a run that dies before the
// reporter writes cannot inherit the previous run's pass. The exit code is
// Playwright's, and never 0 after a fail line.
//
// Playwright is spawned as `node <@playwright/test cli>` rather than through npx,
// which breaks under spawn on Windows with Node 24.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getFreePort } = require('../tests/e2e/port.cjs');

const ROOT = path.resolve(__dirname, '..');
const SUMMARY = path.join(ROOT, 'test-results', 'verify', 'summary.json');
const LIVE = process.argv.slice(2).includes('--live');

function finish(line, code) {
  console.log(line);
  process.exit(code);
}

function readSummary() {
  try {
    return JSON.parse(fs.readFileSync(SUMMARY, 'utf8'));
  } catch {
    return null;
  }
}

(async () => {
  fs.rmSync(SUMMARY, { force: true });

  const build = spawnSync(process.execPath, ['build.js'], { cwd: ROOT, stdio: 'inherit' });
  if (build.status !== 0) finish('verify: fail (setup)', 1);

  const port = await getFreePort();
  const cli = require.resolve('@playwright/test/cli');
  const args = [cli, 'test', '--config', 'playwright.config.js'];
  // --live runs one worker at a time, so the harness's live response cache
  // (tests/e2e/harness.js LIVE_RESPONSES) is shared by every test in a worker process.
  // Playwright still uses a separate worker per project, so each public API URL is
  // fetched about once per project per run, not once per test.
  if (LIVE) args.push('--grep-invert', '@fixtures-only|@harness', '--workers', '1');

  const run = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, VERIFY_PORT: String(port), VERIFY_MODE: LIVE ? 'live' : 'fixtures' },
  });
  const code = run.status === null ? 1 : run.status;

  const summary = readSummary();
  if (code === 0 && summary && summary.status === 'passed') finish('verify: pass', 0);
  const failed = summary && Array.isArray(summary.failed) ? summary.failed : [];
  const line = failed.length > 0 ? `verify: fail (${failed.join(', ')})` : 'verify: fail (setup)';
  finish(line, code === 0 ? 1 : code);
})().catch(err => {
  console.error(err);
  finish('verify: fail (setup)', 1);
});
