// Behaviour test for scripts/check-dependabot-liveness.cjs -- the report-only check
// that flags a Dependabot ecosystem whose update job has stopped succeeding.
//
// The property that matters most is FAIL-CLOSED: a config entry with no matching runs
// must fail, never pass. Every "fails" case below is paired with a must-pass control
// built from the same inputs, so neither a checker that rejects everything nor one
// that accepts everything can satisfy this file.
//
// Run names are copied from real "Dependabot Updates" runs on this repo (the full-job
// root dir is "/." and the targeted-job one is "/"); timestamps are synthetic.
//
// Lives in vitest because build.yml runs `npm run test:unit` and never `npm test`.
// Runs under the suite-wide jsdom environment (tests/setup.js needs `document`); see
// checkCodeqlConfig.test.js for why there is no per-file environment override.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const {
  THRESHOLD_DAYS,
  ConfigShapeError,
  runEcosystemName,
  normDir,
  parseDependabotConfig,
  parseRunName,
  evaluate,
  formatReport,
  fetchRuns,
} = require(path.join(REPO_ROOT, 'scripts', 'check-dependabot-liveness.cjs'));

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-29T17:17:00Z'); // a Thursday, the scheduled check time
const ago = days => new Date(NOW - days * DAY).toISOString();

let nextId = 1;
const run = (name, daysAgo, conclusion = 'success', status = 'completed') => ({
  id: nextId++,
  name,
  created_at: ago(daysAgo),
  status,
  conclusion: status === 'completed' ? conclusion : null,
  event: 'dynamic',
  path: 'dynamic/dependabot/dependabot-updates',
  html_url: 'https://example.invalid/run',
});
const full = eco => `${eco} in /. - Update #1655483221`;
const targeted = (eco, deps) => `${eco} in / for ${deps} - Update #1637505469`;

const entry = (ecosystem, directory = '/', interval = 'weekly') => ({ ecosystem, directory, interval });
const statusOf = (entries, runs) => evaluate({ entries, runs, now: NOW });

describe('the real .github/dependabot.yml', () => {
  const text = fs.readFileSync(path.join(REPO_ROOT, '.github', 'dependabot.yml'), 'utf8');

  // Expected entries come from an independent line scan, not a hardcoded list, so
  // adding or removing an ecosystem in dependabot.yml does not break this test -- but
  // the parser silently dropping or inventing an entry still does. The scan is valid
  // for this file only because every entry uses `directory: /` and a weekly schedule,
  // which the second assertion pins.
  it('parses one entry per package-ecosystem line, ignoring nested groups', () => {
    const scanned = [...text.matchAll(/^\s*- package-ecosystem:\s*(\S+)\s*$/gm)].map(m => m[1]);
    expect(scanned.length).toBeGreaterThan(0);
    expect(parseDependabotConfig(text)).toEqual(scanned.map(eco => entry(eco)));
    expect(text.match(/^\s*directory:\s*\/\s*$/gm)).toHaveLength(scanned.length);
    expect(text.match(/^\s*interval:\s*weekly\s*$/gm)).toHaveLength(scanned.length);
  });

  it('parses identically with CRLF line endings', () => {
    const crlf = text.replace(/\r?\n/g, '\r\n');
    expect(crlf).not.toBe(text.replace(/\r\n/g, '\n'));
    expect(parseDependabotConfig(crlf)).toEqual(parseDependabotConfig(text));
  });
});

describe('parseDependabotConfig: shapes it must reject loudly', () => {
  const base = `version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
`;

  it('control: the base fixture parses', () => {
    expect(parseDependabotConfig(base)).toEqual([entry('npm')]);
  });

  const cases = [
    ['unsupported interval', base.replace('interval: weekly', 'interval: quarterly'), /unsupported schedule.interval/],
    ['cron interval', base.replace('interval: weekly', 'interval: cron'), /unsupported schedule.interval/],
    ['missing directory', base.replace('    directory: /\n', ''), /has no directory/],
    ['missing schedule', base.replace('    schedule:\n      interval: weekly\n', ''), /has no schedule.interval/],
    ['missing ecosystem', base.replace('package-ecosystem: npm\n    directory', 'directory'), /no package-ecosystem/],
    ['flow-style schedule', base.replace('schedule:\n      interval: weekly', 'schedule: { interval: weekly }'), /flow-style schedule/],
    ['glob directory', base.replace('directory: /', 'directories:\n      - "/apps/*"'), /glob directory/],
    ['no updates at all', 'version: 2\n', /no updates entries/],
  ];
  for (const [label, text, re] of cases) {
    it(`rejects: ${label}`, () => {
      expect(text).not.toBe(base); // the mutation actually changed the fixture
      expect(() => parseDependabotConfig(text)).toThrow(ConfigShapeError);
      expect(() => parseDependabotConfig(text)).toThrow(re);
    });
  }

  it('expands a literal directories list into one entry per directory', () => {
    const text = base.replace('directory: /', 'directories:\n      - /\n      - "/tools"');
    expect(parseDependabotConfig(text)).toEqual([entry('npm', '/'), entry('npm', '/tools')]);
  });

  it('does not read a directory key nested inside another block as the entry directory', () => {
    const text = base.replace('    directory: /\n', '    directory: /\n    groups:\n      g:\n        directory: /nested\n');
    expect(parseDependabotConfig(text)).toEqual([entry('npm')]);
  });
});

