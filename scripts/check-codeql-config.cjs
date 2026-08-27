#!/usr/bin/env node
// Guards .github/codeql/codeql-config.yml -- the file that decides what CodeQL
// actually looks at.
//
// Why this exists: the config carries a paths-ignore list, and nothing in the repo
// asserted on it. Re-adding a file, or widening an entry to a glob, drops that code
// out of every CodeQL run while `npm test` and every CI job stay green -- the scan
// still reports success, it just covers less. That is the same silent-coverage-loss
// failure class that smoke-build.cjs step 15 guards for the secrets scanner, and this
// is the equivalent guard for its direct sibling.
//
// Two design rules, both learned the hard way in this repo:
//
//   1. STRICT ALLOWLISTS, never denylists. A denylist only blocks the mutation its
//      author imagined -- an earlier denylist elsewhere in this repo rejected the
//      obvious cases and sailed straight past `^src/`, `/^.*/` and `/\.md$/`, each of
//      which re-blinds an entire tree just as completely. Every list below is compared
//      with deepStrictEqual, so ANY edit to the guarded config -- widening, narrowing,
//      reordering, or adding a key nobody here anticipated -- fails until this file is
//      edited too. That forced edit IS the review gate.
//
//   2. PARSE, do not regex the file. A regex over the raw text is defeated by an
//      innocent reformat: switch to flow style, requote an entry, change the indent,
//      and a text match silently stops finding what it was checking. The parser below
//      is deliberately tiny and deliberately STRICT -- it understands exactly the
//      subset this config uses and THROWS on everything else. A reformat it cannot
//      read fails the build loudly rather than passing quietly. That is the same
//      posture check-review-paths.cjs takes with GROUPS: anything unparseable must
//      fail loudly, because partial silent coverage is the bug being eliminated.
//
// Deliberately zero-dependency, like check-secrets.cjs. Reaching for a YAML library
// would make a security guard's integrity depend on a third-party publish, and would
// buy only the flow-style/quoting cases that the parser below rejects loudly anyway.
//
// KNOWN LIMIT, stated up front so nobody mistakes this for more than it is: this is a
// STRUCTURAL guard. It proves the config still says what it should. It cannot prove
// CodeQL honoured it -- that runs on GitHub's side, and no assertion here observes a
// real scan. tests/unit/checkCodeqlConfig.test.js is the behaviour half: it executes
// this checker against mutated fixtures, so a hollowed-out version of THIS file gets
// caught. Nothing local can catch a hollowed-out CodeQL.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const CONFIG_REL = '.github/codeql/codeql-config.yml';
const WORKFLOW_REL = '.github/workflows/codeql.yml';

// ── The guarded values ────────────────────────────────────────────────────────
//
// Every constant below is an exact expectation, not a floor and not a pattern.

// The complete set of top-level keys the config is allowed to carry. This is the
// sharpest assertion in the file, and the one that catches mutations nobody listed:
// `paths:` restricts analysis to a subset (everything else stops being scanned),
// `query-filters:` can exclude rules wholesale, and `packs:` can swap the query set.
// Enumerating those individually would be a denylist. Pinning the whole key set means
// any key at all -- including one invented after this was written -- has to come
// through here.
const ALLOWED_TOP_LEVEL_KEYS = ['name', 'paths-ignore'];

// Files CodeQL is allowed to skip. Order-sensitive on purpose: deepStrictEqual on the
// array is what makes a reorder-plus-insert impossible to slip through.
//
// index.html only -- the built artifact build.js writes. Scanning it means scanning
// minified vendor React, which reports findings nobody can act on in source. The
// pattern is a repo-root-relative path rather than a basename, so src/index.html is
// still scanned; the config carries a comment saying so.
//
// setup.html was the second entry until #141 removed it. This list was updated in the
// same breath, because the guard failed the build until it was -- which is the whole
// design: the forced edit is the review gate. Every other tracked .html is
// hand-written and analysed.
const PATHS_IGNORE_ALLOWED = ['index.html'];

