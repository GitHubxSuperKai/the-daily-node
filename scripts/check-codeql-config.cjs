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
//      which re-blinds an entire tree just as completely. ALLOWED_TOP_LEVEL_KEYS,
//      PATHS_IGNORE_ALLOWED, EXPECTED_USES, EXPECTED_MATRIX_KEYS and the per-step
//      EXPECTED_STEP_INPUTS are each compared with deepStrictEqual, so ANY edit --
//      widening, narrowing, reordering, or adding something nobody here anticipated --
//      fails until this file is edited too. That forced edit IS the review gate.
//
//      This took two review rounds to get right, and the misses are worth recording
//      because they were all the same mistake at different depths. Round one guarded
//      the workflow with a denylist of four keys: deleting the `Perform CodeQL
//      Analysis` step, commenting it out, hardcoding `languages:` past the matrix, and
//      repointing an action at a fork all passed. Round two pinned the actions and the
//      matrix binding, and the same shape reappeared one level down -- `upload: never`
//      added to the analyze step's `with:` (a real action input that suppresses the
//      results upload entirely: green job, no alerts, ever) and `exclude:` added under
//      `matrix:` (drops a language from the expansion while `language:` still lists it)
//      both passed. Pinning whole KEY SETS rather than checking keys somebody thought
//      of is what actually closed the class: an addition has to come through here.
//
//      Two residual DENYLIST assertions remain, on `if:` and `continue-on-error:`, and
//      they are named rather than glossed because the first version claimed a blanket
//      allowlist it did not implement. They are a backstop, not the primary defence.
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
const assert = require('assert');

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

// Every `uses:` in the workflow, in order, as a strict allowlist. This is the workflow
// half's equivalent of ALLOWED_TOP_LEVEL_KEYS, and it exists because the first version
// of this file guarded the workflow with a DENYLIST -- which is the one thing the brief
// forbade, and it showed: deleting the `Perform CodeQL Analysis` step entirely left the
// job named, required, green, and analysing nothing, and the guard passed. So did
// repointing the action at a fork. Both are caught here now.
//
// Pinning the versions means an action bump needs an edit here. That is deliberate and
// not merely tolerated: `@v3`/`@v4` bumps are exactly what ship-it's release step asks
// about, so the forced edit puts a human on that decision.
const EXPECTED_USES = [
  'actions/checkout@v6',
  'github/codeql-action/init@v4',
  'github/codeql-action/analyze@v4',
];
// The matrix is only worth asserting if something consumes it. Hardcoding a single
// language here while leaving the matrix listing both passed every earlier assertion
// and silently stopped scanning Python.
const EXPECTED_LANGUAGES_BINDING = '${{ matrix.language }}';

// The matrix's own key set. Listing both languages is not enough: `exclude:` under
// `matrix:` removes one from the expansion while `language:` still names it and the
// binding still reads it, so that language is silently never scanned again.
const EXPECTED_MATRIX_KEYS = ['language'];

// The complete ordered input set of each codeql-action step. Spot-checking
// config-file/queries/languages left every other input unconstrained, and the
// dangerous mutations are ADDITIONS rather than edits: `upload: never` on analyze is a
// real action input that suppresses the results upload, so the job stays green and no
// alert ever reaches the security tab; `packs:` on init swaps the query set out from
// under the pinned `queries:` value.
const EXPECTED_STEP_INPUTS = {
  'github/codeql-action/init@v4': ['languages', 'queries', 'config-file'],
  'github/codeql-action/analyze@v4': ['category'],
};

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

  // Strip a UTF-8 BOM. JS \s matches U+FEFF, so a BOM otherwise makes line 1 look like
  // indented content and reports a nested-mapping error, which is true but useless.
  const lines = text.replace(/^\uFEFF/, '').split('\n');
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
    // `key: # comment` is idiomatic YAML for "key, with the block below". The kv regex
    // has already eaten the whitespace before the `#`, so stripInlineComment can no
    // longer tell it is a comment and would hand back the literal string "# comment" --
    // making the following `- item` throw "already given a scalar value", which is
    // fail-loud but names the wrong problem.
    const value = rawValue === undefined || /^#/.test(rawValue) ? '' : stripInlineComment(rawValue);
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

