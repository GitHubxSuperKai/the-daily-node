#!/usr/bin/env node
// Guards .claude/workflows/full-repo-review.mjs against path rot.
//
// The workflow interpolates every GROUPS entry into the review agent prompt as a
// file to read. A path that no longer resolves does not error -- the agent simply
// finds nothing and still reports success, so a whole review group goes silently
// no-op. This check fails the build instead.
//
// It lives here rather than inside the workflow itself because workflow scripts run
// in a sandbox with no filesystem access -- an existsSync call in that file would
// throw at load, not guard anything.
//
// The GROUPS literal is evaluated rather than scraped with a regex. A regex has to
// guess at quote style and extensions, and it degrades silently: a stray `];` at
// column 0 truncates the match window and the check then passes while covering only
// part of the list. Partial silent coverage is the exact failure this script exists
// to eliminate, so anything it cannot parse must fail loudly instead.
//
// The check runs in both directions:
//   1. listed-but-missing -- a GROUPS path that no longer resolves.
//   2. exists-but-unlisted -- a source file that is in no GROUPS entry.
// Both have the same consequence (the file is never reviewed, the run reports
// success), so both fail. See the COVERED_ROOTS block below for why direction 2
// fails rather than warns.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const REL = '.claude/workflows/full-repo-review.mjs';
const WORKFLOW = path.join(REPO_ROOT, REL);

function fail(...lines) {
  for (const l of lines) console.error(l);
  process.exit(1);
}

let src;
try {
  src = fs.readFileSync(WORKFLOW, 'utf8');
} catch {
  fail(`✗ cannot read ${REL}`);
}

const DECL = 'const GROUPS = ';
const start = src.indexOf(`${DECL}[`);
const end = src.indexOf('\n];', start);
if (start === -1 || end === -1) {
  fail(
    '✗ could not locate the GROUPS array in full-repo-review.mjs',
    '  If GROUPS was renamed or restructured, update this check to match.',
  );
}

// slice(...) spans the opening '[' through the matching ']', excluding the ';'.
const literal = src.slice(start + DECL.length, end + 2);

// Evaluated in an empty vm context with no globals and a timeout: GROUPS is a data
// literal, so it needs nothing from the host, and anything that tries to reach for
// require/process or spin cannot. (Whoever can edit the workflow file can already
// run code in CI via build.js or any test file -- this is about failing safe, not
// about defending against a hostile repo.)
let groups;
try {
  groups = vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 1000 });
} catch (err) {
  fail(
    '✗ could not parse the GROUPS array in full-repo-review.mjs',
    `  ${err.message}`,
    '  GROUPS must stay a self-contained literal so this check can read it.',
  );
}

if (!Array.isArray(groups) || groups.length === 0) {
  fail('✗ GROUPS did not evaluate to a non-empty array');
}

// Every key the workflow actually reads off a GROUPS entry. Anything else is a
// typo -- see the check below for why that has to be loud.
const GROUP_KEYS = new Set(['key', 'label', 'files', 'context']);

const files = [];
for (const [i, group] of groups.entries()) {
  const where = group && group.key ? `group '${group.key}'` : `group #${i}`;
  if (!group || !Array.isArray(group.files)) {
    fail(`✗ ${where} has no files array -- this check can no longer read GROUPS`);
  }
  // Strict key allowlist, because every field here is optional-looking to the
  // workflow: it reads `group.context ? ... : ''`, so a key it does not recognize
  // is indistinguishable from a key deliberately left off. Spelling `context` as
  // `contxt` would otherwise drop that group back to the shared React prompt --
  // still counted as covered, still green, reviewed under the wrong frame.
  for (const key of Object.keys(group)) {
    if (!GROUP_KEYS.has(key)) {
      fail(
        `✗ ${where} has an unrecognized key '${key}'`,
        '  Either it is a typo (the workflow would ignore it silently) or a new',
        '  field was added and GROUP_KEYS in this check needs to learn about it.',
      );
    }
  }
  if ('context' in group && (typeof group.context !== 'string' || group.context.trim() === '')) {
    fail(`✗ ${where} has an empty or non-string context -- drop the key or give it content`);
  }
  // The aggregate zero-paths check below only fires if EVERY group is empty. A
  // single empty group is the silent no-op this script exists to catch: it renders
  // an empty file list into the agent prompt and the run still reports success.
  if (group.files.length === 0) {
    fail(`✗ ${where} has an empty files array -- it would review nothing`);
  }
  for (const f of group.files) {
    if (typeof f !== 'string' || f.length === 0) {
      fail(`✗ ${where} contains a non-string entry in files`);
    }
    files.push(f);
  }
}

