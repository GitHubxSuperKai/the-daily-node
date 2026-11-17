// Behaviour test for scripts/verify-map.cjs listRubricChanges -- the half of the
// non-required `verify-map` CI job that names every rubric file a PR modifies or deletes.
//
// The rubric is everything under tests/e2e/, any playwright.config.*, the three
// scripts/verify{,-map,-refresh-fixtures}.cjs scripts, and the package.json script keys
// `verify` and `verify:refresh-fixtures`. NOT scripts/verify-vendor.cjs or `verify:vendor`.
// Additions never count (a PR may add flows), except an added playwright.config.*, and
// that only once the base already has a rubric: the bootstrap PR that introduces verify
// has nothing on main to protect and must report nothing.
//
// Every case builds a throwaway git repo in os.tmpdir() with a base commit and a head
// commit, and passes that repo's path as `cwd` explicitly. Each asserts the WHOLE result,
// so a change landing in the wrong array, or a stray extra entry, fails too.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { listRubricChanges } = require(path.join(REPO_ROOT, 'scripts', 'verify-map.cjs'));

const tmpDirs = [];
afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
}

function commit(dir, message) {
  git(['add', '-A', '-f', '.'], dir);
  git(['-c', 'user.email=t@example.invalid', '-c', 'user.name=tester', '-c', 'commit.gpgsign=false',
    '-c', 'core.hooksPath=', 'commit', '-q', '--allow-empty', '-m', message], dir);
  return git(['rev-parse', 'HEAD'], dir);
}

// Writes `files` ({ rel: contents }) into dir; a null value deletes the file.
function apply(dir, files) {
  for (const [rel, contents] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    if (contents === null) {
      fs.rmSync(abs);
    } else {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, contents);
    }
  }
}

// One base commit from `base`, then one head commit applying `head` on top of it.
function makeRepo(base, head) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dn-verify-map-'));
  tmpDirs.push(dir);
  git(['init', '-q', '.'], dir);
  apply(dir, base);
  const baseSha = commit(dir, 'base');
  apply(dir, head);
  const headSha = commit(dir, 'head');
  return { dir, baseSha, headSha };
}

function pkg(scripts) {
  return `${JSON.stringify({ name: 'fixture', scripts }, null, 2)}\n`;
}

const BASE_SCRIPTS = {
  build: 'node build.js',
  verify: 'node scripts/verify.cjs',
  'verify:refresh-fixtures': 'node scripts/verify-refresh-fixtures.cjs',
  'verify:vendor': 'node scripts/verify-vendor.cjs',
};

// A base that already has a rubric.
const BASE = {
  'src/a.js': 'a\n',
  'playwright.config.js': 'config\n',
  'tests/e2e/flows/chart.spec.js': 'flow\n',
  'tests/e2e/helpers.js': 'helper\n',
  'scripts/verify.cjs': 'wrapper\n',
  'scripts/verify-map.cjs': 'map\n',
  'scripts/verify-refresh-fixtures.cjs': 'refresh\n',
  'scripts/verify-vendor.cjs': 'vendor\n',
  'package.json': pkg(BASE_SCRIPTS),
};

// A base with no rubric at all: what main looks like before the bootstrap PR.
const BARE_SCRIPTS = { build: 'node build.js', 'verify:vendor': 'node scripts/verify-vendor.cjs' };
const BARE = {
  'src/a.js': 'a\n',
  'package.json': pkg(BARE_SCRIPTS),
};

const NONE = { modified: [], deleted: [], addedConfigs: [], scriptKeys: [] };

function changes(base, head) {
  const { dir, baseSha, headSha } = makeRepo(base, head);
  return listRubricChanges(baseSha, headSha, dir);
}

