// Behaviour test for scripts/check-review-paths.cjs -- the guard that keeps
// .claude/workflows/full-repo-review.mjs's GROUPS list in step with the tree.
//
// Why this exists: CI only ever runs the guard against this repo, where it passes. A
// passing run cannot tell "correctly found nothing unlisted" from "enumerated almost
// nothing", which is the blind spot the guard itself exists to close, one level up.
// PR #130 proved the guard with an 18-case mutation battery that lived in a scratch
// directory and was never committed; this file is that battery, rewritten to run in CI.
//
// Every case copies the REAL guard into a throwaway git repo next to a fixture
// workflow file, runs it as a subprocess, and asserts on the exit code AND the message
// that fired. A rejection is only the right rejection if it names the right problem,
// and a pass is only a pass if the success line printed. Must-PASS controls sit beside
// the must-FAIL cases so a guard that rejects everything fails here too.
//
// Cases that need a different EXCLUDED or COVERED_ROOTS mutate the copied script's
// source; each mutation asserts that its replace() changed the text, so a refactor
// that moves the literal fails loudly instead of testing a pristine copy.
//
// Runs under the suite-wide jsdom environment like checkSecrets.test.js, for the same
// reason (tests/setup.js touches `document` at load).
import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GUARD_SRC = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'check-review-paths.cjs'), 'utf8');
const GUARD_REL = 'scripts/check-review-paths.cjs';
const WORKFLOW_REL = '.claude/workflows/full-repo-review.mjs';

// The guard's hard-coded EXCLUDED entries must exist under a covered root, or it fails
// with a stale-exclusion error, so every fixture carries them.
const VENDOR = [
  'src/vendor/react.production.min.js',
  'src/vendor/react-dom.production.min.js',
  'src/vendor/MANIFEST.md',
];

