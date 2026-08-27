// Behaviour test for scripts/check-codeql-config.cjs -- the guard on CodeQL's scope.
//
// Why this exists: smoke-build.cjs step 16 runs that guard against exactly one input,
// the real config, which it passes. A guard exercised only on the input it accepts is
// the likeliest of all to be vacuous -- `return []` passes step 16 forever, and so does
// a parser that silently yields {} for every file. Neither is visible from a structural
// assertion. Every case below EXECUTES the checker and asserts on what it returns.
//
// The lesson this file is built on: an invariant asserted in a comment is a TODO, not a
// guard. Nothing here claims a property it does not then run.
//
// It lives in vitest specifically. .github/workflows/build.yml runs `npm run test:unit`
// and enumerates its other steps individually -- it never runs `npm test`, so a check
// wired only into that chain gets zero CI coverage.
//
// This runs under the suite-wide jsdom environment even though nothing here needs a DOM.
// Do not add a per-file docblock opting into node: tests/setup.js touches `document` at
// import time and runs for every file, so the suite fails at load. Vitest scans the whole
// file for that pragma, so even naming it in a comment switches the environment -- which
// is why it is described here rather than spelled.
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const {
  checkCodeqlConfig,
  checkRepo,
  parseSimpleYaml,
  YamlShapeError,
  PATHS_IGNORE_ALLOWED,
} = require(path.join(REPO_ROOT, 'scripts', 'check-codeql-config.cjs'));

const CONFIG_PATH = path.join(REPO_ROOT, '.github', 'codeql', 'codeql-config.yml');
const WORKFLOW_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'codeql.yml');

// Read as-is, then normalise to LF for the string surgery below. On Windows these
// files check out with CRLF (core.autocrlf=true), so a mutation written as
// `.replace('  - index.html\n', '')` matches nothing at all -- the case then asserts
// against a pristine config and "fails to reject" for a reason that has nothing to do
// with the guard. That is not hypothetical: it is what the first run of this file did.
// The LF/CRLF pair below keeps both endings under test regardless of how git checked
// the files out here, and every mutation case re-asserts that it changed something.
const asLF = s => s.replace(/\r\n/g, '\n');
const GOOD_CONFIG = asLF(fs.readFileSync(CONFIG_PATH, 'utf8'));
const GOOD_WORKFLOW = asLF(fs.readFileSync(WORKFLOW_PATH, 'utf8'));

const check = (configText, workflowText = GOOD_WORKFLOW) =>
  checkCodeqlConfig({ configText, workflowText });