// A checker that finds nothing is the same failure class it exists to catch.
if (files.length === 0) {
  fail('✗ GROUPS parsed to zero file paths -- this check is no longer working');
}

// existsSync is case-insensitive on Windows, so it would pass a path that fails on
// Linux CI. Compare against the real directory entry to catch that locally too.
function resolves(rel) {
  // Entries must be repo-relative: an absolute path or one climbing out through
  // '..' could resolve somewhere the review agent will never read.
  if (path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) return false;
  const abs = path.join(REPO_ROOT, rel);
  try {
    // isFile() matters because a directory entry would otherwise pass and review
    // nothing; readdir matters because existsSync alone is case-insensitive on
    // Windows and would pass a path that fails on Linux CI.
    return fs.statSync(abs).isFile()
      && fs.readdirSync(path.dirname(abs)).includes(path.basename(abs));
  } catch {
    return false;
  }
}

const missing = files.filter(f => !resolves(f));
if (missing.length > 0) {
  fail(
    `✗ ${REL} lists ${missing.length} path(s) that do not resolve:`,
    ...missing.map(f => `    ${f}`),
    '',
    'Each unresolvable path makes its review group review nothing while still',
    'reporting success. Fix the path (check spelling and case) or drop the entry.',
  );
}

const dupes = [...new Set(files.filter((f, i) => files.indexOf(f) !== i))];
if (dupes.length > 0) {
  fail(
    `✗ ${REL} lists ${dupes.length} duplicate path(s):`,
    ...dupes.map(f => `    ${f}`),
  );
}

// ── Direction 2: every source file is listed ──────────────────────────────────
//
// Everything above catches listed-but-missing. The opposite rot -- a file that
// exists but that nobody added to GROUPS -- has the same consequence and is much
// harder to notice: the file is handed to no review agent, so every full-repo
// review skips it and still reports success. Nothing anywhere says it was skipped.
//
// This FAILS rather than warns. A warning printed by a step that exits 0 renders
// as a green check, which is the same invisible-success failure this script exists
// to eliminate -- it would only move the silence up one level. Failing costs one
// line in GROUPS (or in EXCLUDED below), and the error message names the file and
// both options. Warning costs a source file that is never reviewed again.
//
// Splitting the rule -- fail for src/, warn for tests/ -- was considered and
// rejected: every file this check found unlisted on its first run was under
// tests/, so the drift-prone half is exactly the half a warning would not defend.
//
// Enforced roots are src/ and tests/ only, so the success line names them: this
// check's ✓ must never be read as "the whole repo is covered". Outside those roots
// GROUPS lists build.js, server.js, bitaxe_api.py, history_daemon.py and
// test_bitaxe_api.py by hand. Everything else outside them is reviewed by nobody
// and enforced by nothing -- notably all of scripts/*.cjs (this file included),
// vitest.config.js, eslint.config.mjs, the Dockerfile, and the review workflow
// itself. Adding 'scripts' as a third root is cheap and was left out only to keep
// this change scoped; it is the largest instance of the very rot fixed here.
const COVERED_ROOTS = ['src', 'tests'];

// Files under a covered root that are deliberately not reviewed. Every entry needs
// a reason. An entry that no longer exists, or that is also listed in GROUPS, fails
// the check: a stale opt-out is the same silent drift wearing a different hat.
const EXCLUDED = {
  'src/vendor/react.production.min.js':
    'vendored third-party minified build; integrity is guarded by scripts/verify-vendor.cjs',
  'src/vendor/react-dom.production.min.js':
    'vendored third-party minified build; integrity is guarded by scripts/verify-vendor.cjs',
  'src/vendor/MANIFEST.md':
    'vendor provenance record for the two files above, not project source',
};

const rootsLabel = COVERED_ROOTS.map(r => `${r}/`).join(' or ');

