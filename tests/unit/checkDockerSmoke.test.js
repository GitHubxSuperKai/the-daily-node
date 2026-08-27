// Behaviour test for scripts/check-docker-smoke.cjs -- the guard on docker.yml's smoke job.
//
// Why this exists: `npm run check:docker-smoke` runs that guard against exactly one
// input, the real workflow, which it passes. A guard exercised only on the input it
// accepts is the likeliest of all to be vacuous -- `return []` passes the CLI forever,
// and so does a parser that silently yields {} for every file. Neither is visible from a
// structural assertion. Every case below EXECUTES the checker and asserts on what it
// returns, and every mutation case first asserts that its string surgery changed
// something.
//
// The lesson this file is built on: an invariant asserted in a comment is a TODO, not a
// guard. That is exactly what the three fixes this guard protects (#144, #146, #148) had
// before it existed -- prose, including a literal "Do NOT collapse this back into a
// single pipeline."
//
// It lives in vitest specifically. .github/workflows/build.yml runs `npm run test:unit`
// and enumerates its other steps individually -- it never runs `npm test`, so a check
// wired only into that chain gets zero CI coverage (that bit PR #128). The guard itself
// is additionally wired as its OWN build.yml step, and the last describe block below
// asserts that step exists by parsing build.yml rather than grepping it.
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
  checkDockerSmoke,
  checkRepo,
  parseYaml,
  YamlShapeError,
  PINNED_RUN_LINES,
  significantLines,
  extractIfGuards,
  EXPECTED_PAGE_ENV,
  EXPECTED_STEPS,
} = require(path.join(REPO_ROOT, 'scripts', 'check-docker-smoke.cjs'));

const WORKFLOW_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'docker.yml');
const BUILD_WORKFLOW_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'build.yml');
const DASHBOARD_PATH = path.join(REPO_ROOT, 'index.html');
const SETUP_PATH = path.join(REPO_ROOT, 'setup.html');

// Read as-is, then normalise to LF for the string surgery below. On Windows these files
// check out with CRLF (core.autocrlf=true), so a mutation written as
// `.replace('  exit 1\n', '')` matches nothing at all -- the case then asserts against a
// pristine workflow and "fails to reject" for a reason that has nothing to do with the
// guard. That is not hypothetical: it is what the first run of the sibling CodeQL test
// did. Every mutation case re-asserts that it changed something, which is what makes a
// silent no-op mutation impossible to mistake for a passing guard.
const asLF = s => s.replace(/\r\n/g, '\n');
const GOOD = asLF(fs.readFileSync(WORKFLOW_PATH, 'utf8'));

// Synthetic pages for the workflow-mutation cases: the marker check only asks whether
// each marker appears, so two one-line documents are a faithful stand-in and keep 328KB
// of real HTML out of every case. The REAL pages are asserted on separately, below,
// because "these two markers discriminate" is a fact about the shipped bytes.
const MINI_DASH = `<!doctype html><script>({${EXPECTED_PAGE_ENV.DASH_MARK}:1})</script>`;
const MINI_SETUP = `<!doctype html><p ${EXPECTED_PAGE_ENV.SETUP_MARK}></p>`;

const check = (workflowText, dashboardHtml = MINI_DASH, setupHtml = MINI_SETUP) =>
  checkDockerSmoke({ workflowText, dashboardHtml, setupHtml });

// Asserts the surgery bit, then that the guard rejected. `label` is only for readability
// in a failure -- the two expects are what matter.
const rejects = (mutated, dashboardHtml, setupHtml) => {
  expect(mutated).not.toEqual(GOOD);
  const problems = check(mutated, dashboardHtml, setupHtml);
  expect(problems).not.toEqual([]);
  return problems.join(' | ');
};

// Replaces the first occurrence of `find`, failing loudly if it is not there. A silent
// no-op replace is the single most common way a mutation case goes vacuous.
const sub = (text, find, replaceWith) => {
  expect(text).toContain(find);
  return text.replace(find, replaceWith);
};