describe('check-codeql-config: the real repo', () => {
  // The positive control. If this ever fails, every "rejected" case below becomes
  // meaningless -- a checker that rejects its own valid input rejects everything.
  it('passes against the committed config and workflow', () => {
    expect(checkRepo()).toEqual([]);
  });

  it('is wired into the smoke suite, so CI runs it against the real files', () => {
    const smoke = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'smoke-build.cjs'), 'utf8');
    expect(smoke).toMatch(/require\('\.\/check-codeql-config\.cjs'\)/);
    expect(smoke).toMatch(/^assert\.deepStrictEqual\(codeqlProblems, \[\],$/m);
  });

  // checkRepo used to have exactly one case, asserting exactly []. Replacing its file
  // read with a hardcoded good string -- which makes `npm run check:codeql` and smoke
  // step 16 decorative, reporting the config intact whatever the real file says -- kept
  // the whole suite green. These two drive it against a temp root instead, so the read
  // itself is under test: the first proves it reports a clean tree clean, the second
  // proves it actually reads what is on disk rather than something it already knew.
  describe('checkRepo reads from disk', () => {
    const tmpRoots = [];
    const makeRoot = (configText, workflowText) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dn-codeql-'));
      tmpRoots.push(root);
      fs.mkdirSync(path.join(root, '.github', 'codeql'), { recursive: true });
      fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
      fs.writeFileSync(path.join(root, '.github', 'codeql', 'codeql-config.yml'), configText);
      fs.writeFileSync(path.join(root, '.github', 'workflows', 'codeql.yml'), workflowText);
      return root;
    };
    afterAll(() => {
      for (const d of tmpRoots) fs.rmSync(d, { recursive: true, force: true });
    });

    it('passes on a faithful copy of the committed files', () => {
      expect(checkRepo(makeRoot(GOOD_CONFIG, GOOD_WORKFLOW))).toEqual([]);
    });

    it('rejects a widened config that exists only on disk', () => {
      const widened = GOOD_CONFIG.replace('  - index.html', "  - '**'");
      expect(widened).not.toEqual(GOOD_CONFIG);
      expect(checkRepo(makeRoot(widened, GOOD_WORKFLOW))).not.toEqual([]);
    });

    // The mirror of the case above, for the WORKFLOW read. Without it, pointing the
    // workflow read at REPO_ROOT while honouring `root` for the config -- or hardcoding
    // it outright -- kept all cases green, which leaves the entire workflow half of the
    // guard (the uses allowlist, the step inputs, the matrix, the binding) decorative
    // in exactly the way this describe block exists to prevent.
    it('rejects a gutted workflow that exists only on disk', () => {
      const gutted = GOOD_WORKFLOW.replace(/\n {6}- name: Perform CodeQL Analysis[\s\S]*$/, '\n');
      expect(gutted).not.toEqual(GOOD_WORKFLOW);
      expect(checkRepo(makeRoot(GOOD_CONFIG, gutted))).not.toEqual([]);
    });

    it('reports a missing config rather than passing over it', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dn-codeql-empty-'));
      tmpRoots.push(root);
      const problems = checkRepo(root);
      expect(problems).not.toEqual([]);
      expect(problems.join(' ')).toMatch(/missing or unreadable/);
    });
  });

  // The allowlist is the gate. Reading it back off the file it guards would make the
  // assertion self-fulfilling -- it would agree with any edit. This pins the value.
  //
  // It is one entry, the built artifact. #141 removed setup.html from the config while
  // this branch was open; the guard failed the build until this list was updated, which
  // is exactly what it is for. The pattern is a repo-root-relative path, so src/index.html
  // -- hand-written source -- is still analysed.
  it('pins paths-ignore to the one file that is deliberately skipped', () => {
    expect(PATHS_IGNORE_ALLOWED).toEqual(['index.html']);
  });

  // The assertion above pins the imported VALUE, which is not the same as pinning the
  // literal. Replacing the constant's definition with one that reads paths-ignore back
  // out of the config at load time keeps every case green -- the derived value agrees
  // with the file, and the mutation cases all drive checkCodeqlConfig with mutated TEXT
  // against that constant. In production the guard would then accept any widening at
  // all. So assert the source says what it is supposed to say.
  it('declares the allowlist as a literal, not derived from the file it guards', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'check-codeql-config.cjs'), 'utf8');
    expect(src).toMatch(/^const PATHS_IGNORE_ALLOWED = \['index\.html'\];$/m);
  });

  // The assertion above pins ONE constant's declaration, and review showed that is not
  // the class. Five others -- ALLOWED_TOP_LEVEL_KEYS, EXPECTED_USES, and friends --
  // could each be redefined to derive from the very file they guard with all cases
  // still green, and so could the comparison at a call site while the declaration above
  // stayed verbatim. Every one of those makes its gate agree with itself forever, and
  // in production accepts any edit at all.
  //
  // Pinning six literals one by one would leave the seventh. This pins the PROPERTY
  // instead: neither the constants nor the pure checker may touch the filesystem. Only
  // readOrNull and checkRepo, below the divider, are allowed to read anything -- and
  // what they read is under test in "checkRepo reads from disk" above.
  it('never reads a file to decide what to expect', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'check-codeql-config.cjs'), 'utf8');
    // Comment lines are excluded: the guard's prose legitimately discusses reading
    // files, and an assertion broken by the comment explaining it is the repeat
    // failure this repo keeps re-learning.
    const code = src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

    // Scanned over the WHOLE file, not a window between two markers. The window
    // version was evaded by hoisting the read above the opening marker and referring
    // to it from inside -- the region then held no banned token and all cases stayed
    // green, which is the same self-agreeing gate it was written to prevent.
    //
    // Matched as `fs.` / `fs[` rather than a list of method names, because a denylist
    // of four names is walked past by `fs['read' + 'FileSync']`. Every filesystem
    // access in the guard must live in readOrNull, the one function whose reads are
    // themselves under test in "checkRepo reads from disk" above.
    const accesses = [...code.matchAll(/\bfs\s*[.[]/g)];
    expect(accesses).toHaveLength(1);

    const readOrNullBody = code.slice(code.indexOf('function readOrNull('));
    expect(readOrNullBody).toMatch(/\bfs\s*\.\s*readFileSync\b/);

    // And the constants stay literals rather than anything computed at load time.
    expect(code).toMatch(/^const ALLOWED_TOP_LEVEL_KEYS = \['name', 'paths-ignore'\];$/m);
    expect(code).toMatch(/^const EXPECTED_MATRIX_KEYS = \['language'\];$/m);
  });
});