const tmpDirs = [];
afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function git(args, cwd) {
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

// GROUPS is written as the guard expects to find it: `const GROUPS = [` ... `\n];`.
function workflowSource(groups) {
  return `// fixture\nconst GROUPS = ${JSON.stringify(groups, null, 2)};\nexport default GROUPS;\n`;
}

// Builds a repo with `files` ({ rel: contents }), the guard (optionally mutated), and a
// workflow whose single group lists `listed` (or `groups` verbatim when given).
function makeRepo({ files = {}, listed, groups, guard = GUARD_SRC, workflow } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dn-review-paths-'));
  tmpDirs.push(dir);
  const all = { 'src/a.js': 'a\n', 'tests/a.test.js': 'a\n', ...files };
  for (const v of VENDOR) all[v] = 'vendor\n';
  for (const [rel, contents] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), contents);
  }
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(dir, GUARD_REL), guard);
  const defaultListed = Object.keys(all).filter(f => !VENDOR.includes(f)
    && /^(src|tests|scripts)\//.test(f)).concat(GUARD_REL);
  const g = groups ?? [{ key: 'all', label: 'All', files: listed ?? defaultListed }];
  fs.mkdirSync(path.join(dir, '.claude', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(dir, WORKFLOW_REL), workflow ?? workflowSource(g));
  git(['init', '-q', '.'], dir);
  git(['config', 'core.quotepath', 'true'], dir);
  git(['add', '-A', '-f', '.'], dir);
  return dir;
}

function runGuard(dir) {
  const r = spawnSync(process.execPath, [path.join(dir, GUARD_REL)], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function expectPass(result) {
  expect(result.stderr, 'expected a clean run').toBe('');
  expect(result.code).toBe(0);
  expect(result.stdout).toMatch(/✓ coverage: all \d+ file\(s\) under src\/ or tests\/ or scripts\/ are listed/);
}

function expectFail(result, fragment) {
  expect(result.code, `expected a rejection, guard said: ${result.stdout.trim()}`).toBe(1);
  expect(result.stdout, 'printed a success line on a failing run').not.toMatch(/✓ coverage/);
  expect(result.stderr).toContain(fragment);
}

// Replaces `from` with `to` in the guard source and proves the replace matched.
function mutateGuard(from, to) {
  expect(GUARD_SRC.includes(from), `mutation anchor not found in the guard: ${from}`).toBe(true);
  const out = GUARD_SRC.replace(from, to);
  expect(out).not.toBe(GUARD_SRC);
  return out;
}

const SPACE_NAME = 'src/with space.js';
const ACCENT_NAME = `src/caf${String.fromCharCode(0xe9)}.js`;

describe('check-review-paths: must-PASS controls', () => {
  it('passes on a fixture where every file under the three roots is listed', () => {
    expectPass(runGuard(makeRepo()));
  });

  it('passes with listed files in nested dirs, with spaces, and with non-ASCII names', () => {
    expectPass(runGuard(makeRepo({ files: {
      'src/deep/er/x.js': 'x\n', [SPACE_NAME]: 's\n', [ACCENT_NAME]: 'c\n',
    } })));
  });

  it('passes with a group carrying a non-empty context', () => {
    const files = ['src/a.js', 'tests/a.test.js', GUARD_REL];
    expectPass(runGuard(makeRepo({ groups: [{ key: 'g', label: 'G', files, context: 'Not React.' }] })));
  });

  it('ignores an unlisted file outside the enforced roots', () => {
    // Root-level files are listed by hand in the real GROUPS and enforced by nothing;
    // the success line says so. Pinned so the scope stays what the line claims.
    const result = runGuard(makeRepo({ files: { 'build.js': 'b\n', 'docs/x.md': 'd\n' } }));
    expectPass(result);
    expect(result.stdout).toContain('paths outside those roots are not enforced');
  });

  it('accepts a file moved from GROUPS to EXCLUDED with a reason (the documented opt-out)', () => {
    const guard = mutateGuard("  'src/vendor/MANIFEST.md':",
      "  'src/opt-out.js': 'deliberately unreviewed fixture',\n  'src/vendor/MANIFEST.md':");
    expectPass(runGuard(makeRepo({ files: { 'src/opt-out.js': 'o\n' },
      listed: ['src/a.js', 'tests/a.test.js', GUARD_REL], guard })));
  });

  it('counts what it enumerated, so a near-empty enumeration cannot read as success', () => {
    const files = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`src/m${i}.js`, 'm\n']));
    const result = runGuard(makeRepo({ files }));
    expectPass(result);
    // 5 + src/a.js + tests/a.test.js + the guard; EXCLUDED vendor files are not counted.
    expect(result.stdout).toMatch(/all 8 file\(s\) under/);
  });

  it('passes when a staged file was removed from disk and is not listed (ls-files --deleted)', () => {
    // A path in the index but gone from the worktree has nothing to review. Without the
    // --deleted skip the guard would false-fail on it as "not a readable regular file".
    const dir = makeRepo({ files: { 'src/gone.js': 'g\n' },
      listed: ['src/a.js', 'tests/a.test.js', GUARD_REL] });
    fs.rmSync(path.join(dir, 'src', 'gone.js'));
    expectPass(runGuard(dir));
  });
});

