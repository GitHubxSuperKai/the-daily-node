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
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
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
  // which rejects all 18 mutations above and is worth nothing.
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
});