describe('check-codeql-config: config mutations that silently shrink coverage', () => {
  // Each entry is a change that leaves CodeQL green while scanning less. The guard has
  // to reject every one of them, and the reason it rejects them is the assertion.
  const CASES = [
    {
      name: 'a new file is added to paths-ignore',
      config: `${GOOD_CONFIG}  - src/config.js\n`,
    },
    {
      name: 'the entry is widened to a glob over every HTML file',
      config: GOOD_CONFIG.replace('  - index.html', "  - '**/*.html'"),
    },
    {
      name: 'the entry is widened to the whole tree',
      config: GOOD_CONFIG.replace('  - index.html', "  - '**'"),
    },
    {
      name: 'the entry is widened to a source directory',
      config: GOOD_CONFIG.replace('  - index.html', '  - src'),
    },
    {
      // The exact-path pattern is load-bearing: unanchored basename matching is what
      // let src/index.html go unscanned by check:secrets for as long as it did (#138).
      name: 'the entry is swapped for a hand-written source file',
      config: GOOD_CONFIG.replace('  - index.html', '  - src/index.html'),
    },
    {
      // Narrowing is caught too. Not because narrowing is dangerous -- it is the safe
      // direction -- but because an exact assertion is the only kind that forces the
      // edit here, and that forced edit is the review gate. #141 exercised this for
      // real: it removed setup.html and the build stayed red until the allowlist moved.
      name: 'the entry is removed, leaving nothing skipped',
      config: GOOD_CONFIG.replace('  - index.html\n', ''),
    },
    {
      name: 'a paths: key restricts analysis to a subset of the tree',
      config: `${GOOD_CONFIG}\npaths:\n  - src/config.js\n`,
    },
    {
      name: 'a query-filters: key excludes rules wholesale',
      config: `${GOOD_CONFIG}\nquery-filters:\n  - exclude\n`,
    },
    {
      name: 'a packs: key swaps the query set',
      config: `${GOOD_CONFIG}\npacks:\n  - some/pack\n`,
    },
    {
      name: 'the config is emptied',
      config: '',
    },
    {
      name: 'paths-ignore is present but has no entries',
      config: 'name: CodeQL config\n\npaths-ignore:\n',
    },
  ];

  for (const { name, config } of CASES) {
    it(`rejects: ${name}`, () => {
      // Same control as the workflow cases: the mutation must actually have mutated
      // something. Without this, a pattern that stops matching turns the case into a
      // test of the pristine config that still reports green.
      expect(config).not.toEqual(GOOD_CONFIG);
      expect(check(config)).not.toEqual([]);
    });
  }
});