describe('check-review-paths: exists-but-unlisted (direction 2)', () => {
  const base = ['src/a.js', 'tests/a.test.js', GUARD_REL];

  it('rejects an unlisted file under src/', () => {
    expectFail(runGuard(makeRepo({ files: { 'src/b.js': 'b\n' }, listed: base })), 'src/b.js');
  });

  it('rejects an unlisted file in a new nested dir (recursion)', () => {
    expectFail(runGuard(makeRepo({ files: { 'src/new/deep/b.js': 'b\n' }, listed: base })), 'src/new/deep/b.js');
  });

  it('rejects an unlisted file under tests/ (fails, not warns)', () => {
    expectFail(runGuard(makeRepo({ files: { 'tests/b.test.js': 'b\n' }, listed: base })), 'tests/b.test.js');
  });

  it('rejects an unlisted file under scripts/, including the guard itself', () => {
    const r1 = runGuard(makeRepo({ files: { 'scripts/x.cjs': 'x\n' }, listed: base }));
    expectFail(r1, 'scripts/x.cjs');
    const r2 = runGuard(makeRepo({ listed: ['src/a.js', 'tests/a.test.js'] }));
    expectFail(r2, GUARD_REL);
  });

  it('rejects an unlisted file that is new and not yet staged (ls-files --others)', () => {
    // The commonest real case: create a file, run npm test before `git add`. makeRepo
    // stages everything, so this file is written after it returns.
    const dir = makeRepo({ listed: base });
    fs.writeFileSync(path.join(dir, 'src', 'unstaged.js'), 'u\n');
    expectFail(runGuard(dir), 'src/unstaged.js');
  });

  it('rejects an existing file dropped from GROUPS', () => {
    expectFail(runGuard(makeRepo({ listed: ['tests/a.test.js', GUARD_REL] })), 'src/a.js');
  });

  it('rejects an unlisted file whose name git would C-quote (non-ASCII)', () => {
    expectFail(runGuard(makeRepo({ files: { [ACCENT_NAME]: 'c\n' }, listed: base })), ACCENT_NAME);
  });

  it('rejects an unlisted file with a space in its name', () => {
    expectFail(runGuard(makeRepo({ files: { [SPACE_NAME]: 's\n' }, listed: base })), SPACE_NAME);
  });

  it('rejects a nested git repo under a covered root instead of exempting its subtree', () => {
    const dir = makeRepo();
    const sub = path.join(dir, 'src', 'nested');
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, 'hidden.js'), 'h\n');
    git(['init', '-q', '.'], sub);
    git(['add', '.'], sub);
    git(['-c', 'user.email=t@example.invalid', '-c', 'user.name=tester', '-c', 'commit.gpgsign=false',
      '-c', 'core.hooksPath=', 'commit', '-qm', 'n'], sub);
    git(['add', 'src/nested'], dir);
    expectFail(runGuard(dir), 'not a readable regular file');
  });
});

describe('check-review-paths: listed-but-missing (direction 1)', () => {
  it('rejects a GROUPS path with a typo', () => {
    expectFail(runGuard(makeRepo({ listed: ['src/a.js', 'tests/a.test.js', GUARD_REL, 'src/typo.js'] })),
      'src/typo.js');
  });

  it('rejects a listed file deleted from disk', () => {
    const dir = makeRepo({ files: { 'src/gone.js': 'g\n' } });
    fs.rmSync(path.join(dir, 'src', 'gone.js'));
    expectFail(runGuard(dir), 'do not resolve');
  });

  it('rejects a path whose file-name case differs from the file on disk', () => {
    // The guard rejects this on every OS, but for different reasons: on a case-sensitive
    // filesystem (Linux CI) statSync already fails, while on Windows only the readdir
    // basename comparison catches it. So this case pins the readdir check on Windows
    // runs only; on Linux it passes with or without it (measured, assay of PR #177).
    // A wrong-case DIRECTORY segment (Src/a.js) slips through on Windows only when the
    // correct-case path is also listed; not pinned here.
    expectFail(runGuard(makeRepo({ listed: ['src/A.js', 'src/a.js', 'tests/a.test.js', GUARD_REL] })),
      'src/A.js');
  });

  it('rejects a directory listed as a path (it would review nothing)', () => {
    expectFail(runGuard(makeRepo({ listed: ['src/vendor', 'src/a.js', 'tests/a.test.js', GUARD_REL] })),
      'src/vendor');
  });

  it('rejects an absolute path', () => {
    // path.join(root, '/src/a.js') resolves inside the repo, so only the isAbsolute
    // check rejects it.
    expectFail(runGuard(makeRepo({ listed: ['/src/a.js', 'src/a.js', 'tests/a.test.js', GUARD_REL] })),
      '/src/a.js');
  });

  it('rejects a path that climbs out with ..', () => {
    expectFail(runGuard(makeRepo({ listed: ['src/../src/a.js', 'src/a.js', 'tests/a.test.js', GUARD_REL] })),
      'src/../src/a.js');
  });

  it('rejects a duplicate path', () => {
    expectFail(runGuard(makeRepo({ listed: ['src/a.js', 'src/a.js', 'tests/a.test.js', GUARD_REL] })),
      'duplicate path');
  });
});