describe('verify-map listRubricChanges', () => {
  // A gate, not a case: either variable would point every git call below (init, add,
  // commit) at the real repo instead of the temp one, and a failing `it` would not stop
  // the cases after it. A failing beforeAll runs none of them.
  beforeAll(() => {
    expect(process.env.GIT_DIR).toBeUndefined();
    expect(process.env.GIT_WORK_TREE).toBeUndefined();
  });

  it('reports nothing when only non-rubric files change (must-pass control)', () => {
    expect(changes(BASE, { 'src/a.js': 'a2\n' })).toEqual(NONE);
  });

  it('reports a modified flow', () => {
    expect(changes(BASE, { 'tests/e2e/flows/chart.spec.js': 'flow2\n' }))
      .toEqual({ ...NONE, modified: ['tests/e2e/flows/chart.spec.js'] });
  });

  it('reports a deleted helper', () => {
    expect(changes(BASE, { 'tests/e2e/helpers.js': null }))
      .toEqual({ ...NONE, deleted: ['tests/e2e/helpers.js'] });
  });

  it('does not report an added flow', () => {
    expect(changes(BASE, { 'tests/e2e/flows/new.spec.js': 'new\n' })).toEqual(NONE);
  });

  it('reports a modified playwright.config.js', () => {
    expect(changes(BASE, { 'playwright.config.js': 'config2\n' }))
      .toEqual({ ...NONE, modified: ['playwright.config.js'] });
  });

  it('reports an added playwright.config.ts in addedConfigs', () => {
    expect(changes(BASE, { 'playwright.config.ts': 'ts\n' }))
      .toEqual({ ...NONE, addedConfigs: ['playwright.config.ts'] });
  });

  it('reports a deleted playwright.config.js', () => {
    expect(changes(BASE, { 'playwright.config.js': null }))
      .toEqual({ ...NONE, deleted: ['playwright.config.js'] });
  });

  it('reports a modified scripts/verify.cjs', () => {
    expect(changes(BASE, { 'scripts/verify.cjs': 'wrapper2\n' }))
      .toEqual({ ...NONE, modified: ['scripts/verify.cjs'] });
  });

  it('reports modified verify-map.cjs and verify-refresh-fixtures.cjs', () => {
    expect(changes(BASE, { 'scripts/verify-map.cjs': 'map2\n', 'scripts/verify-refresh-fixtures.cjs': 'r2\n' }))
      .toEqual({ ...NONE, modified: ['scripts/verify-map.cjs', 'scripts/verify-refresh-fixtures.cjs'] });
  });

  it('does not report a modified scripts/verify-vendor.cjs', () => {
    expect(changes(BASE, { 'scripts/verify-vendor.cjs': 'vendor2\n' })).toEqual(NONE);
  });

  it('reports a changed verify script key', () => {
    expect(changes(BASE, { 'package.json': pkg({ ...BASE_SCRIPTS, verify: 'node scripts/verify.cjs --x' }) }))
      .toEqual({ ...NONE, scriptKeys: ['package.json#scripts.verify'] });
  });

  it('reports a vanished verify:refresh-fixtures script key', () => {
    const { 'verify:refresh-fixtures': _gone, ...rest } = BASE_SCRIPTS;
    expect(changes(BASE, { 'package.json': pkg(rest) }))
      .toEqual({ ...NONE, scriptKeys: ['package.json#scripts.verify:refresh-fixtures'] });
  });

  it('does not report a changed verify:vendor script key', () => {
    expect(changes(BASE, { 'package.json': pkg({ ...BASE_SCRIPTS, 'verify:vendor': 'node x.cjs' }) }))
      .toEqual(NONE);
  });

  it('does not report a verify key added at head', () => {
    const { verify: _absent, ...baseScripts } = BASE_SCRIPTS;
    expect(changes({ ...BASE, 'package.json': pkg(baseScripts) }, { 'package.json': pkg(BASE_SCRIPTS) }))
      .toEqual(NONE);
  });

  it('reports nothing when the base has no tests/e2e', () => {
    expect(changes(BARE, {
      'src/a.js': 'a2\n',
      'tests/e2e/flows/chart.spec.js': 'flow\n',
      'tests/e2e/helpers.js': 'helper\n',
    })).toEqual(NONE);
  });

  it('bootstrap: base has no rubric, head adds config, tests/e2e and the verify key -> nothing', () => {
    expect(changes(BARE, {
      'playwright.config.js': 'config\n',
      'tests/e2e/flows/chart.spec.js': 'flow\n',
      'tests/e2e/helpers.js': 'helper\n',
      'scripts/verify.cjs': 'wrapper\n',
      'package.json': pkg({ ...BARE_SCRIPTS, verify: 'node scripts/verify.cjs' }),
    })).toEqual(NONE);
  });

  it('compares against the merge base, so a rubric change made only on the base side is not reported', () => {
    // base...head semantics: main moving on after the PR branched is not the PR's change.
    const { dir, baseSha } = makeRepo(BASE, {});
    const branchPoint = baseSha;
    git(['checkout', '-q', '-b', 'pr'], dir);
    apply(dir, { 'src/a.js': 'pr\n' });
    const headSha = commit(dir, 'pr change');
    git(['checkout', '-q', branchPoint], dir);
    apply(dir, { 'tests/e2e/flows/chart.spec.js': 'main moved on\n' });
    const mainSha = commit(dir, 'main change');
    expect(listRubricChanges(mainSha, headSha, dir)).toEqual(NONE);
  });
});