describe('check-codeql-config: workflow mutations that unhook the config', () => {
  const CASES = [
    {
      name: 'config-file: is dropped, so the config is never read',
      workflow: GOOD_WORKFLOW.replace(/^\s*config-file:.*$/m, ''),
    },
    {
      name: 'config-file: is repointed at another file',
      workflow: GOOD_WORKFLOW.replace(/config-file:.*/, 'config-file: .github/codeql/other.yml'),
    },
    {
      name: 'the query suite is narrowed to the default',
      workflow: GOOD_WORKFLOW.replace(/queries:.*/, 'queries: security-extended'),
    },
    {
      name: 'queries: is dropped entirely',
      workflow: GOOD_WORKFLOW.replace(/^\s*queries:.*$/m, ''),
    },
    {
      name: 'a language is dropped from the matrix',
      workflow: GOOD_WORKFLOW.replace(/language: \[.*\]/, 'language: [javascript-typescript]'),
    },
    {
      name: 'the job gains an if: condition and skips silently',
      workflow: GOOD_WORKFLOW.replace('    runs-on: ubuntu-latest', '    if: false\n    runs-on: ubuntu-latest'),
    },
    {
      name: 'the job gains continue-on-error and fails green',
      workflow: GOOD_WORKFLOW.replace('    runs-on: ubuntu-latest', '    continue-on-error: true\n    runs-on: ubuntu-latest'),
    },
    // The five below all passed the first version of this guard, which defended the
    // workflow with a denylist -- the one thing the brief forbade. The first two are
    // the worst kind of green: the job keeps its name, stays a required check, reports
    // success, and analyses nothing at all.
    {
      name: 'the analyze step is deleted, leaving a job that analyses nothing',
      workflow: GOOD_WORKFLOW.replace(/\n {6}- name: Perform CodeQL Analysis[\s\S]*$/, '\n'),
    },
    {
      name: 'the analyze step is commented out, so the comment strip erases the evidence',
      workflow: GOOD_WORKFLOW.split('\n')
        .map(l => (/Perform CodeQL Analysis|codeql-action\/analyze|category:/.test(l) ? `#${l}` : l))
        .join('\n'),
    },
    {
      // The matrix still lists both languages, so the matrix assertion passes. Nothing
      // consumes it, and Python is silently never scanned.
      name: 'languages: is hardcoded past the matrix',
      workflow: GOOD_WORKFLOW.replace('languages: ${{ matrix.language }}', 'languages: javascript-typescript'),
    },
    {
      name: 'an action is repointed at a fork',
      workflow: GOOD_WORKFLOW.replace('github/codeql-action/analyze@v4', 'evil/codeql-action/analyze@v4'),
    },
    {
      name: 'an extra action is inserted into the job',
      workflow: GOOD_WORKFLOW.replace('      - uses: actions/checkout@v6', '      - uses: actions/checkout@v6\n      - uses: evil/exfil@v1'),
    },
    {
      name: 'the checkout step is dropped',
      workflow: GOOD_WORKFLOW.replace('      - uses: actions/checkout@v6\n', ''),
    },
    {
      // Anchoring is what makes this fail: every workflow pattern requires the key at
      // the start of the line, and a commented line starts with `#`, which is not
      // whitespace. A comment-stripping helper was written for this job and deleted
      // once it was shown to change no verdict; this case asserts the property that
      // actually holds, rather than the one the helper claimed.
      name: 'config-file: is commented out but left visible in the text',
      workflow: GOOD_WORKFLOW.replace(/^(\s*)(config-file:.*)$/m, '$1# $2'),
    },
    // Round two of review found these six. The first two are the same shape as the
    // escapes above, one level deeper: the step is present, the action is right, every
    // pinned key is untouched, and coverage is gone anyway.
    {
      // A real codeql-action input. Results are never uploaded, so the job is green and
      // no alert ever reaches the security tab.
      name: 'upload: never is added to the analyze step',
      workflow: GOOD_WORKFLOW.replace('          category:', '          upload: never\n          category:'),
    },
    {
      name: 'packs: is added to the init step, swapping the query set',
      workflow: GOOD_WORKFLOW.replace('          config-file:', '          packs: some/pack\n          config-file:'),
    },
    {
      // language: still lists both, the binding still reads the matrix, every uses: is
      // intact -- and python never runs.
      name: 'matrix.exclude drops a language from the expansion',
      workflow: GOOD_WORKFLOW.replace(
        '        language: [javascript-typescript, python]',
        '        language: [javascript-typescript, python]\n        exclude:\n          - language: python',
      ),
    },
    {
      // The uses: pattern could not see a line with a trailing comment, so the inserted
      // step never entered the compared list -- an allowlist blind to insertions.
      name: 'an inserted step carries a trailing comment',
      workflow: GOOD_WORKFLOW.replace('      - uses: actions/checkout@v6', '      - uses: actions/checkout@v6\n      - uses: evil/exfil@v1 # pinned'),
    },
    {
      // `if : false` is valid YAML. One space walked past an assertion anchored on
      // `if:`, and GitHub counts a skipped required check as satisfied.
      name: 'if : false, with a space before the colon',
      workflow: GOOD_WORKFLOW.replace('    runs-on: ubuntu-latest', '    if : false\n    runs-on: ubuntu-latest'),
    },
    {
      name: 'continue-on-error : true, with a space before the colon',
      workflow: GOOD_WORKFLOW.replace('    runs-on: ubuntu-latest', '    continue-on-error : true\n    runs-on: ubuntu-latest'),
    },
    {
      // A non-global /m regex takes the first match anywhere in the file, so an earlier
      // run: block whose body lines start with a guarded key misdirects the assertion
      // onto text that is not the setting, leaving the real one free to say anything.
      name: 'an earlier run: block decoys the guarded keys',
      workflow: GOOD_WORKFLOW
        .replace('          config-file: .github/codeql/codeql-config.yml', '          config-file: evil.yml')
        .replace('      - uses: actions/checkout@v6', '      - run: |\n          config-file: .github/codeql/codeql-config.yml\n      - uses: actions/checkout@v6'),
    },
    // Round three: QUOTED keys. Ordinary YAML, honoured by GitHub Actions, and every
    // assertion that matched only the bare spelling was walked past by two characters.
    // The block reader was worse than walked past -- it silently DROPPED lines it could
    // not read, so a quoted input never entered the key set being compared at all.
    {
      name: 'upload: never is added with a quoted key',
      workflow: GOOD_WORKFLOW.replace('          category:', '          "upload": never\n          category:'),
    },
    {
      name: 'packs: is added to init with a quoted key',
      workflow: GOOD_WORKFLOW.replace('          config-file:', "          'packs': my/pack\n          config-file:"),
    },
    {
      name: 'matrix exclude: is added with a quoted key',
      workflow: GOOD_WORKFLOW.replace(
        '        language: [javascript-typescript, python]',
        "        language: [javascript-typescript, python]\n        'exclude': [{language: python}]",
      ),
    },
    {
      name: 'config-file: is repointed using a quoted key',
      workflow: GOOD_WORKFLOW.replace('          config-file: .github/codeql/codeql-config.yml', '          "config-file": evil.yml'),
    },
    {
      name: 'a step is inserted with a quoted uses: key',
      workflow: GOOD_WORKFLOW.replace('      - uses: actions/checkout@v6', '      - uses: actions/checkout@v6\n      - "uses": evil/exfil@v1'),
    },
    {
      name: 'if: is set with a quoted key',
      workflow: GOOD_WORKFLOW.replace('    runs-on: ubuntu-latest', '    "if": false\n    runs-on: ubuntu-latest'),
    },
    {
      name: 'continue-on-error: is set with a quoted key',
      workflow: GOOD_WORKFLOW.replace('    runs-on: ubuntu-latest', '    "continue-on-error": true\n    runs-on: ubuntu-latest'),
    },
    {
      // Explicit-key syntax. The block reader cannot model it, and the point is that it
      // says so with a sentinel no allowlist matches rather than skipping the line.
      name: 'an input is added in explicit-key form',
      workflow: GOOD_WORKFLOW.replace('          category:', '          ? upload\n          : never\n          category:'),
    },
    {
      // A comment at column 0 read as an outdent and ended the block early, hiding
      // everything after it from the key set.
      name: 'a column-0 comment precedes an added input',
      workflow: GOOD_WORKFLOW.replace('          category:', '# note\n          upload: never\n          category:'),
    },
  ];

  for (const { name, workflow } of CASES) {
    it(`rejects: ${name}`, () => {
      // Each replace() above must actually have changed something. A typo'd pattern
      // would leave the workflow untouched, the case would assert against the pristine
      // file, and it would "fail to reject" for a reason that has nothing to do with
      // the guard -- or worse, a future edit makes the pattern miss and the case starts
      // testing nothing while still passing.
      expect(workflow).not.toEqual(GOOD_WORKFLOW);
      expect(check(GOOD_CONFIG, workflow)).not.toEqual([]);
    });
  }
});