// NOTE ON COMMENTS IN THE WORKFLOW.
//
// The repo's most-repeated lesson (PRs #133/#134/#135) is that an unanchored assertion
// is satisfied by prose that merely mentions the thing being asserted -- comment out the
// real line, leave the comment explaining it, and the check reads it as present. Step 14
// of smoke-build.cjs handles that by stripping `#` lines before matching.
//
// This file did the same, and it was dead weight: every workflow regex below anchors the
// key to the start of the line (`^\s*config-file:`, `^\s*(?:-\s+)?uses:`, `^\s*if:`), and
// a commented line begins with `#`, which is not whitespace. No `#`-prefixed line can
// satisfy any of them, so stripping comments never changed a single verdict -- neutering
// the strip to `return text` left all 56 cases green, which is how it was found.
//
// It is deleted rather than kept-and-tested, because a helper whose comment claims a
// protection it does not provide is the same failure class one level up. ANCHORING is
// the defence here. The "config-file: is commented out" case in the behaviour test
// asserts that directly.

// The real thing, not a JSON.stringify comparison. Serialised equality happens to be
// exact for the arrays of plain strings used here, but the header and the CHANGELOG
// both say deepStrictEqual, and a guard whose documentation overstates it is how the
// workflow denylist above got shipped claiming to be an allowlist.
function deepEqual(a, b) {
  try {
    assert.deepStrictEqual(a, b);
    return true;
  } catch {
    return false;
  }
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
  //
  // Everything here uses matchAll and asserts EXACTLY ONE occurrence rather than
  // taking the first /m match. A non-global /m regex matches anywhere in the file, so
  // an earlier step -- a `run: |` block whose body happens to start a line with one of
  // these keys, or a second job -- silently misdirects the assertion onto text that is
  // not the setting being guarded, while the real one is free to say anything.
  const wf = workflowText;

  // Reads the keys of an indented block, in order. Used to pin whole `with:` and
  // `matrix:` blocks rather than spot-checking the keys somebody thought of: the four
  // pinned keys were a denylist of four, and `upload: never` on the analyze step (a
  // real codeql-action input that suppresses the results upload entirely) sailed
  // through with the job green and zero alerts ever reaching the security tab.
  // Two rules here, both learned by this helper shipping without them and handing back
  // the two escapes it had just been written to close:
  //
  //   - A comment must not END a block. Comments were not skipped, so a `#` written at
  //     column 0 read as an outdent and everything after it went unseen.
  //   - A line this cannot read must be REPORTED, not skipped. Dropping unparseable
  //     lines silently is how `"upload": never` -- a quoted key, ordinary YAML that
  //     GitHub Actions honours, suppressing the results upload entirely -- passed with
  //     the job green. Quoted keys are read properly now, and anything still unreadable
  //     comes back as a sentinel that no allowlist can match, so it fails loudly. That
  //     is the posture parseSimpleYaml already takes; this helper was the exception.
  const blockKeys = (text, header) => {
    const lines = text.split('\n');
    const i = lines.findIndex(l => header.test(l));
    if (i === -1) return null;
    const indent = lines[i].match(/^\s*/)[0].length;
    const keys = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === '' || /^\s*#/.test(line)) continue;
      const lead = line.match(/^\s*/)[0].length;
      if (lead <= indent) break;
      const kv = line.match(/^\s*-?\s*(?:(['"])([^'"]+)\1|([A-Za-z0-9_-]+))\s*:/);
      keys.push(kv ? (kv[2] || kv[3]) : `<unreadable: ${line.trim()}>`);
    }
    return keys;
  };

  // One occurrence, exact value. `\s*:` not `:` -- `key : value` is a valid YAML
  // mapping key, and a single space was enough to walk past an anchored `key:` test.
  const pinOne = (key, expected, why) => {
    // `['"]?` around the key: quoting a key is ordinary YAML and GitHub Actions honours
    // it, so an assertion that only matches the bare spelling is walked past by two
    // characters. Same reason `\s*:` is there rather than `:`.
    const rx = new RegExp(`^\\s*['"]?${key}['"]?\\s*:\\s*(.+?)\\s*(?:#.*)?$`, 'gm');
    const hits = [...wf.matchAll(rx)].map(m => m[1]);
    if (hits.length === 0) {
      problems.push(`${WORKFLOW_REL} no longer sets ${key}: -- ${why}`);
    } else if (hits.length > 1) {
      problems.push(
        `${WORKFLOW_REL} sets ${key}: ${hits.length} times (${JSON.stringify(hits)}) -- this guard pins one`,
        '  occurrence, and more than one means it can no longer tell which is the live setting.',
      );
    } else if (hits[0] !== expected) {
      problems.push(
        `${WORKFLOW_REL} sets ${key}: ${JSON.stringify(hits[0])}, expected ${JSON.stringify(expected)}.`,
        `  ${why}`,
      );
    }
  };

  pinOne('config-file', EXPECTED_CONFIG_FILE,
    `Without it CodeQL ignores ${CONFIG_REL} entirely and every assertion above guards a dead file.`);
  pinOne('queries', EXPECTED_QUERIES,
    'Narrowing the suite drops the majority of the rules while the job still reports "CodeQL passed".');
  // Asserting the matrix without asserting that anything READS it guards nothing:
  // hardcoding one language here leaves the matrix listing both and Python unscanned.
  pinOne('languages', EXPECTED_LANGUAGES_BINDING,
    'Hardcoding a language here leaves the matrix listing both and silently stops scanning the other.');

  const languageLine = wf.match(/^\s*language\s*:\s*\[(.*)\]\s*$/m);
  if (!languageLine) {
    problems.push(`${WORKFLOW_REL} no longer declares a language matrix this guard can read.`);
  } else {
    const languages = languageLine[1].split(',').map(x => x.trim()).filter(Boolean);
    if (!deepEqual(languages, EXPECTED_LANGUAGES)) {
      problems.push(
        `${WORKFLOW_REL} analyses ${JSON.stringify(languages)}, expected exactly ${JSON.stringify(EXPECTED_LANGUAGES)}.`,
        '  Dropping a language stops scanning that half of the repo while the workflow still reports success.',
      );
    }
  }

  // The matrix key set, pinned. Listing both languages is not enough: `exclude:` under
  // `matrix:` removes one from the expansion while the `language:` line still names it,
  // the binding is still `${{ matrix.language }}`, every `uses:` is intact -- and that
  // language is never scanned again.
  const matrixKeys = blockKeys(wf, /^\s*matrix\s*:\s*$/);
  if (!deepEqual(matrixKeys, EXPECTED_MATRIX_KEYS)) {
    problems.push(
      `${WORKFLOW_REL} matrix declares ${JSON.stringify(matrixKeys)}, expected exactly ${JSON.stringify(EXPECTED_MATRIX_KEYS)}.`,
      '  `include:`/`exclude:` here change which languages actually run without touching the language list.',
    );
  }

  // Strict allowlist over every action the workflow runs, in order. Catches the
  // analyze step being deleted or commented out (which leaves the job named, required,
  // green and analysing nothing at all), a step being added, and an action repointed at
  // a fork.
  //
  // The `-?` matters: a step can be `- uses: x` (the action IS the step) or `- name: …`
  // then an indented `uses: x`. This workflow uses both, and a pattern matching only the
  // second silently dropped actions/checkout from the list. The trailing-comment group
  // matters for the same reason: `- uses: evil/x@v1 # pinned` was invisible to the
  // earlier pattern, so an INSERTED step escaped an allowlist whose whole job is to
  // notice insertions.
  const uses = [...wf.matchAll(/^\s*(?:-\s+)?['"]?uses['"]?\s*:\s*(\S+)\s*(?:#.*)?$/gm)].map(m => m[1]);
  if (!deepEqual(uses, EXPECTED_USES)) {
    problems.push(
      `${WORKFLOW_REL} runs ${JSON.stringify(uses)}, expected exactly ${JSON.stringify(EXPECTED_USES)}.`,
      '  A missing github/codeql-action/analyze step leaves the job named, required and green while',
      '  analysing nothing at all; a repointed `uses:` runs somebody else\'s action under this name.',
      '  If an action was deliberately bumped or added, update EXPECTED_USES too.',
    );
  }

  // The inputs to each codeql-action step, pinned as complete ordered key sets. Spot-
  // checking config-file/queries/languages leaves every OTHER input unconstrained, and
  // the dangerous ones are additions rather than edits: `upload: never` on analyze
  // suppresses the results upload (green job, no alerts, ever), and `packs:` on init
  // swaps the query set out from under the pinned `queries:` value.
  for (const [action, expected] of Object.entries(EXPECTED_STEP_INPUTS)) {
    const escaped = action.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const stepIdx = wf.search(new RegExp(`^\\s*(?:-\\s+)?uses\\s*:\\s*${escaped}\\s*(?:#.*)?$`, 'm'));
    if (stepIdx === -1) continue;   // the uses allowlist above already reported this
    const keys = blockKeys(wf.slice(stepIdx), /^\s*with\s*:\s*$/);
    if (!deepEqual(keys, expected)) {
      problems.push(
        `${WORKFLOW_REL} passes ${JSON.stringify(keys)} to ${action}, expected exactly ${JSON.stringify(expected)}.`,
        '  An added input can disable the step without touching anything pinned above --',
        '  `upload: never` uploads no results at all, and the job still reports success.',
      );
    }
  }

  // Both of these leave the job present and permanently green, which is worse than
  // deleting it: the check still reports, so nobody notices it stopped meaning anything.
  // `\s*:` because `if : false` is valid YAML and a single space walked past `if:`.
  // GitHub counts a skipped required check as satisfied, so this is a silent bypass.
  if (/^\s*['"]?if['"]?\s*:/m.test(wf)) {
    problems.push(
      `${WORKFLOW_REL} gained an \`if:\` condition -- a job that skips reports success and enforces nothing.`,
    );
  }
  // Anchored as a key, not a substring: unanchored, an inline comment that merely
  // mentions the setting ("# deliberately no continue-on-error") failed the build.
  if (/^\s*['"]?continue-on-error['"]?\s*:/m.test(wf)) {
    problems.push(
      `${WORKFLOW_REL} gained continue-on-error -- the analysis could fail and the job would still report green.`,
    );
  }
  return problems;
}

function readOrNull(rel, root) {
  try {
    return fs.readFileSync(path.join(root, rel), 'utf8');
  } catch {
    return null;
  }
}

// Reads the files under `root` and returns problems. Missing files are a problem, not a
// crash, and emphatically not a pass -- check-secrets.cjs shipped a bug where an
// unreadable file made a broken run indistinguishable from a clean one.
//
// `root` is a parameter purely so the behaviour test can drive this end-to-end against
// a temp directory holding a mutated config. Without that, checkRepo had exactly one
// test asserting exactly `[]`, and replacing the file read with a hardcoded good string
// -- which makes `npm run check:codeql` and smoke step 16 decorative, reporting the
// config intact no matter what it says -- kept the whole suite green.
function checkRepo(root = REPO_ROOT) {
  const configText = readOrNull(CONFIG_REL, root);
  const workflowText = readOrNull(WORKFLOW_REL, root);
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

// Only what the behaviour test and smoke step 16 actually consume. The other pinned
// constants were exported too and nothing imported them; an export nobody reads is a
// surface that has to keep working for no one.
module.exports = {
  checkCodeqlConfig,
  checkRepo,
  parseSimpleYaml,
  YamlShapeError,
  PATHS_IGNORE_ALLOWED,
};