describe('run-name mapping', () => {
  it('maps config ecosystems to the names their runs use', () => {
    expect(runEcosystemName('npm')).toBe('npm_and_yarn');
    expect(runEcosystemName('github-actions')).toBe('github_actions');
    expect(runEcosystemName('pip')).toBe('pip');
    expect(runEcosystemName('docker')).toBe('docker');
  });

  it('normalises directories the way runs spell them', () => {
    expect(normDir('/.')).toBe('/');
    expect(normDir('/')).toBe('/');
    expect(normDir('app/')).toBe('/app');
    expect(normDir('/app/.')).toBe('/app');
  });

  it('tells full jobs from targeted (PR refresh / security) jobs', () => {
    expect(parseRunName('npm_and_yarn in /. - Update #1655483221'))
      .toEqual({ ecosystem: 'npm_and_yarn', directory: '/', full: true });
    expect(parseRunName('npm_and_yarn in / for jsdom, playwright - Update #1637505469'))
      .toEqual({ ecosystem: 'npm_and_yarn', directory: '/', full: false });
    expect(parseRunName('npm_and_yarn in /. for source-map-js - Update #1630589205'))
      .toEqual({ ecosystem: 'npm_and_yarn', directory: '/', full: false });
    expect(parseRunName('Build')).toBeNull();
    expect(parseRunName(undefined)).toBeNull();
  });
});

describe('evaluate', () => {
  it('healthy: a recent successful full run passes', () => {
    const v = statusOf([entry('npm')], [run(full('npm_and_yarn'), 3)]);
    expect(v.results[0].status).toBe('OK');
    expect(v.ok).toBe(true);
  });

  it('missing: a config entry with NO matching runs FAILS, it does not pass', () => {
    const runs = [run(full('npm_and_yarn'), 1), run(full('docker'), 1)];
    const v = statusOf([entry('npm'), entry('pip')], runs);
    expect(v.results.map(r => r.status)).toEqual(['OK', 'MISSING']);
    expect(v.ok).toBe(false);
  });

  it('missing: no runs at all fails every entry', () => {
    const v = statusOf([entry('npm'), entry('docker')], []);
    expect(v.results.map(r => r.status)).toEqual(['MISSING', 'MISSING']);
    expect(v.ok).toBe(false);
  });

  it('stale: the last success is older than the threshold', () => {
    const v = statusOf([entry('docker')], [run(full('docker'), 10)]);
    expect(v.results[0].status).toBe('STALE');
    expect(v.results[0].lastSuccessAt).toBe(ago(10));
    expect(v.ok).toBe(false);
  });

  it('stale: a recent FAILURE does not refresh an old success', () => {
    const v = statusOf([entry('docker')], [run(full('docker'), 3, 'failure'), run(full('docker'), 10)]);
    expect(v.results[0].status).toBe('STALE');
    expect(v.results[0].lastRun.conclusion).toBe('failure');
  });

  it('failing: full runs exist but none succeeded (the real pip history)', () => {
    const runs = [run(full('pip'), 66, 'failure'), run(full('pip'), 73, 'failure')];
    const v = statusOf([entry('pip')], runs);
    expect(v.results[0].status).toBe('FAILING');
    expect(v.ok).toBe(false);
  });

  it('a targeted-job success does not count as liveness', () => {
    const runs = [run(targeted('npm_and_yarn', 'eslint'), 1), run(full('npm_and_yarn'), 4, 'failure')];
    expect(statusOf([entry('npm')], runs).results[0].status).toBe('FAILING');
    // Control: the same history plus one full success passes.
    expect(statusOf([entry('npm')], [...runs, run(full('npm_and_yarn'), 5)]).results[0].status).toBe('OK');
  });

  it('in-progress, cancelled and skipped runs are not successes', () => {
    const runs = [
      run(full('docker'), 0.1, null, 'in_progress'),
      run(full('docker'), 1, 'cancelled'),
      run(full('docker'), 2, 'skipped'),
    ];
    expect(statusOf([entry('docker')], runs).results[0].status).toBe('FAILING');
  });

  it("another ecosystem's or directory's success does not satisfy an entry", () => {
    const runs = [run(full('docker'), 1), run('npm_and_yarn in /tools - Update #1', 1)];
    expect(statusOf([entry('npm')], runs).results[0].status).toBe('MISSING');
    // Control: the /tools entry is satisfied by the /tools run.
    expect(statusOf([entry('npm', '/tools')], runs).results[0].status).toBe('OK');
  });

  it('weekly threshold boundary: 9 days passes, just over fails', () => {
    expect(THRESHOLD_DAYS.weekly).toBe(9);
    expect(statusOf([entry('docker')], [run(full('docker'), 9)]).results[0].status).toBe('OK');
    expect(statusOf([entry('docker')], [run(full('docker'), 9.01)]).results[0].status).toBe('STALE');
  });

  it('the scheduled Thursday check flags ONE missed Monday, and stays green when healthy', () => {
    // Thursday 17:17Z. Monday's npm job runs ~16:05Z, the other ecosystems ~04:15Z.
    const thisMonday = 3 + (17 * 60 + 17 - (16 * 60 + 5)) / 1440; // ~3.05d
    const lastMonday = thisMonday + 7; // ~10.05d
    expect(statusOf([entry('npm')], [run(full('npm_and_yarn'), thisMonday)]).ok).toBe(true);
    expect(statusOf([entry('npm')], [run(full('npm_and_yarn'), lastMonday)]).ok).toBe(false);
  });

  it('daily and monthly entries use their own thresholds', () => {
    expect(statusOf([entry('docker', '/', 'daily')], [run(full('docker'), 3)]).ok).toBe(false);
    expect(statusOf([entry('docker', '/', 'monthly')], [run(full('docker'), 30)]).ok).toBe(true);
  });

  it('zero entries is never a pass', () => {
    expect(statusOf([], [run(full('docker'), 1)]).ok).toBe(false);
  });

  it('an ecosystem whose run name falls back to a wrong guess fails rather than passes', () => {
    // 'bun' is not in the mapping; if its real run name differed, nothing would match.
    const v = statusOf([entry('bun')], [run(full('npm_and_yarn'), 1)]);
    expect(v.results[0].status).toBe('MISSING');
  });
});