describe('check-codeql-config: benign reformats must still pass', () => {
  // The negative controls. Without these the suite is satisfied by `return ['nope']`,
  // which rejects every mutation above and is worth nothing. (Deliberately not stated
  // as a count: the count moved from 18 to 41 across two review rounds and a stale
  // number in a comment is the same defect as a stale claim in one.)
  const CASES = [
    {
      name: 'a zero-indent block sequence',
      config: 'name: CodeQL config\n\npaths-ignore:\n- index.html\n',
    },
    {
      name: 'a single-quoted entry',
      config: 'name: CodeQL config\n\npaths-ignore:\n  - \'index.html\'\n',
    },
    {
      name: 'a double-quoted entry',
      config: 'name: CodeQL config\n\npaths-ignore:\n  - "index.html"\n',
    },
    {
      // The committed config carries a six-line comment block explaining why the
      // pattern is a path and not a basename. If comment handling regressed, the real
      // file would stop parsing -- so this is not a hypothetical shape.
      name: 'comment lines and extra blank lines',
      config: '# what CodeQL skips\nname: CodeQL config\n\n\n# why:\npaths-ignore:\n  - index.html\n',
    },
    {
      name: 'CRLF line endings',
      config: GOOD_CONFIG.replace(/\n/g, '\r\n'),
    },
    {
      name: 'LF line endings',
      config: GOOD_CONFIG,
    },
    {
      name: 'no trailing newline',
      config: GOOD_CONFIG.trimEnd(),
    },
    {
      name: 'the keys in the other order',
      config: 'paths-ignore:\n  - index.html\n\nname: CodeQL config\n',
    },
  ];

  for (const { name, config } of CASES) {
    it(`accepts: ${name}`, () => {
      expect(check(config)).toEqual([]);
    });
  }
});