describe('check-docker-smoke: the real repo', () => {
  // The positive control. If this ever fails, every "rejected" case below becomes
  // meaningless -- a checker that rejects its own valid input rejects everything.
  it('passes against the committed workflow and pages', () => {
    expect(checkRepo()).toEqual([]);
  });

  it('passes when the same workflow is handed in with CRLF endings', () => {
    expect(check(GOOD.replace(/\n/g, '\r\n'))).toEqual([]);
  });

  // The property the entire both-directions design rests on, asserted against the bytes
  // that actually ship. A structural guard cannot see this: #144's `<!doctype html>`
  // matched both pages, and so does `dailynode-prefs`, which looks like an ideal
  // dashboard marker. If either marker ever leaks into the other page, this fails here
  // and in the guard, rather than the smoke job silently going vacuous again.
  it('the pinned markers discriminate between the two real pages', () => {
    const dash = fs.readFileSync(DASHBOARD_PATH, 'utf8');
    const setup = fs.readFileSync(SETUP_PATH, 'utf8');
    expect(dash.includes(EXPECTED_PAGE_ENV.DASH_MARK)).toBe(true);
    expect(setup.includes(EXPECTED_PAGE_ENV.DASH_MARK)).toBe(false);
    expect(setup.includes(EXPECTED_PAGE_ENV.SETUP_MARK)).toBe(true);
    expect(dash.includes(EXPECTED_PAGE_ENV.SETUP_MARK)).toBe(false);
    // The negative control for the two `false` assertions above: a marker that is NOT
    // discriminating must actually be found in both, or those assertions prove nothing
    // about the method, only about these two strings.
    expect(dash.includes('dailynode-prefs')).toBe(true);
    expect(setup.includes('dailynode-prefs')).toBe(true);
  });
});

// checkRepo used to be the whole story in the sibling guard, with exactly one case
// asserting exactly []. Replacing its file read with a hardcoded good string -- which
// makes `npm run check:docker-smoke` decorative, reporting the job intact whatever the
// real file says -- kept that suite green. These drive it against a temp root instead, so
// each of the three reads is separately under test.
describe('checkRepo reads from disk', () => {
  const tmpRoots = [];
  const makeRoot = (workflowText, dash = MINI_DASH, setup = MINI_SETUP) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dn-docker-'));
    tmpRoots.push(root);
    fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(root, '.github', 'workflows', 'docker.yml'), workflowText);
    fs.writeFileSync(path.join(root, 'index.html'), dash);
    fs.writeFileSync(path.join(root, 'setup.html'), setup);
    return root;
  };
  afterAll(() => {
    for (const d of tmpRoots) fs.rmSync(d, { recursive: true, force: true });
  });

  it('passes on a faithful copy of the committed files', () => {
    expect(checkRepo(makeRoot(GOOD))).toEqual([]);
  });

  it('rejects a gutted workflow that exists only on disk', () => {
    const gutted = sub(GOOD, '      - name: Verify API endpoint responds', '      - name: Nothing');
    expect(checkRepo(makeRoot(gutted))).not.toEqual([]);
  });

  // The mirror for the two HTML reads. Without these, pointing either read at REPO_ROOT
  // while honouring `root` for the workflow -- or hardcoding it outright -- leaves the
  // marker-discrimination half of the guard decorative in exactly the way it exists to
  // prevent.
  it('rejects a dashboard page that does not contain its own marker', () => {
    const problems = checkRepo(makeRoot(GOOD, '<!doctype html>no marker here', MINI_SETUP));
    expect(problems.join(' ')).toMatch(/does NOT appear in index\.html/);
  });

  it('rejects a setup page that also contains the dashboard marker', () => {
    const problems = checkRepo(makeRoot(GOOD, MINI_DASH, `${MINI_SETUP}${EXPECTED_PAGE_ENV.DASH_MARK}`));
    expect(problems.join(' ')).toMatch(/appears in BOTH/);
  });

  it('reports a missing workflow rather than passing over it', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dn-docker-empty-'));
    tmpRoots.push(root);
    const problems = checkRepo(root);
    expect(problems).not.toEqual([]);
    expect(problems.join(' ')).toMatch(/missing or unreadable/);
  });

  it('reports missing pages rather than passing over them', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dn-docker-nohtml-'));
    tmpRoots.push(root);
    fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(root, '.github', 'workflows', 'docker.yml'), GOOD);
    const problems = checkRepo(root);
    expect(problems.join(' ')).toMatch(/missing or unreadable/);
  });
});

describe('the trigger that decides whether the smoke job runs at all', () => {
  it('rejects a dropped pull_request path', () => {
    expect(rejects(sub(GOOD, "      - 'docker-compose.yml'\n      - '.github/workflows/docker.yml'\n  workflow_dispatch:", "      - '.github/workflows/docker.yml'\n  workflow_dispatch:")))
      .toMatch(/pull_request\.paths/);
  });

  it('rejects an added pull_request path', () => {
    expect(rejects(sub(GOOD, "      - 'docker-compose.yml'\n      - '.github/workflows/docker.yml'\n  workflow_dispatch:", "      - 'docker-compose.yml'\n      - '.github/workflows/docker.yml'\n      - 'README.md'\n  workflow_dispatch:")))
      .toMatch(/pull_request\.paths/);
  });

  it('rejects reordered pull_request paths', () => {
    expect(rejects(sub(GOOD, "      - 'Dockerfile'\n      - '.dockerignore'\n      - 'bitaxe_api.py'\n      - 'setup.html'\n      - 'src/**'\n      - 'build.js'\n      - 'package.json'\n      - 'package-lock.json'\n      - 'docker-compose.yml'", "      - '.dockerignore'\n      - 'Dockerfile'\n      - 'bitaxe_api.py'\n      - 'setup.html'\n      - 'src/**'\n      - 'build.js'\n      - 'package.json'\n      - 'package-lock.json'\n      - 'docker-compose.yml'")))
      .toMatch(/pull_request\.paths/);
  });
});

