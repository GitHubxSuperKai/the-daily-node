// Behaviour test for tests/e2e/summary-reporter.cjs -- the Playwright reporter that
// writes test-results/verify/summary.json for scripts/verify.cjs.
//
// Under --live the harness attaches, per test, the count of requests it fetched for
// real (verify-external-requests) and their origins (verify-external-origins, a JSON
// array). The summary sums the counts and lists the union of origins, sorted, so a
// live run shows which public hosts it actually reached. fs writes are intercepted:
// the test never touches the real summary.json.
//
// The second describe block tests verdict() in scripts/verify.cjs, which turns the exit
// code and that summary into the `verify: ` line, including the --live failure when
// externalRequests is 0.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SummaryReporter = require(path.join(REPO_ROOT, 'tests', 'e2e', 'summary-reporter.cjs'));

function fakeTest(file, outcome, attachments) {
  return {
    location: { file },
    outcome: () => outcome,
    results: [{ attachments: attachments.map(([name, body]) => ({ name, body: Buffer.from(body) })) }],
  };
}

function runReporter(tests, status = 'passed') {
  const written = [];
  vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
  vi.spyOn(fs, 'writeFileSync').mockImplementation((file, body) => { written.push([file, body]); });
  const reporter = new SummaryReporter();
  reporter.onBegin({}, { allTests: () => tests });
  reporter.onEnd({ status });
  expect(written).toHaveLength(1);
  return JSON.parse(written[0][1]);
}

afterEach(() => vi.restoreAllMocks());

describe('summary-reporter', () => {
  it('sums externalRequests and lists the sorted union of externalOrigins', () => {
    const summary = runReporter([
      fakeTest('/x/flows/a.spec.js', 'expected', [
        ['verify-external-requests', '3'],
        ['verify-external-origins', JSON.stringify(['https://mempool.space', 'https://api.kraken.com'])],
      ]),
      fakeTest('/x/flows/b.spec.js', 'expected', [
        ['verify-external-requests', '1'],
        ['verify-external-origins', JSON.stringify(['https://api.coingecko.com', 'https://mempool.space'])],
      ]),
    ]);
    expect(summary).toEqual({
      status: 'passed',
      failed: [],
      externalRequests: 4,
      externalOrigins: ['https://api.coingecko.com', 'https://api.kraken.com', 'https://mempool.space'],
    });
  });

  it('reports zero requests and no origins in fixture mode', () => {
    const summary = runReporter([
      fakeTest('/x/flows/a.spec.js', 'unexpected', [
        ['verify-external-requests', '0'],
        ['verify-external-origins', '[]'],
      ]),
    ], 'failed');
    expect(summary).toEqual({ status: 'failed', failed: ['a'], externalRequests: 0, externalOrigins: [] });
  });
});

// scripts/verify.cjs turns Playwright's exit code and this summary into the summary
// line. A --live run that passed but fetched nothing for real ran on fixtures, so it
// must not read as a live pass.
const { verdict } = require(path.join(REPO_ROOT, 'scripts', 'verify.cjs'));

describe('verify.cjs verdict', () => {
  const passed = externalRequests => ({ status: 'passed', failed: [], externalRequests, externalOrigins: [] });

  it('fails a passing --live run that made no external requests', () => {
    expect(verdict(0, passed(0), true)).toEqual(['verify: fail (live: no external requests)', 1]);
  });

  it('fails a passing --live run whose summary has no request count', () => {
    expect(verdict(0, { status: 'passed', failed: [] }, true)).toEqual(['verify: fail (live: no external requests)', 1]);
  });

  it('passes a --live run that reached the network', () => {
    expect(verdict(0, passed(3), true)).toEqual(['verify: pass', 0]);
  });

  it('passes a fixture run with zero external requests', () => {
    expect(verdict(0, passed(0), false)).toEqual(['verify: pass', 0]);
  });

  it('still names the failed flow on a --live run', () => {
    expect(verdict(1, { status: 'failed', failed: ['theme'], externalRequests: 0 }, true))
      .toEqual(['verify: fail (theme)', 1]);
  });

  it('reports setup when there is no summary', () => {
    expect(verdict(0, null, false)).toEqual(['verify: fail (setup)', 1]);
  });
});
