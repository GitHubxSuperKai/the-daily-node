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
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

const files = [];
for (const [i, group] of groups.entries()) {
  const where = group && group.key ? `group '${group.key}'` : `group #${i}`;
  if (!group || !Array.isArray(group.files)) {
    fail(`✗ ${where} has no files array -- this check can no longer read GROUPS`);
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

console.log(`✓ full-repo-review.mjs: all ${files.length} reviewed paths resolve`);