describe('formatReport', () => {
  it('lists every entry and states the verdict', () => {
    const v = statusOf([entry('npm'), entry('pip')], [run(full('npm_and_yarn'), 3), run(full('pip'), 66, 'failure')]);
    const out = formatReport(v, { lookbackDays: 36 });
    expect(out).toMatch(/\| OK \| npm \| \/ \|/);
    expect(out).toMatch(/\| FAILING \| pip \| \/ \|/);
    expect(out).toMatch(/NO successful update run/);
  });
});

describe('fetchRuns (fetch stubbed)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = routes => vi.fn(async url => {
    const key = Object.keys(routes).find(k => url.includes(k));
    if (!key) return { ok: false, status: 404, text: async () => 'not found' };
    return { ok: true, json: async () => routes[key] };
  });

  it('reads runs from the dynamic Dependabot Updates workflow', async () => {
    const runs = [run(full('docker'), 1)];
    const f = respond({
      '/actions/workflows?': { workflows: [{ id: 7, path: '.github/workflows/build.yml' }, { id: 42, path: 'dynamic/dependabot/dependabot-updates' }] },
      '/actions/workflows/42/runs': { workflow_runs: runs },
    });
    vi.stubGlobal('fetch', f);
    expect(await fetchRuns({ repo: 'o/r', token: 't', sinceMs: 0 })).toEqual(runs);
    expect(f.mock.calls[1][0]).toContain('/repos/o/r/actions/workflows/42/runs');
    expect(f.mock.calls[1][1].headers.authorization).toBe('Bearer t');
  });

  it('no Dependabot Updates workflow at all: returns no runs, so every entry FAILS', async () => {
    vi.stubGlobal('fetch', respond({ '/actions/workflows?': { workflows: [{ id: 7, path: '.github/workflows/build.yml' }] } }));
    const runs = await fetchRuns({ repo: 'o/r', sinceMs: 0 });
    expect(runs).toEqual([]);
    expect(statusOf([entry('npm')], runs).ok).toBe(false);
  });

  it('pages until the history passes the lookback', async () => {
    const page = (startDays) => Array.from({ length: 100 }, (_, i) => run(full('docker'), startDays + i * 0.1));
    const pages = { 1: page(0), 2: page(10), 3: page(20) };
    const f = vi.fn(async url => {
      if (url.includes('/actions/workflows?')) {
        return { ok: true, json: async () => ({ workflows: [{ id: 42, path: 'dynamic/dependabot/dependabot-updates' }] }) };
      }
      const p = Number(new URL(url).searchParams.get('page'));
      return { ok: true, json: async () => ({ workflow_runs: pages[p] || [] }) };
    });
    vi.stubGlobal('fetch', f);
    // Page 1 ends ~9.9d ago (newer than the 15d lookback), page 2 ends ~19.9d ago (older): stop there.
    const runs = await fetchRuns({ repo: 'o/r', sinceMs: NOW - 15 * DAY });
    expect(runs).toHaveLength(200);
  });

  it('an API error throws instead of reading as "no runs"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, text: async () => 'forbidden' })));
    await expect(fetchRuns({ repo: 'o/r', sinceMs: 0 })).rejects.toThrow(/HTTP 403/);
  });
});