// Enumerated with git rather than a filesystem walk. A raw walk picks up ignored
// build junk (tests/__pycache__) and would fail on a developer machine but never in
// CI. '--others --exclude-standard' also covers files that are new but not yet
// staged, so a file added to the working tree is flagged before it is committed
// rather than after -- the cost being that a scratch file under a covered root
// fails `npm test` until it is deleted or listed. That is the intended trade.
//
// -z is load-bearing, not a style preference. Without it git C-quotes any path
// holding a non-ASCII byte, a backslash, a quote, or a control character --
// `src/café.js` is reported as the literal `"src/caf\303\251.js"`. That string
// matches nothing in GROUPS and stats to nothing on disk, so the file would drop
// out of the requirement entirely: an unlisted, unreviewed source file behind a
// green check, which is the exact failure this direction exists to catch. -z also
// makes the output unambiguous for paths containing a newline.
function gitPaths(args) {
  let out;
  try {
    out = execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    fail(
      `✗ could not enumerate source files with 'git ${args.slice(0, 2).join(' ')}'`,
      `  ${err.message}`,
      '  This check cannot verify coverage without it, so it fails rather than skips.',
    );
  }
  return out.split('\0').filter(Boolean);
}

const LS_SCOPE = ['--', ...COVERED_ROOTS];
// Deduped: during a conflicted merge '--cached' emits one line per stage, which
// would otherwise triple-count a path in the summary line.
const enumerated = [...new Set(
  gitPaths(['ls-files', '-z', '--cached', '--others', '--exclude-standard', ...LS_SCOPE]),
)];
// Asked for explicitly rather than inferred from a failed stat. A path in the index
// but gone from the worktree has nothing to review, so nothing to require -- and if
// GROUPS still lists it, the resolve check above has already failed.
const deleted = new Set(gitPaths(['ls-files', '-z', '--deleted', ...LS_SCOPE]));

const present = [];
for (const rel of enumerated) {
  if (deleted.has(rel)) continue;
  let stat;
  try {
    stat = fs.statSync(path.join(REPO_ROOT, rel));
  } catch {
    stat = null;
  }
  // Deliberately a failure and not a skip. Everything this check silently drops is
  // a file nothing requires to be reviewed, so "I could not interpret this path"
  // must never be allowed to mean "this path is fine".
  if (!stat || !stat.isFile()) {
    fail(
      `✗ git enumerates '${rel}' under ${rootsLabel}, but it is not a readable regular file`,
      '  Something is between this check and the real tree -- a nested git repo (a',
      '  gitlink is reported as a bare path and would exempt its whole subtree), a',
      '  sparse or partial checkout, or a path this script mis-parsed. Resolve it',
      '  rather than letting the entry drop: a dropped entry is an unenforced file.',
    );
  }
  present.push(rel);
}

// A smoke test, not a completeness assertion: it proves a root produced at least
// one file, which is enough to catch a root that moved or was misspelled. It cannot
// tell "git enumerated all 104 files" from "git enumerated 3 of them" -- that
// guarantee comes from -z and from the hard failure above, not from this loop.
for (const root of COVERED_ROOTS) {
  if (!present.some(p => p === root || p.startsWith(`${root}/`))) {
    fail(
      `✗ found no files under '${root}/' -- this coverage check is not checking anything`,
      '  Either the directory moved or git ls-files is not reporting it.',
    );
  }
}

const listedSet = new Set(files);
const excluded = new Set(Object.keys(EXCLUDED));
const presentSet = new Set(present);

for (const rel of excluded) {
  const reason = EXCLUDED[rel];
  if (typeof reason !== 'string' || reason.trim() === '') {
    fail(`✗ EXCLUDED entry '${rel}' has no reason -- every exclusion must state why`);
  }
  if (!presentSet.has(rel)) {
    fail(
      `✗ EXCLUDED lists '${rel}', which is not a file under ${rootsLabel}`,
      '  Drop the stale exclusion. Paths are matched exactly, including case.',
    );
  }
  if (listedSet.has(rel)) {
    fail(
      `✗ '${rel}' is both excluded here and listed in ${REL}`,
      '  Pick one: review it (drop the EXCLUDED entry) or do not (drop it from GROUPS).',
    );
  }
}

const unlisted = present.filter(p => !listedSet.has(p) && !excluded.has(p));
if (unlisted.length > 0) {
  fail(
    `✗ ${unlisted.length} file(s) under ${rootsLabel} are not listed in ${REL}:`,
    ...unlisted.map(f => `    ${f}`),
    '',
    'A file in no GROUPS entry is handed to no review agent, so every full-repo',
    'review skips it and still reports success. Add each path to the group it',
    'belongs to, or add it to EXCLUDED in this script with a reason.',
  );
}

console.log(`✓ full-repo-review.mjs: all ${files.length} reviewed paths resolve`);
console.log(
  `✓ coverage: all ${present.length - excluded.size} file(s) under ${rootsLabel} are listed `
  + `(${excluded.size} excluded by name; paths outside those roots are not enforced)`,
);