describe('check-codeql-config: shapes the parser refuses rather than guesses at', () => {
  // These are valid YAML that this deliberately-small parser does not model. It must
  // fail LOUDLY on them, never quietly return something plausible -- a guard that
  // guesses wrong about its input is a guard that passes for the wrong reason.
  const CASES = [
    { name: 'flow-style sequence', config: 'name: CodeQL config\npaths-ignore: [index.html]\n' },
    { name: 'flow-style mapping', config: 'name: CodeQL config\npaths-ignore: {a: b}\n' },
    { name: 'an anchor', config: 'name: &n CodeQL config\npaths-ignore:\n  - index.html\n' },
    { name: 'a block scalar', config: 'name: |\n  CodeQL config\npaths-ignore:\n  - index.html\n' },
    { name: 'a nested mapping', config: 'name: CodeQL config\npaths-ignore:\n  nested:\n    - index.html\n' },
    { name: 'a document marker', config: '---\nname: CodeQL config\npaths-ignore:\n  - index.html\n' },
    { name: 'a tab indent', config: 'name: CodeQL config\npaths-ignore:\n\t- index.html\n' },
    { name: 'a duplicate top-level key', config: 'name: a\nname: b\npaths-ignore:\n  - index.html\n' },
    // These two reach the parser's GENERIC fallback throw rather than one of the
    // specific ones above. Without them that branch had no coverage at all: replacing
    // it with `continue` -- so the parser skips any line it does not understand and
    // reports success on the rest -- kept all 39 other cases green. A guard that
    // ignores what it cannot read is the silent-coverage-loss bug wearing the guard's
    // own uniform.
    { name: 'a bare scalar line', config: 'name: CodeQL config\ngarbage\npaths-ignore:\n  - index.html\n' },
    { name: 'a key with unsupported characters', config: 'name: CodeQL config\npaths ignore: x\n' },
  ];

  for (const { name, config } of CASES) {
    it(`fails loudly on: ${name}`, () => {
      // The parser throws...
      expect(() => parseSimpleYaml(config)).toThrow(YamlShapeError);
      // ...and the checker converts that into a reported problem rather than letting
      // it escape as a crash or, far worse, swallowing it into a pass.
      const problems = check(config);
      expect(problems).not.toEqual([]);
      expect(problems[0]).toMatch(/no longer in a shape this guard can read/);
    });
  }
});