// The workflow must keep pointing at the config, or every assertion above guards a
// file that nothing reads.
const EXPECTED_CONFIG_FILE = '.github/codeql/codeql-config.yml';
// Narrowing this to the default suite silently drops the majority of the rules while
// the workflow stays green and still reports "CodeQL passed".
const EXPECTED_QUERIES = 'security-extended,security-and-quality';
const EXPECTED_LANGUAGES = ['javascript-typescript', 'python'];

// ── A very small, very strict YAML block parser ───────────────────────────────
//
// Handles exactly: top-level `key: scalar`, top-level `key:` followed by a block
// sequence of `- scalar` items, blank lines, and whole-line comments. Everything
// else throws. The throw is the feature -- see rule 2 in the header.

class YamlShapeError extends Error {}

// Strips an inline comment the way YAML does: a `#` only starts a comment when it is
// preceded by whitespace. `a#b` is the scalar `a#b`, `a #b` is the scalar `a`.
function stripInlineComment(value) {
  const m = value.match(/\s#.*$/);
  return (m ? value.slice(0, m.index) : value).trim();
}

// Unquotes a scalar, refusing anything with escape sequences rather than guessing at
// their semantics. An unbalanced quote is a shape this parser must not interpret.
function parseScalar(raw, lineNo) {
  const value = stripInlineComment(raw);
  const quote = value[0];
  if (quote !== '"' && quote !== "'") {
    if (/^[[{&*!|>]/.test(value)) {
      throw new YamlShapeError(
        `line ${lineNo}: value starts with the YAML indicator '${value[0]}' (flow collection, anchor, alias, tag or block scalar). ` +
        'This guard parses only plain block YAML and will not guess at that shape -- rewrite the config in block style, ' +
        'or teach scripts/check-codeql-config.cjs the new shape deliberately.',
      );
    }
    return value;
  }
  if (value.length < 2 || value[value.length - 1] !== quote) {
    throw new YamlShapeError(`line ${lineNo}: unbalanced ${quote} quote in ${JSON.stringify(value)}`);
  }
  const inner = value.slice(1, -1);
  if (inner.includes('\\') || inner.includes(quote)) {
    throw new YamlShapeError(
      `line ${lineNo}: quoted scalar ${JSON.stringify(value)} contains an escape or a nested quote -- ` +
      'this guard will not guess at escape semantics.',
    );
  }
  return inner;
}

function parseSimpleYaml(text) {
  const out = Object.create(null);
  let currentKey = null;

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i].replace(/\r$/, '');

    if (line.includes('\t')) {
      throw new YamlShapeError(`line ${lineNo}: tab character -- YAML forbids tabs for indentation`);
    }
    if (line.trim() === '' || /^\s*#/.test(line)) continue;
    if (/^(---|\.\.\.)\s*$/.test(line)) {
      throw new YamlShapeError(
        `line ${lineNo}: document marker '${line.trim()}' -- this guard reads a single-document config only.`,
      );
    }

    // Block sequence item, at any indent. Both `- x` at column 0 and `  - x` are
    // valid YAML under a key, and a reformat between them must not change the result.
    const item = line.match(/^\s*-\s+(.+)$/);
    if (item) {
      if (currentKey === null) {
        throw new YamlShapeError(`line ${lineNo}: sequence item before any top-level key`);
      }
      if (!Array.isArray(out[currentKey])) {
        throw new YamlShapeError(
          `line ${lineNo}: sequence item under '${currentKey}', which was already given a scalar value`,
        );
      }
      out[currentKey].push(parseScalar(item[1], lineNo));
      continue;
    }
    if (/^\s*-\s*$/.test(line)) {
      throw new YamlShapeError(`line ${lineNo}: empty sequence item`);
    }

    // Top-level mapping key. Anchored at column 0: an indented key means nesting,
    // which this parser does not model and must not silently flatten.
    const kv = line.match(/^([A-Za-z0-9_.-]+):(?:\s+(.*))?$/);
    if (!kv) {
      if (/^\s+\S/.test(line)) {
        throw new YamlShapeError(
          `line ${lineNo}: indented content ${JSON.stringify(line.trim())} -- this guard models only ` +
          'top-level keys and their block sequences, not nested mappings.',
        );
      }
      throw new YamlShapeError(`line ${lineNo}: cannot parse ${JSON.stringify(line)}`);
    }

    const [, key, rawValue] = kv;
    if (key in out) {
      throw new YamlShapeError(`line ${lineNo}: duplicate top-level key '${key}'`);
    }
    const value = rawValue === undefined ? '' : stripInlineComment(rawValue);
    if (value === '') {
      // Empty value: a block sequence is expected to follow. If none does it stays [],
      // and the deepStrictEqual against the allowlist below is what reports that.
      out[key] = [];
      currentKey = key;
    } else {
      out[key] = parseScalar(rawValue, lineNo);
      currentKey = key;
    }
  }

  return out;
}

// ── The checks ────────────────────────────────────────────────────────────────

// Drops whole-line comments before matching workflow text. Repo precedent, and it has
// bitten here three times: an unanchored match is satisfied by prose that merely
// mentions the thing being asserted, so a commented-out line plus its explanatory
// comment reads as present. This file's own header names `paths-ignore`, `paths:` and
// `query-filters:` for exactly that reason -- it is never scanned by these regexes,
// but the habit is the point.
function stripCommentLines(text) {
  return text.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Returns an array of human-readable problems. Empty array means the gate is intact.
// Pure: takes text, touches no filesystem, so the behaviour test can drive it with
// mutated fixtures.
function checkCodeqlConfig({ configText, workflowText }) {
  const problems = [];

  let config;
  try {
    config = parseSimpleYaml(configText);
  } catch (err) {
    if (err instanceof YamlShapeError) {
      return [
        `${CONFIG_REL} is no longer in a shape this guard can read: ${err.message}`,
        '  The guard fails loudly rather than passing on a file it cannot verify.',
        '  Either restore plain block YAML, or update scripts/check-codeql-config.cjs deliberately.',
      ];
    }
    throw err;
  }

  // Exact key set, both directions. A subset test would pass vacuously on {} -- which
  // is precisely what a broken parse returns, so the guard would go green at the exact
  // moment it stopped working.
  const keys = Object.keys(config).sort();
  const expectedKeys = [...ALLOWED_TOP_LEVEL_KEYS].sort();
  if (!deepEqual(keys, expectedKeys)) {
    problems.push(
      `${CONFIG_REL} top-level keys are ${JSON.stringify(keys)}, expected exactly ${JSON.stringify(expectedKeys)}.`,
      '  Keys not on this list can silently shrink what CodeQL scans: `paths:` restricts analysis to a',
      '  subset, `query-filters:` excludes rules, `packs:` swaps the query set. Each leaves the workflow',
      '  green while covering less. If the new key is deliberate, add it to ALLOWED_TOP_LEVEL_KEYS.',
    );
  }

  const pathsIgnore = config['paths-ignore'];
  if (pathsIgnore !== undefined) {
    if (!Array.isArray(pathsIgnore)) {
      problems.push(
        `${CONFIG_REL} paths-ignore parsed as a scalar (${JSON.stringify(pathsIgnore)}), expected a block sequence.`,
      );
    } else if (!deepEqual(pathsIgnore, PATHS_IGNORE_ALLOWED)) {
      problems.push(
        `${CONFIG_REL} paths-ignore is ${JSON.stringify(pathsIgnore)}, expected exactly ${JSON.stringify(PATHS_IGNORE_ALLOWED)}.`,
        '  Every entry here is code CodeQL never analyses. Adding one drops that file out of every scan,',
        '  and a glob (`**/*.html`, `src`, `**`) can drop the whole tree -- with the workflow still green.',
        '  If the change is deliberate, update PATHS_IGNORE_ALLOWED in scripts/check-codeql-config.cjs too.',
      );
    }
  }

  // ── The config only matters if the workflow still reads it ──────────────────
  const wf = stripCommentLines(workflowText);

  const configFile = wf.match(/^\s*config-file:\s*(\S+)\s*$/m);
  if (!configFile) {
    problems.push(
      `${WORKFLOW_REL} no longer passes config-file: to codeql-action/init.`,
      `  Without it CodeQL ignores ${CONFIG_REL} entirely and every assertion above guards a dead file.`,
    );
  } else if (configFile[1] !== EXPECTED_CONFIG_FILE) {
    problems.push(
      `${WORKFLOW_REL} points config-file: at ${JSON.stringify(configFile[1])}, expected ${JSON.stringify(EXPECTED_CONFIG_FILE)}.`,
      '  This guard reads the file at the expected path; a workflow reading a different one means the two have drifted.',
    );
  }

  const queries = wf.match(/^\s*queries:\s*(\S+)\s*$/m);
  if (!queries) {
    problems.push(
      `${WORKFLOW_REL} no longer sets queries: -- CodeQL falls back to its default suite, which is a`,
      `  fraction of ${EXPECTED_QUERIES}. Fewer rules, same green check.`,
    );
  } else if (queries[1] !== EXPECTED_QUERIES) {
    problems.push(
      `${WORKFLOW_REL} sets queries: ${JSON.stringify(queries[1])}, expected ${JSON.stringify(EXPECTED_QUERIES)}.`,
      '  Narrowing the suite drops rules silently. If deliberate, update EXPECTED_QUERIES.',
    );
  }

  const languageLine = wf.match(/^\s*language:\s*\[(.*)\]\s*$/m);
  if (!languageLine) {
    problems.push(`${WORKFLOW_REL} no longer declares a language matrix this guard can read.`);
  } else {
    const languages = languageLine[1].split(',').map(s => s.trim()).filter(Boolean);
    if (!deepEqual(languages, EXPECTED_LANGUAGES)) {
      problems.push(
        `${WORKFLOW_REL} analyses ${JSON.stringify(languages)}, expected exactly ${JSON.stringify(EXPECTED_LANGUAGES)}.`,
        '  Dropping a language stops scanning that half of the repo while the workflow still reports success.',
      );
    }
  }

  // Both of these leave the job present and permanently green, which is worse than
  // deleting it: the check still reports, so nobody notices it stopped meaning anything.
  if (/^\s*if:/m.test(wf)) {
    problems.push(
      `${WORKFLOW_REL} gained an \`if:\` condition -- a job that skips reports success and enforces nothing.`,
    );
  }
  if (/continue-on-error/.test(wf)) {
    problems.push(
      `${WORKFLOW_REL} gained continue-on-error -- the analysis could fail and the job would still report green.`,
    );
  }

  return problems;
}

function readOrNull(rel) {
  try {
    return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
  } catch {
    return null;
  }
}

// Reads the real files and returns problems. Missing files are a problem, not a crash,
// and emphatically not a pass -- check-secrets.cjs shipped a bug where an unreadable
// file made a broken run indistinguishable from a clean one.
function checkRepo() {
  const configText = readOrNull(CONFIG_REL);
  const workflowText = readOrNull(WORKFLOW_REL);
  const problems = [];
  if (configText === null) {
    problems.push(`${CONFIG_REL} is missing or unreadable -- CodeQL's scope is no longer pinned by anything.`);
  }
  if (workflowText === null) {
    problems.push(`${WORKFLOW_REL} is missing or unreadable -- the CodeQL analysis may not run at all.`);
  }
  if (problems.length > 0) return problems;
  return checkCodeqlConfig({ configText, workflowText });
}

if (require.main === module) {
  const problems = checkRepo();
  if (problems.length > 0) {
    console.error(`✗ ${CONFIG_REL} guard failed:`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`✓ CodeQL config intact (paths-ignore: ${PATHS_IGNORE_ALLOWED.join(', ')})`);
}

module.exports = {
  checkCodeqlConfig,
  checkRepo,
  parseSimpleYaml,
  YamlShapeError,
  ALLOWED_TOP_LEVEL_KEYS,
  PATHS_IGNORE_ALLOWED,
  EXPECTED_QUERIES,
  EXPECTED_LANGUAGES,
};