describe('check-review-paths: GROUPS shape', () => {
  const files = ['src/a.js', 'tests/a.test.js', GUARD_REL];

  it('rejects a misspelled key (contxt), which the workflow would ignore silently', () => {
    expectFail(runGuard(makeRepo({ groups: [{ key: 'g', label: 'G', files, contxt: 'x' }] })),
      "unrecognized key 'contxt'");
  });

  it('rejects an empty context string', () => {
    expectFail(runGuard(makeRepo({ groups: [{ key: 'g', label: 'G', files, context: '   ' }] })),
      'empty or non-string context');
  });

  it('rejects a group with an empty files array', () => {
    expectFail(runGuard(makeRepo({ groups: [{ key: 'g', label: 'G', files }, { key: 'e', label: 'E', files: [] }] })),
      'empty files array');
  });

  it('rejects a GROUPS literal it cannot evaluate', () => {
    expectFail(runGuard(makeRepo({ workflow: 'const GROUPS = [\n  { key: oops },\n];\n' })),
      'could not parse the GROUPS array');
  });

  it('rejects a workflow with no GROUPS array', () => {
    expectFail(runGuard(makeRepo({ workflow: 'export default [];\n' })), 'could not locate the GROUPS array');
  });
});

describe('check-review-paths: EXCLUDED and COVERED_ROOTS', () => {
  it('rejects an EXCLUDED entry for a file that does not exist', () => {
    const guard = mutateGuard("  'src/vendor/MANIFEST.md':",
      "  'src/not-there.js': 'stale',\n  'src/vendor/MANIFEST.md':");
    expectFail(runGuard(makeRepo({ guard })), "EXCLUDED lists 'src/not-there.js'");
  });

  it('rejects an EXCLUDED entry that is also listed in GROUPS', () => {
    const guard = mutateGuard("  'src/vendor/MANIFEST.md':",
      "  'src/a.js': 'both',\n  'src/vendor/MANIFEST.md':");
    expectFail(runGuard(makeRepo({ guard })), "'src/a.js' is both excluded here and listed");
  });

  it('rejects an EXCLUDED entry with an empty reason', () => {
    const guard = mutateGuard("  'src/vendor/MANIFEST.md':",
      "  'src/opt-out.js': '  ',\n  'src/vendor/MANIFEST.md':");
    // listed omits opt-out.js so the empty reason is the ONLY problem; listed and
    // excluded together would fail through the "both" check instead.
    expectFail(runGuard(makeRepo({ files: { 'src/opt-out.js': 'o\n' },
      listed: ['src/a.js', 'tests/a.test.js', GUARD_REL], guard })), 'has no reason');
  });

  it('rejects an EXCLUDED key whose case differs from the file', () => {
    const guard = mutateGuard("  'src/vendor/MANIFEST.md':",
      "  'src/Opt-Out.js': 'case',\n  'src/vendor/MANIFEST.md':");
    expectFail(runGuard(makeRepo({ files: { 'src/opt-out.js': 'o\n' }, listed: ['src/a.js', 'tests/a.test.js', GUARD_REL], guard })),
      "EXCLUDED lists 'src/Opt-Out.js'");
  });

  it('rejects a covered root that enumerates nothing', () => {
    const guard = mutateGuard("const COVERED_ROOTS = ['src', 'tests', 'scripts'];",
      "const COVERED_ROOTS = ['src', 'tests', 'scripts', 'lib'];");
    expectFail(runGuard(makeRepo({ guard })), "found no files under 'lib/'");
  });
});