describe('the smoke job’s own shape', () => {
  it('rejects an added job', () => {
    expect(rejects(`${GOOD}\n  extra:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v6\n`))
      .toMatch(/declares jobs/);
  });

  it('rejects continue-on-error on the job', () => {
    expect(rejects(sub(GOOD, '  smoke:\n    if:', '  smoke:\n    continue-on-error: true\n    if:')))
      .toMatch(/smoke job declares/);
  });

  // The mutation the key-set pin exists for and that no enumerated denylist would have
  // named: `sh` has errexit but its own quirks, and any explicit shell replaces the
  // `/usr/bin/bash -e {0}` whose semantics every capture assertion below relies on.
  it('rejects a defaults: block that swaps the shell out from under every capture', () => {
    expect(rejects(sub(GOOD, '  smoke:\n    if:', '  smoke:\n    defaults:\n      run:\n        shell: sh\n    if:')))
      .toMatch(/smoke job declares/);
  });

  it('rejects a narrowed job if:', () => {
    expect(rejects(sub(GOOD, "    if: github.event_name == 'pull_request' || github.event_name == 'workflow_dispatch'", "    if: github.event_name == 'workflow_dispatch'")))
      .toMatch(/smoke job if:/);
  });

  it('rejects a changed runner image', () => {
    expect(rejects(sub(GOOD, '  smoke:\n    if: github', '  smoke:\n    if: github').replace('    runs-on: ubuntu-latest\n    steps:', '    runs-on: self-hosted\n    steps:')))
      .toMatch(/runs-on:/);
  });
});