describe('check-codeql-config: the parser itself', () => {
  it('reads the committed config into the expected structure', () => {
    expect(parseSimpleYaml(GOOD_CONFIG)).toEqual({
      name: 'CodeQL config',
      'paths-ignore': ['index.html'],
    });
  });

  it('treats # as a comment only when whitespace precedes it', () => {
    const parsed = parseSimpleYaml('name: a#b\npaths-ignore:\n  - c.html # trailing\n');
    expect(parsed.name).toBe('a#b');
    expect(parsed['paths-ignore']).toEqual(['c.html']);
  });

  it('does not silently return an empty object for unreadable input', () => {
    // The failure mode that would make every subset-style assertion pass vacuously.
    expect(() => parseSimpleYaml('\t\n')).toThrow(YamlShapeError);
  });

  it('reads `key:` followed only by a comment as an empty value, not a scalar', () => {
    // Idiomatic YAML. Before the fix the kv regex ate the space before the `#`, so the
    // value became the string "# why" and the next line threw "already given a scalar
    // value" -- fail-loud, but naming entirely the wrong problem.
    expect(parseSimpleYaml('name: a\npaths-ignore: # why\n  - index.html\n')).toEqual({
      name: 'a',
      'paths-ignore': ['index.html'],
    });
  });

  it('tolerates a UTF-8 BOM', () => {
    // JS \s matches U+FEFF, so an unstripped BOM made line 1 look like indented
    // content and reported a nested-mapping error.
    expect(parseSimpleYaml(`\uFEFF${GOOD_CONFIG}`)).toEqual(parseSimpleYaml(GOOD_CONFIG));
  });
});

describe('check-codeql-config: workflow assertions must not be satisfied by prose', () => {
  // The inverse control for anchoring. A commented-out setting must not read as
  // present (covered above), and a comment that merely NAMES a setting must not read
  // as setting it. Unanchored, /continue-on-error/ failed the build on a comment
  // saying there wasn't one -- the same class of bug, pointing the other way.
  it('accepts a comment that mentions continue-on-error without setting it', () => {
    const workflow = GOOD_WORKFLOW.replace(
      '    runs-on: ubuntu-latest',
      '    runs-on: ubuntu-latest  # deliberately no continue-on-error here',
    );
    expect(workflow).not.toEqual(GOOD_WORKFLOW);
    expect(check(GOOD_CONFIG, workflow)).toEqual([]);
  });

  // These two are the controls that discriminate the block reader's comment handling.
  // Asserting only that an ADDED input is rejected does not test it: without the
  // comment skip, a `#` at column 0 reads as an outdent, the block ends early, and the
  // key set comes back short -- so the added-input cases still go red, for the wrong
  // reason, and the bug stays invisible. What breaks without the skip is the LEGITIMATE
  // comment: the guard rejects a workflow that is entirely fine.
  it('accepts a comment at column 0 inside a with: block', () => {
    const workflow = GOOD_WORKFLOW.replace('          queries:', '# why these queries\n          queries:');
    expect(workflow).not.toEqual(GOOD_WORKFLOW);
    expect(check(GOOD_CONFIG, workflow)).toEqual([]);
  });

  it('accepts an indented comment inside a with: block', () => {
    const workflow = GOOD_WORKFLOW.replace('          queries:', '          # why these queries\n          queries:');
    expect(workflow).not.toEqual(GOOD_WORKFLOW);
    expect(check(GOOD_CONFIG, workflow)).toEqual([]);
  });

  // The controls that discriminate quoted-key tolerance, for the same reason the two
  // above discriminate the comment skip. The rejection cases elsewhere in this file
  // quote a key AND change its value, so they go red either way -- without tolerance
  // the assertion simply finds no occurrence and reports the key missing. What breaks
  // without it is the workflow that is entirely correct and merely quoted: the guard
  // rejects it, or worse, reads it as absent.
  const QUOTED = [
    ['config-file', '          config-file: .github/codeql/codeql-config.yml'],
    ['queries', '          queries: security-extended,security-and-quality'],
    ['uses', '      - uses: actions/checkout@v6'],
  ];
  for (const [key, line] of QUOTED) {
    it(`accepts a quoted ${key}: key carrying the correct value`, () => {
      const quoted = line.replace(`${key}:`, `"${key}":`);
      const workflow = GOOD_WORKFLOW.replace(line, quoted);
      expect(workflow).not.toEqual(GOOD_WORKFLOW);
      expect(check(GOOD_CONFIG, workflow)).toEqual([]);
    });
  }
});