describe('the step list', () => {
  // The state PR #144 actually found: the job named, required, green, and asserting
  // nothing about the dashboard.
  it('rejects a deleted assertion step', () => {
    const mutated = GOOD.replace(
      / {6}- name: Verify dashboard HTML served when configured[\s\S]*?(?=\n {6}# The job shell)/,
      '',
    );
    expect(rejects(mutated)).toMatch(/smoke job runs/);
  });

  it('rejects a renamed step', () => {
    expect(rejects(sub(GOOD, '      - name: Verify API endpoint responds', '      - name: Check the API')))
      .toMatch(/smoke job runs/);
  });

  it('rejects an inserted step', () => {
    expect(rejects(sub(GOOD, '      - name: Stop containers', '      - name: Extra\n        run: true\n\n      - name: Stop containers')))
      .toMatch(/smoke job runs/);
  });

  it('rejects if: added to an assertion step', () => {
    expect(rejects(sub(GOOD, '      - name: Verify API endpoint responds\n        run: |', '      - name: Verify API endpoint responds\n        if: false\n        run: |')))
      .toMatch(/declares \["name","if","run"\]/);
  });

  it('rejects continue-on-error added to an assertion step', () => {
    expect(rejects(sub(GOOD, '      - name: Verify the shipped healthcheck probe exits 0\n        run: |', '      - name: Verify the shipped healthcheck probe exits 0\n        continue-on-error: true\n        run: |')))
      .toMatch(/declares \["name","continue-on-error","run"\]/);
  });

  it('rejects a per-step shell override', () => {
    expect(rejects(sub(GOOD, '      - name: Verify API endpoint responds\n        run: |', '      - name: Verify API endpoint responds\n        shell: sh\n        run: |')))
      .toMatch(/declares \["name","shell","run"\]/);
  });

  it('rejects a changed if: on the cleanup step', () => {
    expect(rejects(sub(GOOD, '      - name: Stop containers\n        if: always()', '      - name: Stop containers\n        if: failure()')))
      .toMatch(/Stop containers/);
  });

  it('rejects load: dropped from the build step', () => {
    expect(rejects(sub(GOOD, '          load: true\n', ''))).toMatch(/build step with:/);
  });

  it('rejects an input added to the build step', () => {
    expect(rejects(sub(GOOD, '          load: true\n', '          load: true\n          pull: false\n')))
      .toMatch(/build step with:/);
  });
});

describe('captures must abort the step (#146, #148)', () => {
  // `local x=$(cmd)` and `export x=$(cmd)` do NOT abort under errexit -- the declaration
  // builtin's own status wins and it succeeded. A two-word edit that reads as a tidy-up
  // and silently restores the exact bug both PRs were opened to fix.
  for (const prefix of ['local', 'export', 'declare', 'readonly', 'typeset']) {
    it(`rejects \`${prefix} body=$(curl ...)\` in the API step`, () => {
      const problems = rejects(sub(GOOD, '          body=$(curl -fsS http://localhost:3001/api/miners)', `          ${prefix} body=$(curl -fsS http://localhost:3001/api/miners)`));
      expect(problems).toMatch(/declaration builtin/);
    });
  }

  it('rejects `export config=$(docker compose ...)` in the healthcheck step', () => {
    expect(rejects(sub(GOOD, '          config=$(docker compose -f docker-compose.yml config --format json)', '          export config=$(docker compose -f docker-compose.yml config --format json)')))
      .toMatch(/declaration builtin/);
  });

  // The literal thing the workflow comment asks for and could not enforce: "Do NOT
  // collapse this back into a single pipeline."
  it('rejects the API step collapsed back into one pipeline', () => {
    const problems = rejects(sub(
      GOOD,
      '          body=$(curl -fsS http://localhost:3001/api/miners)\n          printf \'%s\' "$body" | python3 -c',
      '          curl -fsS http://localhost:3001/api/miners | python3 -c',
    ));
    expect(problems).toMatch(/invokes `curl` on lines this guard does not pin/);
  });

  it('rejects the healthcheck compose read collapsed back into one pipeline', () => {
    const problems = rejects(sub(
      GOOD,
      '          config=$(docker compose -f docker-compose.yml config --format json)\n          probe=$(printf \'%s\' "$config" | python3 -c',
      '          probe=$(docker compose -f docker-compose.yml config --format json | python3 -c',
    ));
    expect(problems).toMatch(/invokes `docker compose` on lines this guard does not pin/);
  });

  it('rejects a changed capture URL', () => {
    expect(rejects(sub(GOOD, '          body=$(curl -fsS http://localhost:3001/)', '          body=$(curl -fsS http://localhost:3001/health)')))
      .toMatch(/bare assignment|does not pin/);
  });

  // -fsS is what makes curl exit non-zero on an HTTP error at all. Without -f a 500
  // response is a successful transfer, the capture succeeds, and the page assertions
  // grep an error body.
  it('rejects curl losing its failure flags', () => {
    expect(rejects(sub(GOOD, '          body=$(curl -fsS http://localhost:3001/api/miners)', '          body=$(curl -s http://localhost:3001/api/miners)')))
      .toMatch(/bare assignment|does not pin/);
  });
});

describe('page assertions must run in both directions (#144)', () => {
  it('rejects the setup step losing its absence half', () => {
    const problems = rejects(sub(
      GOOD,
      '          if echo "$body" | grep -q "$DASH_MARK"; then\n            echo "Dashboard served when unconfigured -- setup gate is broken"\n            exit 1\n          fi\n',
      '',
    ));
    expect(problems).toMatch(/0 guards on `echo "\$body" \| grep -q "\$DASH_MARK"`/);
  });

  it('rejects the dashboard step losing its absence half', () => {
    const problems = rejects(sub(
      GOOD,
      '          if echo "$body" | grep -q "$SETUP_MARK"; then\n            echo "Setup page served when configured -- BITAXE_IPS was not honoured"\n            exit 1\n          fi\n',
      '',
    ));
    expect(problems).toMatch(/0 guards on `echo "\$body" \| grep -q "\$SETUP_MARK"`/);
  });

  it('rejects the presence half with its negation removed', () => {
    const problems = rejects(sub(GOOD, '          if ! echo "$body" | grep -q "$DASH_MARK"; then', '          if echo "$body" | grep -q "$DASH_MARK"; then'));
    expect(problems).toMatch(/no negation, expected a negation/);
  });

  it('rejects the absence half gaining a negation', () => {
    const problems = rejects(sub(GOOD, '          if echo "$body" | grep -q "$DASH_MARK"; then\n            echo "Dashboard served when unconfigured', '          if ! echo "$body" | grep -q "$DASH_MARK"; then\n            echo "Dashboard served when unconfigured'));
    expect(problems).toMatch(/a negation, expected no negation/);
  });

  it('rejects a guard that reports the failure and then passes anyway', () => {
    const problems = rejects(sub(
      GOOD,
      '            echo "Dashboard served when unconfigured -- setup gate is broken"\n            exit 1',
      '            echo "Dashboard served when unconfigured -- setup gate is broken"',
    ));
    expect(problems).toMatch(/no longer exits non-zero|does not pin|pinned commands/);
  });

  it('rejects the two markers being swapped', () => {
    const problems = rejects(sub(
      GOOD,
      '        env:\n          DASH_MARK: fetchBTCPrice\n          SETUP_MARK: \'id="ips-msg"\'\n        run: |\n          body=$(curl -fsS http://localhost:3001/)',
      '        env:\n          DASH_MARK: \'id="ips-msg"\'\n          SETUP_MARK: fetchBTCPrice\n        run: |\n          body=$(curl -fsS http://localhost:3001/)',
    ));
    expect(problems).toMatch(/env: is/);
  });

  it('rejects env dropped from a page step', () => {
    const problems = rejects(sub(
      GOOD,
      '        env:\n          DASH_MARK: fetchBTCPrice\n          SETUP_MARK: \'id="ips-msg"\'\n        run: |\n          body=$(curl -fsS http://localhost:3001/)',
      '        run: |\n          body=$(curl -fsS http://localhost:3001/)',
    ));
    expect(problems).toMatch(/declares \["name","run"\]/);
  });

  it('rejects an added env var', () => {
    const problems = rejects(sub(
      GOOD,
      '          SETUP_MARK: \'id="ips-msg"\'\n        run: |\n          body=$(curl -fsS http://localhost:3001/)',
      '          SETUP_MARK: \'id="ips-msg"\'\n          OTHER: x\n        run: |\n          body=$(curl -fsS http://localhost:3001/)',
    ));
    expect(problems).toMatch(/env: is/);
  });

  // The #144 failure itself, reproduced: a marker that matches both pages. Nothing about
  // the workflow text is wrong here -- both assertions are present, both directions are
  // asserted, the negations are right, and the env block matches its pin exactly. Only
  // the bytes give it away.
  //
  // Note which value the guard tests against the pages: the PINNED one, not the one it
  // just read out of the workflow. That is not a shortcut. The env pin above already
  // fails whenever the two disagree, so whenever the guard is green they are the same
  // string -- and reading the pin is what keeps this check biting after somebody changes
  // the marker AND dutifully updates EXPECTED_PAGE_ENV to match. That is the one edit
  // that silences every other assertion in this file at once.
  //
  // The workflow is handed in UNMUTATED here, so `rejects()` (which insists the text
  // changed) is deliberately not used: the whole point is that the workflow is fine.
  it('rejects a marker pair that both pages contain', () => {
    const problems = checkDockerSmoke({
      workflowText: GOOD,
      dashboardHtml: `${MINI_DASH}${EXPECTED_PAGE_ENV.SETUP_MARK}`,
      setupHtml: MINI_SETUP,
    });
    expect(problems.join(' | ')).toMatch(/appears in BOTH/);
  });

  // The same failure from the other side, so neither half of MARKER_PAGES can be deleted
  // without a case going red.
  it('rejects a marker missing from the page it is supposed to identify', () => {
    const problems = checkDockerSmoke({
      workflowText: GOOD,
      dashboardHtml: '<!doctype html>nothing here',
      setupHtml: MINI_SETUP,
    });
    expect(problems.join(' | ')).toMatch(/does NOT appear in index\.html/);
  });
});

describe('the blank-probe guard and its ordering (#148)', () => {
  const BLANK_GUARD =
    '          if [ -z "${probe//[[:space:]]/}" ]; then\n' +
    '            echo "Extracted healthcheck probe is empty or blank -- nothing to execute"\n' +
    '            exit 1\n' +
    '          fi\n';

  it('rejects the blank-probe check being deleted', () => {
    expect(rejects(sub(GOOD, BLANK_GUARD, ''))).toMatch(/0 un-negated guards/);
  });

  it('rejects the blank-probe check losing its exit', () => {
    const problems = rejects(sub(GOOD, '            echo "Extracted healthcheck probe is empty or blank -- nothing to execute"\n            exit 1', '            echo "Extracted healthcheck probe is empty or blank -- nothing to execute"'));
    expect(problems).toMatch(/no longer exits non-zero|pinned commands/);
  });

  it('rejects the blank-probe check being negated', () => {
    expect(rejects(sub(GOOD, '          if [ -z "${probe//[[:space:]]/}" ]; then', '          if ! [ -z "${probe//[[:space:]]/}" ]; then')))
      .toMatch(/0 un-negated guards|pinned commands/);
  });

  // The subtle one. The check is still there, still exits, still un-negated -- and it is
  // worthless, because `> /tmp/probe.py` truncated the file and `python3 - < empty-file`
  // has already exited 0 by the time it runs.
  it('rejects the blank-probe check moved after the write and the exec', () => {
    const withoutGuard = sub(GOOD, BLANK_GUARD, '');
    const moved = sub(
      withoutGuard,
      '          docker exec -i dn-smoke python3 - < /tmp/probe.py\n',
      `          docker exec -i dn-smoke python3 - < /tmp/probe.py\n${BLANK_GUARD}`,
    );
    const problems = rejects(moved);
    expect(problems).toMatch(/BEFORE the/);
  });
});

describe('layer B catches what layer A cannot name', () => {
  // Every semantic check still passes here: the capture is bare, the pipeline is intact,
  // the JSON is still parsed. The assertion is simply gone.
  it('rejects the API assertion replaced by a no-op', () => {
    const problems = rejects(sub(
      GOOD,
      'python3 -c "import sys, json; d = json.load(sys.stdin); assert \'miners\' in d and \'count\' in d"',
      'python3 -c "import sys, json; json.load(sys.stdin)"',
    ));
    expect(problems).toMatch(/no longer runs the pinned commands/);
  });

  it('rejects `set +e` smuggled into a step', () => {
    expect(rejects(sub(GOOD, '          body=$(curl -fsS http://localhost:3001/api/miners)', '          set +e\n          body=$(curl -fsS http://localhost:3001/api/miners)')))
      .toMatch(/no longer runs the pinned commands/);
  });

  it('rejects the probe being executed somewhere other than the image', () => {
    expect(rejects(sub(GOOD, '          docker exec -i dn-smoke python3 - < /tmp/probe.py', '          python3 - < /tmp/probe.py')))
      .toMatch(/no longer runs the pinned commands|no longer runs/);
  });

  it('rejects the wait loop being shortened to nothing', () => {
    expect(rejects(sub(GOOD, '          for i in $(seq 1 30); do\n            if curl -fsS http://localhost:3001/ -o /dev/null; then', '          for i in $(seq 1 1); do\n            if curl -fsS http://localhost:3001/ -o /dev/null; then')))
      .toMatch(/no longer runs the pinned commands/);
  });

  // Comments are stripped before the pin comparison, which is the correct posture -- a
  // comment does not execute, and an assertion a comment can satisfy is failure mode 1.
  // The consequence to prove: commenting a line OUT is a deletion, not a disguise.
  it('rejects an assertion that has been commented out rather than removed', () => {
    const problems = rejects(sub(
      GOOD,
      '          if echo "$body" | grep -q "$DASH_MARK"; then',
      '          # if echo "$body" | grep -q "$DASH_MARK"; then',
    ));
    expect(problems).toMatch(/pinned commands|guards on/);
  });

  it('accepts a purely cosmetic re-indent inside a loop', () => {
    const mutated = sub(
      GOOD,
      '          for i in $(seq 1 30); do\n            if curl -fsS http://localhost:3001/ -o /dev/null; then\n              echo "Server responded after ${i}s"',
      '          for i in $(seq 1 30); do\n              if curl -fsS http://localhost:3001/ -o /dev/null; then\n                  echo "Server responded after ${i}s"',
    );
    expect(mutated).not.toEqual(GOOD);
    expect(check(mutated)).toEqual([]);
  });

  it('accepts an added comment inside a step body', () => {
    const mutated = sub(
      GOOD,
      '          body=$(curl -fsS http://localhost:3001/api/miners)',
      '          # explaining why we capture first\n          body=$(curl -fsS http://localhost:3001/api/miners)',
    );
    expect(check(mutated)).toEqual([]);
  });
});

// The describe block this whole file turns on.
//
// Every case above reaches the guard through a workflow that layer B (PINNED_RUN_LINES)
// has ALREADY rejected, so any of them would still pass with layer A deleted -- and
// mutation-testing this suite proved exactly that: hollowing out the bare-capture check
// and both exit-non-zero checks left it fully green. They were decorative.
//
// These cases reproduce the one state where layer A is the last thing standing: somebody
// makes the edit, sees the guard go red, and dutifully updates the pin to match. Each
// asserts BOTH halves -- that layer B has genuinely gone quiet, and that layer A has not.
// Without the first assertion these would pass for the wrong reason and prove nothing.
describe('layer A keeps biting after the pin has been updated to match', () => {
  // What "updating PINNED_RUN_LINES" looks like: read the mutated step back out and
  // accept whatever it now says. This is the sympathetic maintainer, not an attacker.
  const pinsFor = (mutatedWorkflow, stepName) => {
    const step = parseYaml(mutatedWorkflow).jobs.smoke.steps.find(s => s.name === stepName);
    expect(step).toBeTruthy();
    return { ...PINNED_RUN_LINES, [stepName]: significantLines(step.run) };
  };

  const stillCaught = (mutated, stepName) => {
    expect(mutated).not.toEqual(GOOD);
    const joined = checkDockerSmoke({
      workflowText: mutated,
      dashboardHtml: MINI_DASH,
      setupHtml: MINI_SETUP,
      pinnedRunLines: pinsFor(mutated, stepName),
    }).join(' | ');
    // Layer B is quiet: the pin now matches the mutated body exactly.
    expect(joined).not.toMatch(/no longer runs the pinned commands/);
    return joined;
  };

  it('rejects `local body=$(...)` even with the pin updated', () => {
    const step = 'Verify API endpoint responds';
    const mutated = sub(GOOD, '          body=$(curl -fsS http://localhost:3001/api/miners)', '          local body=$(curl -fsS http://localhost:3001/api/miners)');
    expect(stillCaught(mutated, step)).toMatch(/declaration builtin/);
  });

  it('rejects the API step collapsed into a pipeline even with the pin updated', () => {
    const step = 'Verify API endpoint responds';
    const mutated = sub(
      GOOD,
      '          body=$(curl -fsS http://localhost:3001/api/miners)\n          printf \'%s\' "$body" | python3 -c',
      '          curl -fsS http://localhost:3001/api/miners | python3 -c',
    );
    expect(stillCaught(mutated, step)).toMatch(/invokes `curl` on lines this guard does not pin/);
  });

  // The one capture whose line carries neither `curl` nor `docker compose`, so the
  // command-line allowlist cannot reach it. Without this case the bare-capture check
  // itself is unreachable and therefore untested.
  it('rejects the probe being captured from somewhere else even with the pin updated', () => {
    const step = 'Verify the shipped healthcheck probe exits 0';
    const mutated = sub(
      GOOD,
      '          probe=$(printf \'%s\' "$config" | python3 -c "import sys,json; print(json.load(sys.stdin)[\'services\'][\'daily-node\'][\'healthcheck\'][\'test\'][-1])")',
      '          probe=$(cat /tmp/cached-probe.py)',
    );
    expect(stillCaught(mutated, step)).toMatch(/no longer captures \$probe as a bare assignment/);
  });

  it('rejects a page assertion that reports and passes anyway, even with the pin updated', () => {
    const step = 'Verify setup page served when unconfigured';
    const mutated = sub(
      GOOD,
      '            echo "Dashboard served when unconfigured -- setup gate is broken"\n            exit 1',
      '            echo "Dashboard served when unconfigured -- setup gate is broken"',
    );
    expect(stillCaught(mutated, step)).toMatch(/no longer exits non-zero/);
  });

  it('rejects a blank-probe guard that reports and passes anyway, even with the pin updated', () => {
    const step = 'Verify the shipped healthcheck probe exits 0';
    const mutated = sub(
      GOOD,
      '            echo "Extracted healthcheck probe is empty or blank -- nothing to execute"\n            exit 1',
      '            echo "Extracted healthcheck probe is empty or blank -- nothing to execute"',
    );
    expect(stillCaught(mutated, step)).toMatch(/the blank-probe guard no longer exits/);
  });

  it('rejects a deleted absence half even with the pin updated', () => {
    const step = 'Verify setup page served when unconfigured';
    const mutated = sub(
      GOOD,
      '          if echo "$body" | grep -q "$DASH_MARK"; then\n            echo "Dashboard served when unconfigured -- setup gate is broken"\n            exit 1\n          fi\n',
      '',
    );
    expect(stillCaught(mutated, step)).toMatch(/0 guards on/);
  });

  it('rejects a flipped negation even with the pin updated', () => {
    const step = 'Verify setup page served when unconfigured';
    const mutated = sub(GOOD, '          if ! echo "$body" | grep -q "$SETUP_MARK"; then', '          if echo "$body" | grep -q "$SETUP_MARK"; then');
    expect(stillCaught(mutated, step)).toMatch(/no negation, expected a negation/);
  });

  it('rejects the blank-probe check moved after the exec even with the pin updated', () => {
    const step = 'Verify the shipped healthcheck probe exits 0';
    const guard =
      '          if [ -z "${probe//[[:space:]]/}" ]; then\n' +
      '            echo "Extracted healthcheck probe is empty or blank -- nothing to execute"\n' +
      '            exit 1\n' +
      '          fi\n';
    const moved = sub(
      sub(GOOD, guard, ''),
      '          docker exec -i dn-smoke python3 - < /tmp/probe.py\n',
      `          docker exec -i dn-smoke python3 - < /tmp/probe.py\n${guard}`,
    );
    expect(stillCaught(moved, step)).toMatch(/BEFORE the/);
  });

  // The negative control for this whole block. If `pinnedRunLines` silenced layer A as
  // well as layer B, every case above would be asserting on nothing -- so prove that
  // handing over pins does NOT make the guard accept an unmutated-but-wrong world.
  it('the pins seam does not silence the guard wholesale', () => {
    const mutated = sub(GOOD, '    runs-on: ubuntu-latest', '    runs-on: self-hosted');
    const problems = checkDockerSmoke({
      workflowText: mutated,
      dashboardHtml: MINI_DASH,
      setupHtml: MINI_SETUP,
      pinnedRunLines: PINNED_RUN_LINES,
    });
    expect(problems.join(' | ')).toMatch(/runs-on:/);
  });
});

describe('the parser fails loudly rather than quietly', () => {
  const shapeRejected = mutated => {
    expect(mutated).not.toEqual(GOOD);
    const problems = check(mutated);
    expect(problems).not.toEqual([]);
    expect(problems.join(' ')).toMatch(/no longer in a shape this guard can read/);
    return problems.join(' ');
  };

  it('rejects a tab used for indentation', () => {
    shapeRejected(sub(GOOD, '    runs-on: ubuntu-latest', '\truns-on: ubuntu-latest'));
  });

  it('rejects a flow mapping', () => {
    shapeRejected(sub(GOOD, '      - name: Start container', '      - {name: Start container}'));
  });

  it('rejects an anchor', () => {
    shapeRejected(sub(GOOD, '    runs-on: ubuntu-latest', '    runs-on: &runner ubuntu-latest'));
  });

  it('rejects a folded block scalar where a literal one is required', () => {
    shapeRejected(sub(GOOD, '      - name: Wait for server\n        run: |', '      - name: Wait for server\n        run: >'));
  });

  it('rejects a duplicate key', () => {
    shapeRejected(sub(GOOD, '    runs-on: ubuntu-latest', '    runs-on: ubuntu-latest\n    runs-on: ubuntu-latest'));
  });

  it('rejects a document marker', () => {
    shapeRejected(`---\n${GOOD}`);
  });

  // The point of parsing rather than regexing: an innocent requote must not change the
  // verdict either way.
  it('accepts a requoted scalar that means the same thing', () => {
    const mutated = sub(GOOD, '    runs-on: ubuntu-latest', "    runs-on: 'ubuntu-latest'");
    expect(check(mutated)).toEqual([]);
  });

  // `|` with an explicit indentation indicator changes where the body is dedented from,
  // so accepting it would silently shift every pinned line by N columns. Unlike `>`, it
  // is NOT caught by the plain-scalar indicator check -- it starts with `|` and routes
  // straight to the block-scalar reader -- so this is the only case that reaches the
  // header check. Mutation testing found that check surviving deletion without it.
  it('rejects a block scalar with an explicit indentation indicator', () => {
    shapeRejected(sub(GOOD, '      - name: Wait for server\n        run: |', '      - name: Wait for server\n        run: |2'));
  });

  it('throws YamlShapeError, not a generic error, on a shape it cannot read', () => {
    expect(() => parseYaml('a:\n\tb: 1\n')).toThrow(YamlShapeError);
  });

  // The one tab placement the KEY_RE anchoring does NOT already reject: a tab inside a
  // scalar VALUE parses cleanly, so this is what makes the explicit tab check
  // load-bearing rather than decorative. The document-marker branch had no such case and
  // was deleted for it — `---` and `...` are rejected as unparseable keys either way,
  // which the case above still proves.
  it('rejects a tab inside a scalar value, which nothing else catches', () => {
    expect(() => parseYaml('a:\n  b: x\ty\n')).toThrow(YamlShapeError);
    expect(parseYaml('a:\n  b: x y\n')).toEqual({ a: { b: 'x y' } });
  });
});

describe('the shell helpers', () => {
  it('drops comment lines but keeps a # inside a command', () => {
    expect(significantLines('  # a comment\n  grep -q "#foo"\n\n  echo hi\n')).toEqual([
      'grep -q "#foo"',
      'echo hi',
    ]);
  });

  it('reads negation, condition and block off an if guard', () => {
    const guards = extractIfGuards(['if ! grep -q x; then', 'exit 1', 'fi']);
    expect(guards).toEqual([{ negated: true, condition: 'grep -q x', block: ['exit 1'] }]);
  });

  it('returns null on unbalanced if/fi rather than guessing', () => {
    expect(extractIfGuards(['if grep -q x; then', 'exit 1'])).toBeNull();
    expect(extractIfGuards(['fi'])).toBeNull();
  });
});

// The wiring. build.yml enumerates its steps individually and never runs `npm test`, so
// a check reachable only through that chain gets zero CI coverage -- that is what bit PR
// #128. These assertions are made by PARSING build.yml and package.json, not by grepping
// them, so a mention of the script inside a comment cannot satisfy them.
describe('the guard is actually wired into CI', () => {
  it('package.json exposes it as check:docker-smoke', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['check:docker-smoke']).toBe('node scripts/check-docker-smoke.cjs');
  });

  it('build.yml runs it as its own step, not only via the npm test chain', () => {
    const build = parseYaml(asLF(fs.readFileSync(BUILD_WORKFLOW_PATH, 'utf8')));
    const runs = build.jobs.build.steps.map(s => s.run).filter(r => typeof r === 'string');
    expect(runs).toContain('npm run check:docker-smoke');
    // The negative control for the assertion above: build.yml must genuinely NOT run the
    // whole chain, or "wired as its own step" would be an empty distinction.
    expect(runs).not.toContain('npm test');
  });

  it('npm test runs it too, so a local run is not weaker than CI', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.test).toContain('check:docker-smoke');
  });

  it('pins every step in the job, so nothing is silently unaccounted for', () => {
    const doc = parseYaml(GOOD);
    expect(doc.jobs.smoke.steps.length).toBe(EXPECTED_STEPS.length);
  });
});
