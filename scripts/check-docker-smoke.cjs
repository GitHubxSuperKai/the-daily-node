#!/usr/bin/env node
// Guards the `smoke` job in .github/workflows/docker.yml -- the only place anything
// asserts that the shipped image actually works.
//
// Why this exists: three separate PRs fixed vacuity bugs in that job, and every one of
// those fixes is currently protected by nothing but a comment.
//
//   #144  The two page assertions grepped for `<!doctype html>`, which BOTH the setup
//         page and the dashboard emit. The job had never once verified the dashboard --
//         18KB and 309KB of HTML, both matching. The fix asserts in both directions:
//         expected marker present AND the other page's marker absent.
//   #146  `Verify API endpoint responds` piped curl into python3. The job shell is
//         `/usr/bin/bash -e {0}` -- errexit, NOT pipefail -- so a pipeline exits with
//         its LAST command's status and the failing curl was discarded. The fix
//         captures into `body=$(...)` first.
//   #148  The healthcheck step truncated /tmp/probe.py before the extraction pipeline
//         ran, and `python3 - < empty-file` exits 0. The fix captures into
//         `config=$(...)`/`probe=$(...)` and refuses to execute a blank probe.
//
// Each of those is guarded today by prose -- including a literal "Do NOT collapse this
// back into a single pipeline." A comment-asserted invariant is a TODO, not a guard;
// it is failure mode 1 in this repo's own catalogue (found in #139) and it has now been
// joined by four more. Nothing in tests/ or scripts/ so much as names docker.yml.
//
// This is the docker.yml equivalent of scripts/check-codeql-config.cjs and follows the
// same two design rules, both learned the hard way here:
//
//   1. STRICT ALLOWLISTS, never denylists. A denylist blocks only the mutation its
//      author imagined -- PR #137's shipped and sailed past three rewrites that
//      re-blinded the same tree. Every expectation below is compared with
//      deepStrictEqual against an exact value: the job's key set, the ordered step
//      list, each step's key set, each step's env, and the full comment-stripped body
//      of every `run:` in the job. ANY edit -- widening, narrowing, reordering, or
//      something nobody here anticipated -- fails until this file is edited too. That
//      forced edit IS the review gate.
//
//   2. PARSE, do not regex the file. A regex over raw text is defeated by an innocent
//      reformat: requote a value, change an indent, and the match silently stops
//      finding what it was checking. The parser below is deliberately small and
//      deliberately STRICT -- it understands exactly the block-YAML subset docker.yml
//      uses and THROWS on everything else, so a reformat it cannot read fails the build
//      loudly rather than passing quietly.
//
// ── The two layers, and why both are here ─────────────────────────────────────
//
// Layer B (the pins above) is the allowlist: you cannot change these steps without
// coming through this file.
//
// Layer A is a set of SEMANTIC checks -- bare capture assignments, both-directions page
// assertions, the non-blank probe check and its ordering, the marker discrimination.
// Layer B subsumes layer A for detecting a mutation, so layer A would be redundant if
// the only threat were an unnoticed edit. It is not. The threat layer A answers is the
// deliberate edit: somebody changes `body=$(curl ...)` to `local body=$(curl ...)`,
// sees this guard go red, dutifully updates PINNED_RUN_LINES, and ships a vacuous step
// with a green build. Layer B goes quiet at exactly that moment; layer A does not.
// Layer A is also what produces an error message naming the invariant instead of a
// diff.
//
// ── Marker discrimination, and why it reads real files ────────────────────────
//
// #144's real lesson was that a marker can match BOTH the state under test and its
// opposite, and no amount of structural assertion sees it -- a rename would not have
// helped, and `dailynode-prefs` (which looks like an ideal dashboard marker) appears in
// setup.html too. So the two markers are not merely pinned as strings: this guard opens
// index.html and setup.html and asserts each marker appears in its own page and is
// ABSENT from the other. That is the one property the whole both-directions design
// rests on, and it is a property of the bytes, not of the workflow text.
//
// KNOWN LIMITS, stated up front rather than discovered later.
//
// This is a STRUCTURAL guard over the workflow file plus two static assertions over the
// HTML. It proves the smoke job still says what it should. It cannot prove GitHub ran it,
// that the runner's default shell is still `bash -e {0}`, or that the container behaved.
// tests/unit/checkDockerSmoke.test.js is the behaviour half: it executes this checker
// against mutated fixtures, so a hollowed-out version of THIS file gets caught. Nothing
// local can catch a hollowed-out runner.
//
// Layer A reads shell line by line, and two classes get past it that a real bash parser
// would catch.
//
//   REACHABILITY. An `exit 1` inside a never-entered loop (`while false; do ... done`) is
//   credited to the guard containing it, and wrapping the real assertions in a dead outer
//   block leaves them unexecuted -- `if false; then ... fi`, or the plausible-looking
//   `if [ -n "$body" ]; then ... fi`, which silently skips both assertions when the server
//   answers 200 with an empty body.
//
//   INDIRECT NAMING. The shadow-assignment check below allowlists reads, so it sees every
//   way bash can write a variable BY NAME. It cannot see the ways that carry the name as
//   data on the right-hand side: `declare -n ref=body; ref=x`, `printf -v "$tgt"`,
//   `declare -g "${ref}=x"`, `read -r "$tgt"`, `eval "body=x"` (the quoted span is blanked
//   before scanning), and `source` of a file that assigns. Each of those really does
//   shadow the capture.
//
// Both are named rather than chased. Each needs a real bash parser to decide, each is
// caught by layer B in production, and each additionally requires somebody to have updated
// the pin by hand. Reaching for another regex here is how the shadow-assignment check
// burned three review rounds before being inverted into an allowlist -- which is the shape
// that actually closes a class, and the reason these are documented instead.
//
// Not on this list, though an earlier version of it claimed to be: `elif` matched as `\b`
// versus `\s+`. `elif((1)); then` is valid bash, tells them apart, and is a test case --
// so that was a missing case rather than a limit, and a limits paragraph that overstates
// itself is the same failure class as an assertion that does.
//
// Zero-dependency on purpose, like check-secrets.cjs and check-codeql-config.cjs.
// Reaching for a YAML library would make a CI guard's integrity depend on a third-party
// publish, and would buy only the flow-style cases the parser below rejects loudly.

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const REPO_ROOT = path.resolve(__dirname, '..');
const WORKFLOW_REL = '.github/workflows/docker.yml';
const DASHBOARD_REL = 'index.html';
const SETUP_REL = 'setup.html';

// ── The guarded values ────────────────────────────────────────────────────────
//
// Every constant below is an exact expectation, not a floor and not a pattern.

// The workflow's complete top-level key set.
//
// This exists because the job-level key pin below was ONE LEVEL TOO LOW, which is the
// #145 shape repeating: `defaults: {run: {shell: ...}}` is legal at workflow level with
// identical effect, and a review of this file demonstrated both `shell: sh` and
// `shell: bash --noprofile --norc {0}` (no errexit at all) passing the guard green --
// which is #146 and #148 restored in three lines. A workflow-level `env:` is the same
// story for the two page markers. Pinning the whole key set is what closes the class
// rather than the two spellings somebody thought of.
const EXPECTED_TOP_LEVEL_KEYS = ['name', 'on', 'permissions', 'jobs'];

// The token this workflow hands every job. Pinned by VALUE, not merely by the key's
// presence in the list above: `permissions: write-all` is a one-word escalation in a
// workflow that pushes to GHCR, and an added `id-token: write` is an OIDC credential
// nothing here needs. The publish job is otherwise out of this guard's scope, but the
// token it runs with is declared at the top of the file the smoke job lives in, so it
// costs one assertion to pin rather than to write a note explaining why it is not pinned.
const EXPECTED_PERMISSIONS = { contents: 'read', packages: 'write' };

// The trigger key sets, for the same reason and found the same way. Pinning
// `on.pull_request.paths` alone left two siblings that neuter the trigger just as
// completely while `paths:` still matches its pin exactly: `branches: [never-a-branch]`
// and `types: [labeled]` both mean the smoke job never runs on an ordinary PR push, and
// both passed green. `push` is not decomposed here -- it gates the publish job, which is
// outside this guard's scope -- but its presence in this list is, so it cannot be dropped.
const EXPECTED_TRIGGER_KEYS = ['push', 'pull_request', 'workflow_dispatch'];
const EXPECTED_PULL_REQUEST_KEYS = ['paths'];

// The workflow's complete job list. A job added here runs with `packages: write` and is
// gated by nothing in this file; a job removed is a check that silently stops existing.
const EXPECTED_JOBS = ['smoke', 'publish'];

// The smoke job's complete key list, IN ORDER. Order-sensitive because deepStrictEqual on
// an array is, and that is left as-is rather than sorted: reordering is a reformat this
// guard will reject, which is churn, but sorting would also accept a reordering that
// changed meaning. Named honestly here so the failure message is not mistaken for a
// security finding when someone simply moved a line.
//
// This is one of the sharpest assertions in the file and it catches the mutations nobody
// would think to enumerate: `continue-on-error: true` makes the entire job advisory while
// still reporting green, and a job-level `defaults: {run: {shell: sh}}` swaps out the very
// shell whose errexit-but-not-pipefail semantics every capture assertion below depends on.
// Enumerating those two would be a denylist. EXPECTED_TOP_LEVEL_KEYS above closes the same
// hole one level up.
const EXPECTED_JOB_KEYS = ['if', 'runs-on', 'steps'];

// Narrowing this silently stops the job running on the event it exists for. GitHub
// counts a skipped required check as satisfied, so this is a green bypass, not a red one.
const EXPECTED_JOB_IF =
  "github.event_name == 'pull_request' || github.event_name == 'workflow_dispatch'";

// ubuntu-latest is not cosmetic here. Its default shell is `/usr/bin/bash -e {0}`:
// errexit, no pipefail. That exact combination is what makes `body=$(cmd)` abort the
// step on failure and what made the old pipelines silently pass. A different runner
// image, or a self-hosted one, changes the shell and every capture assertion with it.
const EXPECTED_RUNS_ON = 'ubuntu-latest';

// The smoke job only runs on pull_request and workflow_dispatch (see EXPECTED_JOB_IF),
// so this filter is the gate on whether it runs at all. Dropping an entry means edits to
// that path ship with the image untested, and the PR is still green because no smoke
// check was ever created to be red. push.paths is deliberately NOT pinned here: it gates
// the publish job, which is outside this guard's scope.
const EXPECTED_PULL_REQUEST_PATHS = [
  'Dockerfile',
  '.dockerignore',
  'bitaxe_api.py',
  'setup.html',
  'src/**',
  'build.js',
  'package.json',
  'package-lock.json',
  'docker-compose.yml',
  '.github/workflows/docker.yml',
];

// Every step in the smoke job, in order, with its complete key list (ordered -- see the
// note on EXPECTED_JOB_KEYS) and, where it runs one, the exact action it runs.
//
// `id` is `name:<name>` for a named step and `uses:<action>` for a bare one. The ordered
// list catches a step deleted, inserted, renamed or reordered -- deleting `Verify
// dashboard HTML served when configured` leaves the job named, required, green, and
// asserting nothing about the dashboard, which is precisely the state #144 found.
//
// `uses` is pinned SEPARATELY because `id` only carries the action for a bare step. A
// named step's id is its name, so `uses: docker/build-push-action@v7` was compared to
// nothing at all and could be repointed at a fork with the guard green -- verified in
// review. That asymmetry was invisible from this constant, which is why the field is
// explicit rather than inferred from the id.
//
// `keys` catches the additions that disable a step without touching anything else:
// `if: false` (a skipped step reports success), `continue-on-error: true` (a failed step
// reports success), `shell: sh` (different errexit semantics), and the removal of `env:`
// from a page step (both markers become empty strings, and `grep -q ""` matches
// everything -- the presence half passes on any page and the absence half fails, so it
// is loud, but only by luck).
const EXPECTED_STEPS = [
  { id: 'uses:actions/checkout@v6', keys: ['uses'], uses: 'actions/checkout@v6' },
  { id: 'name:Validate compose file', keys: ['name', 'run'] },
  { id: 'uses:docker/setup-buildx-action@v4', keys: ['uses'], uses: 'docker/setup-buildx-action@v4' },
  {
    id: 'name:Build image (amd64 only, load locally)',
    keys: ['name', 'uses', 'with'],
    uses: 'docker/build-push-action@v7',
  },
  { id: 'name:Start container', keys: ['name', 'run'] },
  { id: 'name:Wait for server', keys: ['name', 'run'] },
  { id: 'name:Verify setup page served when unconfigured', keys: ['name', 'env', 'run'] },
  { id: 'name:Verify dashboard HTML served when configured', keys: ['name', 'env', 'run'] },
  { id: 'name:Verify API endpoint responds', keys: ['name', 'run'] },
  { id: 'name:Verify the shipped healthcheck probe exits 0', keys: ['name', 'run'] },
  { id: 'name:Stop containers', keys: ['name', 'if', 'run'] },
];

// The only `if:` any step in this job is allowed to carry, and its exact value. Every
// other step's key set above forbids `if:` outright.
const EXPECTED_STEP_IF = { 'Stop containers': 'always()' };

// The build step's complete `with:` block. `load: true` is what puts the image in the
// local daemon for `docker run` to find; `tags:` is the name every later step uses.
// Pinned as a whole mapping rather than spot-checked, for the ALLOWED_TOP_LEVEL_KEYS
// reason: an added input is the dangerous shape, not an edited one.
const EXPECTED_BUILD_WITH = {
  context: '.',
  platforms: 'linux/amd64',
  load: 'true',
  tags: 'daily-node:smoke',
  'cache-from': 'type=gha',
  'cache-to': 'type=gha,mode=max',
};

// The env block both page steps carry, identical, pinned as a whole mapping.
//
// These two values ARE the assertion. #144's bug was a marker that matched both pages;
// pinning the pair here means a change to either one has to come through this file, and
// the marker-discrimination check further down then proves the new value actually
// discriminates. Both halves are needed: the pin without the file check would happily
// accept two markers that both appear in both pages.
const EXPECTED_PAGE_ENV = {
  DASH_MARK: 'fetchBTCPrice',
  SETUP_MARK: 'id="ips-msg"',
};

// Which page each marker must identify. `present` must contain it; `absent` must NOT.
// This is the property the whole both-directions design rests on, and it lives in the
// HTML rather than in the workflow, so it is checked against the real bytes.
const MARKER_PAGES = {
  DASH_MARK: { present: DASHBOARD_REL, absent: SETUP_REL },
  SETUP_MARK: { present: SETUP_REL, absent: DASHBOARD_REL },
};

// ── Layer A: the semantic invariants, per step ────────────────────────────────

// Captures whose failure must abort the step. Each is pinned as the EXACT line, and the
// checker additionally proves the line is a BARE assignment.
//
// Why bare specifically: under errexit a simple assignment takes the exit status of the
// command substitution, so `x=$(false)` aborts. `local x=$(false)`, `export x=$(false)`,
// `declare`, `readonly` and `typeset` do NOT -- the declaration builtin's own status wins
// and it succeeded. That is a two-word edit that reads as a tidy-up and silently restores
// the exact bug #146 and #148 were opened to fix, so it is rejected by name.
const REQUIRED_CAPTURES = {
  'Verify setup page served when unconfigured': [
    { name: 'body', line: 'body=$(curl -fsS http://localhost:3001/)' },
  ],
  'Verify dashboard HTML served when configured': [
    { name: 'body', line: 'body=$(curl -fsS http://localhost:3002/)' },
  ],
  'Verify API endpoint responds': [
    { name: 'body', line: 'body=$(curl -fsS http://localhost:3001/api/miners)' },
  ],
  'Verify the shipped healthcheck probe exits 0': [
    { name: 'config', line: 'config=$(docker compose -f docker-compose.yml config --format json)' },
    {
      name: 'probe',
      line:
        'probe=$(printf \'%s\' "$config" | python3 -c "import sys,json; ' +
        "print(json.load(sys.stdin)['services']['daily-node']['healthcheck']['test'][-1])\")",
    },
  ],
};

// The declaration prefixes that break the abort. Named rather than inferred, because the
// property "this assignment aborts under errexit" is not visible in the text any other
// way.
const NON_ABORTING_PREFIXES = ['local', 'export', 'declare', 'readonly', 'typeset'];

// Every line in a step's body that invokes the named command, as an exact ordered list.
// This is the allowlist form of "do not collapse this back into a single pipeline": the
// only way to reintroduce a pipe is to add or edit a line here.
const PINNED_COMMAND_LINES = {
  'Verify setup page served when unconfigured': {
    curl: ['body=$(curl -fsS http://localhost:3001/)'],
  },
  'Verify dashboard HTML served when configured': {
    curl: [
      'curl -fsS http://localhost:3002/ -o /dev/null && break',
      'body=$(curl -fsS http://localhost:3002/)',
    ],
  },
  'Verify API endpoint responds': {
    curl: ['body=$(curl -fsS http://localhost:3001/api/miners)'],
  },
  'Verify the shipped healthcheck probe exits 0': {
    'docker compose': [
      'config=$(docker compose -f docker-compose.yml config --format json)',
    ],
  },
};

// The both-directions page assertions (#144). For each page step: which marker must be
// asserted PRESENT (a negated grep that exits) and which must be asserted ABSENT (an
// un-negated grep that exits). Getting the negation backwards on either half inverts the
// test; dropping either half is what made the job vacuous in the first place.
//
// `subject` is the captured variable the grep must read. A grep against anything else --
// a second curl inline, a stale file -- is not asserting on the body this step fetched.
const PAGE_ASSERTIONS = {
  'Verify setup page served when unconfigured': {
    subject: 'body',
    present: 'SETUP_MARK',
    absent: 'DASH_MARK',
  },
  'Verify dashboard HTML served when configured': {
    subject: 'body',
    present: 'DASH_MARK',
    absent: 'SETUP_MARK',
  },
};

// The healthcheck step's non-blank guard (#148), and the two lines it must precede.
//
// Ordering is the whole point. `> /tmp/probe.py` truncates the file before its pipeline
// runs, and `python3 - < empty-file` exits 0 -- an empty script is a successful no-op. A
// non-blank check placed AFTER the write, or after the exec, still reads as a guard and
// guards nothing, because by then the green verdict has already been earned by executing
// an empty file.
const PROBE_GUARD = {
  step: 'Verify the shipped healthcheck probe exits 0',
  condition: '[ -z "${probe//[[:space:]]/}" ]',
  mustPrecede: [
    'printf \'%s\\n\' "$probe" > /tmp/probe.py',
    'docker exec -i dn-smoke python3 - < /tmp/probe.py',
  ],
};

// ── Layer B: the full body pin ────────────────────────────────────────────────
//
// The comment-stripped, whitespace-trimmed significant lines of every `run:` in the
// smoke job, in order. This is the allowlist that catches the mutation nobody imagined:
// layer A proves the captures abort and the page assertions run in both directions, but
// it says nothing about, say, `python3 -c "pass"` replacing the JSON assertion, or a
// `set +e` added at the top of a step. Those are not shapes worth enumerating -- pinning
// the bodies means they cannot happen without an edit here.
//
// Comments are STRIPPED before comparison, deliberately: a comment does not execute, and
// an assertion that a comment can satisfy is the failure mode this whole file exists to
// close. Indentation is trimmed too, so a re-indent inside a loop is not a false failure;
// every byte that runs is still pinned.
const PINNED_RUN_LINES = {
  'Validate compose file': [
    'docker compose -f docker-compose.yml config -q',
  ],
  'Start container': [
    'docker run -d --name dn-smoke -p 3001:3001 daily-node:smoke',
  ],
  'Wait for server': [
    'for i in $(seq 1 30); do',
    'if curl -fsS http://localhost:3001/ -o /dev/null; then',
    'echo "Server responded after ${i}s"',
    'exit 0',
    'fi',
    'sleep 1',
    'done',
    'echo "Server did not respond within 30s"',
    'docker logs dn-smoke',
    'exit 1',
  ],
  'Verify setup page served when unconfigured': [
    'body=$(curl -fsS http://localhost:3001/)',
    'printf \'%.200s\' "$body"; echo',
    'if ! echo "$body" | grep -q "$SETUP_MARK"; then',
    'echo "Setup page not served when unconfigured (marker $SETUP_MARK absent)"',
    'exit 1',
    'fi',
    'if echo "$body" | grep -q "$DASH_MARK"; then',
    'echo "Dashboard served when unconfigured -- setup gate is broken"',
    'exit 1',
    'fi',
    'echo "OK: unconfigured container serves setup.html"',
  ],
  'Verify dashboard HTML served when configured': [
    'docker run -d --name dn-smoke-cfg -p 3002:3001 -e BITAXE_IPS=127.0.0.1 daily-node:smoke',
    'for i in $(seq 1 30); do',
    'curl -fsS http://localhost:3002/ -o /dev/null && break',
    'if [ "$i" -eq 30 ]; then',
    'echo "Configured container did not respond within 30s"',
    'docker logs dn-smoke-cfg',
    'exit 1',
    'fi',
    'sleep 1',
    'done',
    'body=$(curl -fsS http://localhost:3002/)',
    'printf \'%.200s\' "$body"; echo',
    'if ! echo "$body" | grep -q "$DASH_MARK"; then',
    'echo "Dashboard HTML not served when configured (marker $DASH_MARK absent)"',
    'exit 1',
    'fi',
    'if echo "$body" | grep -q "$SETUP_MARK"; then',
    'echo "Setup page served when configured -- BITAXE_IPS was not honoured"',
    'exit 1',
    'fi',
    'echo "OK: configured container serves the built dashboard"',
  ],
  'Verify API endpoint responds': [
    'body=$(curl -fsS http://localhost:3001/api/miners)',
    'printf \'%s\' "$body" | python3 -c "import sys, json; d = json.load(sys.stdin); ' +
      'assert \'miners\' in d and \'count\' in d"',
    'echo "OK: /api/miners returned valid JSON"',
  ],
  'Verify the shipped healthcheck probe exits 0': [
    'config=$(docker compose -f docker-compose.yml config --format json)',
    'probe=$(printf \'%s\' "$config" | python3 -c "import sys,json; ' +
      'print(json.load(sys.stdin)[\'services\'][\'daily-node\'][\'healthcheck\'][\'test\'][-1])")',
    'if [ -z "${probe//[[:space:]]/}" ]; then',
    'echo "Extracted healthcheck probe is empty or blank -- nothing to execute"',
    'exit 1',
    'fi',
    'printf \'%s\\n\' "$probe" > /tmp/probe.py',
    'echo "--- probe under test ---"; cat /tmp/probe.py',
    'docker exec -i dn-smoke python3 - < /tmp/probe.py',
    'echo "OK: the shipped healthcheck probe exits 0 inside the image"',
  ],
  'Stop containers': [
    'docker rm -f dn-smoke dn-smoke-cfg || true',
  ],
};

// ── A small, strict block-YAML parser ─────────────────────────────────────────
//
// Handles exactly what docker.yml uses: nested block mappings, block sequences (both
// `- scalar` and `- key: value` items), literal block scalars (`|`, `|-`, `|+`), flow
// sequences of scalars (`[main]`), quoted and plain scalars, blank lines and comments.
// Everything else throws. The throw is the feature: a shape this cannot read fails the
// build rather than passing on a file it did not actually verify.

class YamlShapeError extends Error {}

const KEY_RE = /^ *(?:(['"])([A-Za-z0-9_.-]+)\1|([A-Za-z0-9_.-]+)) *:(?: +(.*))?$/;
const SEQ_RE = /^ *-(?: +(.*))?$/;

const indentOf = line => line.match(/^ */)[0].length;
const isBlank = line => line.trim() === '';
const isComment = line => /^\s*#/.test(line);

function skipTrivia(st) {
  while (st.i < st.lines.length && (isBlank(st.lines[st.i]) || isComment(st.lines[st.i]))) st.i++;
}

// Applied to structural lines only, never to block-scalar bodies: a tab inside a shell
// script is legal, a tab used as YAML indentation is not.
//
// This does ONE thing, and is named for it. It used to also reject `---`/`...` document
// markers, and that branch is deleted rather than kept: KEY_RE's key charclass rejects
// both as unparseable already, so the branch could not be made to fire on any input and
// only claimed a protection the anchoring provides. Verified by neutering it and finding
// every document-marker input still rejected -- the same way #145 found and deleted its
// comment-stripping helper. The tab branch survives that test because a tab INSIDE a
// scalar value (`b: x<TAB>y`) parses cleanly without it; the parser test names that case.
function checkNoTabs(line, lineNo) {
  if (line.includes('\t')) {
    throw new YamlShapeError(`line ${lineNo}: tab character -- YAML forbids tabs for indentation`);
  }
}

// Strips an inline comment the way YAML does: `#` only starts a comment when preceded by
// whitespace, so `a#b` is the scalar `a#b` and `a #b` is the scalar `a`.
//
// And NOT inside a quoted scalar, which the first version got wrong. `name: 'Start
// container #1'` is ordinary YAML that GitHub honours; stripping first turned it into the
// unterminated `'Start container` and rejected the whole file. That failed loudly rather
// than mis-reading, so it was churn rather than a hole -- but the comment above claimed
// YAML semantics the code did not implement, which is the failure class this file exists
// to close, one level up. A quoted scalar is now handed back whole and its own reader
// decides; only plain scalars are stripped.
function stripInlineComment(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if (quote === '"' || quote === "'") {
    const end = trimmed.indexOf(quote, 1);
    // Unbalanced: hand it back untouched so parseScalar reports it, rather than guessing.
    if (end === -1) return trimmed;
    const rest = trimmed.slice(end + 1);
    // What follows the closing quote must be nothing, or a comment. Slicing at the first
    // closing quote and discarding the remainder unread made `'don''t'` parse as `don`
    // (YAML's escape doubling -- the real value is `don't`) and `'x' junk` parse as `x`.
    // Both THREW before this function was rewritten, and rule 2 says a shape this cannot
    // read must fail loudly rather than be guessed at. Handing the whole thing back lets
    // parseScalar report it as the unbalanced or nested-quote value it is.
    // `\s+`, not `\s`. Accepting exactly one space before the `#` rejected the spelling
    // yamllint's own default requires (`comments.min-spaces-from-content: 2`), so a
    // reformat this guard should not care about failed the build -- a regression the
    // rewrite introduced while fixing a real bug, and the repo's churn signal.
    if (rest !== '' && !/^\s+#/.test(rest)) return trimmed;
    return trimmed.slice(0, end + 1);
  }
  const m = trimmed.match(/\s#.*$/);
  return (m ? trimmed.slice(0, m.index) : trimmed).trim();
}

// Unquotes a scalar, refusing anything with escape sequences rather than guessing at
// their semantics. An unbalanced quote is a shape this parser must not interpret.
function parseScalar(raw, lineNo) {
  const value = stripInlineComment(raw);
  const quote = value[0];
  if (quote !== '"' && quote !== "'") {
    if (/^[[{&*!|>]/.test(value)) {
      throw new YamlShapeError(
        `line ${lineNo}: value starts with the YAML indicator '${value[0]}' (flow collection, anchor, ` +
        'alias, tag or block scalar) where a plain scalar was expected. This guard will not guess at ' +
        'that shape -- teach scripts/check-docker-smoke.cjs the new shape deliberately.',
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

function parseFlowSequence(raw, lineNo) {
  const value = stripInlineComment(raw);
  if (!/^\[.*\]$/.test(value)) {
    throw new YamlShapeError(`line ${lineNo}: unterminated flow sequence ${JSON.stringify(value)}`);
  }
  const inner = value.slice(1, -1).trim();
  if (inner === '') return [];
  if (/[[\]{}]/.test(inner)) {
    throw new YamlShapeError(
      `line ${lineNo}: nested flow collection in ${JSON.stringify(value)} -- this guard reads flat flow ` +
      'sequences of scalars only.',
    );
  }
  return inner.split(',').map(part => parseScalar(part.trim(), lineNo));
}

// A literal block scalar. `|` clips to one trailing newline, `|-` strips it, `|+` keeps
// what is there; an explicit indentation indicator (`|2`) and folded scalars (`>`) throw,
// because both change the resulting string in ways this would have to guess at.
function parseBlockScalar(st, parentIndent, header, lineNo) {
  const h = stripInlineComment(header);
  if (!/^\|[-+]?$/.test(h)) {
    throw new YamlShapeError(
      `line ${lineNo}: block scalar header ${JSON.stringify(h)} -- only '|', '|-' and '|+' are read ` +
      "(no folded '>' and no explicit indentation indicator).",
    );
  }
  const chomp = h.slice(1);
  const body = [];
  let bodyIndent = null;
  while (st.i < st.lines.length) {
    const line = st.lines[st.i];
    if (isBlank(line)) {
      body.push('');
      st.i++;
      continue;
    }
    const ind = indentOf(line);
    if (ind <= parentIndent) break;
    if (bodyIndent === null) bodyIndent = ind;
    if (ind < bodyIndent) {
      throw new YamlShapeError(
        `line ${st.i + 1}: block scalar body dedents below its own indentation (${ind} < ${bodyIndent})`,
      );
    }
    body.push(line.slice(bodyIndent));
    st.i++;
  }
  while (body.length > 0 && body[body.length - 1] === '') body.pop();
  if (body.length === 0) return '';
  const text = body.join('\n');
  return chomp === '-' ? text : `${text}\n`;
}

function parseValue(st, parentIndent, rest, lineNo) {
  if (rest === undefined || /^#/.test(rest)) return parseNested(st, parentIndent);
  if (/^\|/.test(rest)) return parseBlockScalar(st, parentIndent, rest, lineNo);
  if (/^\[/.test(rest)) return parseFlowSequence(rest, lineNo);
  return parseScalar(rest, lineNo);
}

// The block that follows a `key:` with no inline value. A sequence may sit at the parent
// indent (valid YAML) or deeper; a mapping must be deeper. Anything at the parent indent
// that is not a sequence means the key simply has no value.
function parseNested(st, parentIndent) {
  skipTrivia(st);
  if (st.i >= st.lines.length) return null;
  const line = st.lines[st.i];
  const ind = indentOf(line);
  if (ind < parentIndent) return null;
  const isSeq = SEQ_RE.test(line);
  if (ind === parentIndent) return isSeq ? parseSequence(st, ind) : null;
  return isSeq ? parseSequence(st, ind) : parseMapping(st, ind);
}

function parseMapping(st, indent) {
  const out = Object.create(null);
  for (;;) {
    skipTrivia(st);
    if (st.i >= st.lines.length) break;
    const line = st.lines[st.i];
    const ind = indentOf(line);
    if (ind < indent) break;
    const lineNo = st.i + 1;
    checkNoTabs(line, lineNo);
    if (ind > indent) {
      throw new YamlShapeError(
        `line ${lineNo}: unexpected indentation (${ind} spaces where ${indent} was expected) in ` +
        `${JSON.stringify(line.trim())}`,
      );
    }
    // No explicit "sequence item where a mapping key belongs" branch here, and none for a
    // document that does not start at column 0 further down. Both were written, both were
    // then found to fire on no input KEY_RE does not already reject ("cannot parse …" and
    // "unexpected indentation" respectively), and both went the way of the document-marker
    // branch: a check that cannot be made to matter is claiming a protection the anchoring
    // already provides. Message quality is the only thing lost, and this file's own
    // standard says that does not buy a branch. Verified, not assumed -- the parser cases
    // in the behaviour test still assert both inputs are rejected.
    const m = line.match(KEY_RE);
    if (!m) {
      throw new YamlShapeError(
        `line ${lineNo}: cannot parse ${JSON.stringify(line.trim())} -- this guard reads plain block YAML only.`,
      );
    }
    const key = m[2] !== undefined ? m[2] : m[3];
    if (key in out) throw new YamlShapeError(`line ${lineNo}: duplicate key '${key}'`);
    st.i++;
    out[key] = parseValue(st, indent, m[4], lineNo);
  }
  return out;
}

function parseSequence(st, indent) {
  const out = [];
  for (;;) {
    skipTrivia(st);
    if (st.i >= st.lines.length) break;
    const line = st.lines[st.i];
    const ind = indentOf(line);
    if (ind < indent) break;
    const lineNo = st.i + 1;
    checkNoTabs(line, lineNo);
    if (ind > indent) {
      throw new YamlShapeError(
        `line ${lineNo}: unexpected indentation (${ind} spaces where ${indent} was expected) in a sequence`,
      );
    }
    const m = line.match(SEQ_RE);
    if (!m) break; // a mapping key at this indent: the sequence has ended
    const rest = m[1];
    if (rest === undefined || /^#/.test(rest)) {
      st.i++;
      out.push(parseNested(st, indent));
      continue;
    }
    // `rest` is a suffix of `line`, so this is where its first character sits.
    const contentIndent = line.length - rest.length;
    if (KEY_RE.test(`${' '.repeat(contentIndent)}${rest}`)) {
      // Blank the dash so the item reads as an ordinary mapping starting at that column.
      st.lines[st.i] = `${' '.repeat(contentIndent)}${rest}`;
      out.push(parseMapping(st, contentIndent));
      continue;
    }
    if (/^[-|]/.test(rest)) {
      throw new YamlShapeError(
        `line ${lineNo}: sequence item ${JSON.stringify(rest)} -- this guard reads scalar and mapping ` +
        'items only, not nested sequences or block scalars.',
      );
    }
    if (/^\[/.test(rest)) {
      out.push(parseFlowSequence(rest, lineNo));
    } else {
      out.push(parseScalar(rest, lineNo));
    }
    st.i++;
  }
  return out;
}

// Mappings are built with a null prototype so that `key in out` sees only real YAML keys
// -- a document with a `constructor:` key must not read as a duplicate. That prototype is
// then dropped on the way out, because assert.deepStrictEqual compares prototypes: a
// null-prototype mapping never equals an object literal, so every expectation in this
// file would fail against a perfectly good workflow.
function toPlain(node) {
  if (Array.isArray(node)) return node.map(toPlain);
  if (node !== null && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = toPlain(v);
    return out;
  }
  return node;
}

function parseYaml(text) {
  // Strip a UTF-8 BOM. JS \s matches U+FEFF, so a BOM otherwise makes line 1 look like
  // indented content and reports an indentation error, which is true but useless.
  const lines = text.replace(/^\uFEFF/, '').split('\n').map(l => l.replace(/\r$/, ''));
  const st = { lines, i: 0 };
  skipTrivia(st);
  if (st.i >= lines.length) return {};
  // An indented first line needs no check of its own: parseMapping and parseSequence both
  // reject an indent that is not the one they were called with. See the note in
  // parseMapping for why a redundant branch is deleted rather than kept.
  const doc = SEQ_RE.test(lines[st.i]) ? parseSequence(st, 0) : parseMapping(st, 0);
  skipTrivia(st);
  if (st.i < lines.length) {
    throw new YamlShapeError(`line ${st.i + 1}: trailing content after the document body`);
  }
  return toPlain(doc);
}

// ── Shell-body helpers ────────────────────────────────────────────────────────

// The lines of a `run:` body that actually execute: comments dropped, indentation
// trimmed. Only a line whose FIRST non-space character is `#` counts as a comment, so
// `grep -q "#foo"` survives intact.
function significantLines(body) {
  return String(body)
    .split('\n')
    .map(l => l.trim())
    .filter(l => l !== '' && !l.startsWith('#'));
}

// Pulls out every `if ...; then` block with its negation, condition and body. Returns
// null on an unbalanced `if`/`fi`, which is reported rather than skipped -- a body this
// cannot read must fail loudly, not be waved through.
//
// `for ... do`/`done` loops are transparent here: they contain the ifs in this job, and
// nesting depth is irrelevant to the questions being asked.
// `block` holds the THEN branch only. An `else`/`elif` closes it, and lines after that
// point are recorded nowhere -- which matters because `guardExits` reads `block`. Counting
// else-branch lines let `if COND; then echo ...; else exit 1; fi` satisfy the exit check
// while asserting the exact opposite of what the step intends: the failure branch prints
// and passes, and the success branch aborts. Found in review, seam-only (layer B pins the
// body verbatim in production), and closed here because layer A must stand on its own.
function extractIfGuards(lines) {
  const guards = [];
  const open = [];
  // Only the INNERMOST open guard records a line. Pushing into every open guard meant an
  // `exit 1` under a dead inner `if false; then ... fi` satisfied the OUTER guard's exit
  // check -- the same shape as the else-branch hole, one level in. The guards in this job
  // are flat, so nothing legitimate is lost by attributing each line to the block it
  // actually belongs to.
  const record = line => {
    const g = open[open.length - 1];
    if (g && !g.closed) g.block.push(line);
  };
  for (const [i, line] of lines.entries()) {
    const m = line.match(/^if\s+(!\s+)?(.+?)\s*;\s*then$/);
    if (m) {
      record(line);
      // `at` is the guard's own index in `lines`. The ordering check used to locate the
      // blank-probe guard by scanning the text instead, which went wrong twice in opposite
      // directions: a substring scan let a decoy line that merely MENTIONED the condition
      // move the anchor, and the exact-string match that replaced it returned -1 for
      // spellings this very regex accepts (`if [ x ] ; then`, `if  [ x ]; then`), which
      // made every ordering comparison silently false -- a fail-open in the assertion, with
      // no diagnostic. Reading the index off the guard that was already matched cannot
      // disagree with the guard that was already matched.
      const guard = { at: i, negated: Boolean(m[1]), condition: m[2].trim(), block: [], closed: false };
      open.push(guard);
      guards.push(guard);
      continue;
    }
    if (line === 'fi') {
      if (open.length === 0) return null;
      open.pop();
      continue;
    }
    // `\b`, not an exact-string match. `else` and `elif` take trailing comments, and
    // `significantLines` only drops a line whose FIRST character is `#` -- so an exact
    // match on 'else' was defeated by `else # keep the happy path quiet`, which is valid
    // bash and restores the inversion this branch was added to stop. Found in re-review:
    // the fix was one token too narrow.
    if (/^else\b/.test(line) || /^elif\b/.test(line)) {
      if (open.length === 0) return null;
      open[open.length - 1].closed = true;
      continue;
    }
    record(line);
  }
  if (open.length > 0) return null;
  for (const g of guards) delete g.closed;   // `at` stays: the ordering check reads it.
  return guards;
}

const guardExits = guard => guard.block.some(l => /^exit\s+[1-9][0-9]*$/.test(l));

function deepEqual(a, b) {
  try {
    assert.deepStrictEqual(a, b);
    return true;
  } catch {
    return false;
  }
}

// ── The checks ────────────────────────────────────────────────────────────────

// Returns an array of human-readable problems. Empty array means the gate is intact.
// Pure: takes text, touches no filesystem, so the behaviour test can drive it with
// mutated inputs.
//
// `pinnedRunLines` is a seam, not a feature, and it exists for one reason. The header
// claims layer A keeps biting after somebody updates layer B's allowlist to match their
// edit. Without this parameter that claim is untestable -- every layer A check can only
// be reached through a workflow that layer B has ALREADY rejected, so mutation-testing
// this file showed the bare-capture and exit-non-zero checks surviving deletion with the
// suite still green. They were decorative in exactly the way this whole file exists to
// prevent. Passing updated pins reproduces the "dutifully updated the allowlist" state,
// which is the only state where layer A is the last thing standing.
function checkDockerSmoke({
  workflowText,
  dashboardHtml,
  setupHtml,
  pinnedRunLines = PINNED_RUN_LINES,
}) {
  const problems = [];
  const fail = (...lines) => problems.push(...lines);

  let doc;
  try {
    doc = parseYaml(workflowText);
  } catch (err) {
    if (err instanceof YamlShapeError) {
      return [
        `${WORKFLOW_REL} is no longer in a shape this guard can read: ${err.message}`,
        '  The guard fails loudly rather than passing on a file it cannot verify.',
        '  Either restore plain block YAML, or update scripts/check-docker-smoke.cjs deliberately.',
      ];
    }
    throw err;
  }

  // ── The trigger, the job list, and the job's own shape ──────────────────────

  // The workflow's own key set, before anything below. A workflow-level `defaults:` block
  // changes the shell for EVERY job -- `shell: sh`, or a bash invocation without `-e` --
  // and every capture assertion further down silently stops aborting. Pinned as a whole
  // key set rather than by name: the job-level pin was written first and named
  // `defaults:` explicitly, which is precisely how the workflow-level spelling walked past.
  const topKeys = Object.keys(doc);
  if (!deepEqual(topKeys, EXPECTED_TOP_LEVEL_KEYS)) {
    fail(
      `${WORKFLOW_REL} top-level keys are ${JSON.stringify(topKeys)},`,
      `  expected exactly ${JSON.stringify(EXPECTED_TOP_LEVEL_KEYS)} in this order.`,
      '  A workflow-level `defaults: {run: {shell: ...}}` replaces the errexit-no-pipefail shell every',
      '  capture assertion in the smoke job depends on, and a workflow-level `env:` can redefine the two',
      '  page markers. Both leave every other assertion here green. Update EXPECTED_TOP_LEVEL_KEYS if',
      '  the new key is deliberate.',
    );
  }

  if (!deepEqual(doc.permissions, EXPECTED_PERMISSIONS)) {
    fail(
      `${WORKFLOW_REL} permissions: is ${JSON.stringify(doc.permissions)},`,
      `  expected exactly ${JSON.stringify(EXPECTED_PERMISSIONS)}.`,
      '  `write-all` is a one-word escalation of the token every job in this workflow runs with, in a',
      '  workflow that pushes images to GHCR. Update EXPECTED_PERMISSIONS if the change is deliberate.',
    );
  }

  const triggers = doc.on;
  if (!triggers || typeof triggers !== 'object' || Array.isArray(triggers)) {
    fail(`${WORKFLOW_REL} has no readable on: block -- nothing here can say when the smoke job runs.`);
  } else {
    const triggerKeys = Object.keys(triggers);
    if (!deepEqual(triggerKeys, EXPECTED_TRIGGER_KEYS)) {
      fail(
        `${WORKFLOW_REL} on: declares ${JSON.stringify(triggerKeys)},`,
        `  expected exactly ${JSON.stringify(EXPECTED_TRIGGER_KEYS)} in this order.`,
        '  Dropping pull_request stops the smoke job existing on PRs at all, and a required check that is',
        '  never created reads as satisfied rather than as missing.',
      );
    }
    // `paths:` alone was not enough. `branches:` and `types:` neuter the trigger just as
    // completely while `paths:` still matches its pin exactly -- `types: [labeled]` means
    // the job only runs when somebody adds a label, never on an ordinary push to the PR.
    // Both passed the guard green before this key-set pin existed.
    const prKeys = triggers.pull_request ? Object.keys(triggers.pull_request) : [];
    if (!deepEqual(prKeys, EXPECTED_PULL_REQUEST_KEYS)) {
      fail(
        `${WORKFLOW_REL} on.pull_request declares ${JSON.stringify(prKeys)},`,
        `  expected exactly ${JSON.stringify(EXPECTED_PULL_REQUEST_KEYS)}.`,
        '  `branches:` and `types:` each stop the smoke job running on an ordinary PR push while the',
        '  paths list below still matches -- the PR stays green because no smoke check was ever created',
        '  to be red. Update EXPECTED_PULL_REQUEST_KEYS if the narrowing is deliberate.',
      );
    }
  }

  const prPaths = triggers && triggers.pull_request ? triggers.pull_request.paths : undefined;
  if (!Array.isArray(prPaths)) {
    fail(
      `${WORKFLOW_REL} no longer declares on.pull_request.paths as a list -- the smoke job's trigger is`,
      '  unpinned, so it can stop running on a whole class of change with nothing turning red.',
    );
  } else if (!deepEqual(prPaths, EXPECTED_PULL_REQUEST_PATHS)) {
    fail(
      `${WORKFLOW_REL} on.pull_request.paths is ${JSON.stringify(prPaths)},`,
      `  expected exactly ${JSON.stringify(EXPECTED_PULL_REQUEST_PATHS)}.`,
      '  Dropping an entry means edits to that path ship with the image untested, and the PR stays green',
      '  because no smoke check was ever created to be red. Update EXPECTED_PULL_REQUEST_PATHS if deliberate.',
    );
  }

  const jobs = doc.jobs;
  if (!jobs || typeof jobs !== 'object' || Array.isArray(jobs)) {
    return [...problems, `${WORKFLOW_REL} has no readable jobs: block -- nothing below can be checked.`];
  }
  const jobNames = Object.keys(jobs);
  if (!deepEqual(jobNames, EXPECTED_JOBS)) {
    fail(
      `${WORKFLOW_REL} declares jobs ${JSON.stringify(jobNames)}, expected exactly ${JSON.stringify(EXPECTED_JOBS)}.`,
      '  A removed job is a check that silently stops existing; an added one runs with packages: write',
      '  and is gated by nothing here. Update EXPECTED_JOBS if the change is deliberate.',
    );
  }

  const smoke = jobs.smoke;
  if (!smoke || typeof smoke !== 'object' || Array.isArray(smoke)) {
    return [...problems, `${WORKFLOW_REL} has no readable smoke: job -- the image is verified by nothing.`];
  }

  const jobKeys = Object.keys(smoke);
  if (!deepEqual(jobKeys, EXPECTED_JOB_KEYS)) {
    fail(
      `${WORKFLOW_REL} smoke job declares ${JSON.stringify(jobKeys)}, expected exactly ${JSON.stringify(EXPECTED_JOB_KEYS)}.`,
      '  `continue-on-error: true` makes the whole job advisory while still reporting green, and',
      '  `defaults: {run: {shell: ...}}` swaps out the errexit-no-pipefail shell every capture below',
      '  depends on. Update EXPECTED_JOB_KEYS if the new key is deliberate.',
    );
  }
  if (smoke.if !== EXPECTED_JOB_IF) {
    fail(
      `${WORKFLOW_REL} smoke job if: is ${JSON.stringify(smoke.if)}, expected ${JSON.stringify(EXPECTED_JOB_IF)}.`,
      '  A skipped required check reports as satisfied, so narrowing this is a green bypass, not a red one.',
    );
  }
  if (smoke['runs-on'] !== EXPECTED_RUNS_ON) {
    fail(
      `${WORKFLOW_REL} smoke job runs-on: is ${JSON.stringify(smoke['runs-on'])}, expected ${JSON.stringify(EXPECTED_RUNS_ON)}.`,
      "  Its default shell is `/usr/bin/bash -e {0}` -- errexit, no pipefail. Every `x=$(cmd)` capture in",
      '  this job aborts because of that exact combination; another runner image changes it silently.',
    );
  }

  // ── The step list ──────────────────────────────────────────────────────────

  const steps = Array.isArray(smoke.steps) ? smoke.steps : null;
  if (!steps) {
    return [...problems, `${WORKFLOW_REL} smoke job has no readable steps: list.`];
  }

  const stepId = s => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return '<unreadable step>';
    if (typeof s.name === 'string') return `name:${s.name}`;
    if (typeof s.uses === 'string') return `uses:${s.uses}`;
    return `<step with neither name: nor uses:: ${JSON.stringify(Object.keys(s))}>`;
  };
  const actualIds = steps.map(stepId);
  const expectedIds = EXPECTED_STEPS.map(s => s.id);
  if (!deepEqual(actualIds, expectedIds)) {
    fail(
      `${WORKFLOW_REL} smoke job runs ${JSON.stringify(actualIds)},`,
      `  expected exactly ${JSON.stringify(expectedIds)}.`,
      '  A deleted assertion step leaves the job named, required, green and asserting nothing -- which is',
      '  exactly the state PR #144 found. Update EXPECTED_STEPS if a step was deliberately changed.',
    );
  } else {
    for (let i = 0; i < steps.length; i++) {
      const keys = Object.keys(steps[i]);
      if (!deepEqual(keys, EXPECTED_STEPS[i].keys)) {
        fail(
          `${WORKFLOW_REL} step ${JSON.stringify(actualIds[i])} declares ${JSON.stringify(keys)},`,
          `  expected exactly ${JSON.stringify(EXPECTED_STEPS[i].keys)} in this order.`,
          '  `if:` makes the step skippable (a skipped step reports success), `continue-on-error: true`',
          '  makes a failing one report success, and `shell:` changes the errexit semantics underneath it.',
        );
      }
      // A NAMED step's id is its name, so its `uses:` is not compared by the id list above
      // and was compared to nothing at all until this ran -- `docker/build-push-action@v7`
      // could be repointed at a fork with the whole guard green.
      const expectedUses = EXPECTED_STEPS[i].uses;
      if (expectedUses !== undefined && steps[i].uses !== expectedUses) {
        fail(
          `${WORKFLOW_REL} step ${JSON.stringify(actualIds[i])} runs ${JSON.stringify(steps[i].uses)},`,
          `  expected ${JSON.stringify(expectedUses)}.`,
          '  A repointed `uses:` runs somebody else\'s action under this step\'s name, with this job\'s',
          '  token. If the action was deliberately bumped, update EXPECTED_STEPS too.',
        );
      }
    }
  }

  // Index the steps by name for everything below. Built from whatever is actually there,
  // so the per-step checks still run (and still report) when the list itself has drifted.
  const byName = new Map();
  for (const s of steps) {
    if (s && typeof s === 'object' && typeof s.name === 'string') byName.set(s.name, s);
  }

  for (const [name, expected] of Object.entries(EXPECTED_STEP_IF)) {
    const step = byName.get(name);
    if (step && step.if !== expected) {
      fail(
        `${WORKFLOW_REL} step ${JSON.stringify(name)} has if: ${JSON.stringify(step.if)}, expected ${JSON.stringify(expected)}.`,
      );
    }
  }

  const buildStep = byName.get('Build image (amd64 only, load locally)');
  if (buildStep && !deepEqual(buildStep.with, EXPECTED_BUILD_WITH)) {
    fail(
      `${WORKFLOW_REL} build step with: is ${JSON.stringify(buildStep.with)},`,
      `  expected exactly ${JSON.stringify(EXPECTED_BUILD_WITH)}.`,
      '  `load: true` is what puts the image in the local daemon for `docker run` to find, and `tags:` is',
      '  the name every later step uses. An ADDED input is the dangerous shape here, not an edited one.',
    );
  }

  // ── Layer B: the pinned bodies ─────────────────────────────────────────────

  const bodies = new Map();
  for (const [name, expectedLines] of Object.entries(pinnedRunLines)) {
    const step = byName.get(name);
    if (!step) continue; // the step list check above already reported this
    if (typeof step.run !== 'string') {
      fail(`${WORKFLOW_REL} step ${JSON.stringify(name)} has no readable run: body.`);
      continue;
    }
    const lines = significantLines(step.run);
    bodies.set(name, lines);
    if (!deepEqual(lines, expectedLines)) {
      fail(
        `${WORKFLOW_REL} step ${JSON.stringify(name)} no longer runs the pinned commands.`,
        `    actual:   ${JSON.stringify(lines)}`,
        `    expected: ${JSON.stringify(expectedLines)}`,
        '  Comments are stripped before this comparison, so only executing lines are pinned. If the change',
        '  is deliberate, update PINNED_RUN_LINES in scripts/check-docker-smoke.cjs -- and read the layer A',
        '  failures below, which do not go quiet when you do.',
      );
    }
  }

  // ── Layer A: the semantic invariants ───────────────────────────────────────

  // Captures must be BARE assignments, or the step stops aborting on a failed command.
  for (const [name, captures] of Object.entries(REQUIRED_CAPTURES)) {
    const lines = bodies.get(name);
    if (!lines) continue;
    for (const cap of captures) {
      // Every line that WRITES this variable, found by allowlisting reads rather than by
      // enumerating writes.
      //
      // Three review rounds went into this one expression, and the first two both got it
      // wrong the same way. Round one matched only `NAME=$(`; round two widened it to
      // `NAME=` plus `^read ... NAME`. Each time, review found the next spelling: first
      // `body=$SETUP_MARK`, then `IFS= read -r body`, `printf -v body`, `mapfile`,
      // `readarray`, `body+=`, `for body in`, `while read -r body`. A fourth round would
      // have added `IFS=` and a fifth `printf -v`. That is a denylist -- design rule 1 at
      // the top of this file, broken inside the check that enforces it -- and widening it
      // does not converge, because the set of ways bash can name a variable on the left is
      // open.
      //
      // Inverted, the rule is one line and closes the class: OUTSIDE the pinned capture,
      // every mention of the identifier must be a READ, i.e. preceded by `$` or `${`.
      // Anything else standing as its own shell word is a write, whatever the surrounding
      // command is called.
      //
      // Quoted spans are blanked first, so prose inside a message is not mistaken for a
      // word -- `echo "--- probe under test ---"` mentions `probe` and writes nothing.
      // Double quotes go first because the inner command substitutions in this job contain
      // single quotes. `/tmp/probe.py` is untouched by design: `probe` there is preceded by
      // `/`, so it is part of a larger word rather than a shell word of its own.
      //
      // KNOWN LIMITS, both of them the price of reading text rather than parsing bash, and
      // both covered by the header's INDIRECT NAMING note:
      //
      //   - A write whose target is named as DATA rather than as a word is invisible here:
      //     `declare -n ref=body; ref=x`, `printf -v "$tgt"`, `declare -g "${ref}=x"`,
      //     `eval "body=x"` (blanked with the other quoted spans), `source` of a file.
      //
      //   - The mirror, and the cost of the inversion: a bare word that happens to match a
      //     capture name reads as a write even when it is an argument. `docker compose ...
      //     config -q` in a step capturing `$config` would be reported as a second write.
      //     That fails CLOSED -- it rejects a good workflow rather than accepting a bad one
      //     -- and the message names the line, so the fix is an updated pin or a rename.
      //     Tightening it further is how this check got broken twice; it stays as it is.
      const unquoted = l => l.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
      const writes = new RegExp(`(?:^|[\\s;&(])${cap.name}\\b`);
      const assignments = lines.filter(l => writes.test(unquoted(l)));
      // `$(` still classifies the capture itself -- a bare command substitution is the
      // shape that aborts under errexit -- it just no longer decides what counts as a write.
      const bare = assignments.filter(l => l.startsWith(`${cap.name}=$(`));
      const prefixed = assignments.filter(l =>
        NON_ABORTING_PREFIXES.some(p => new RegExp(`^${p}\\s`).test(l)),
      );
      if (prefixed.length > 0) {
        fail(
          `${WORKFLOW_REL} step ${JSON.stringify(name)} captures $${cap.name} with a declaration builtin:`,
          `    ${JSON.stringify(prefixed)}`,
          `  Under errexit a bare \`${cap.name}=$(cmd)\` takes the command's exit status and aborts the step.`,
          '  `local`/`export`/`declare`/`readonly`/`typeset` do NOT -- the builtin\'s own status wins, and it',
          '  succeeded. That two-word edit silently restores the bug PRs #146 and #148 were opened to fix.',
        );
      }
      if (!bare.includes(cap.line)) {
        fail(
          `${WORKFLOW_REL} step ${JSON.stringify(name)} no longer captures $${cap.name} as a bare assignment.`,
          `    expected the line: ${cap.line}`,
          `    assignments found: ${JSON.stringify(assignments)}`,
          '  Capturing first is what makes the request its own simple command; piping it straight into the',
          '  consumer discards its exit status, because the job shell has errexit but NOT pipefail.',
        );
      } else if (assignments.length !== 1) {
        // Counted over ALL assignments, not just exact duplicates of the pinned line. A
        // SHADOW assignment is the dangerous shape and an exact duplicate is the harmless
        // one: `body=$(cat /tmp/stale)` after the pinned capture leaves every other check
        // here satisfied while the assertions below read something the step never fetched.
        fail(
          `${WORKFLOW_REL} step ${JSON.stringify(name)} assigns $${cap.name} ${assignments.length} times`,
          `    ${JSON.stringify(assignments)}`,
          '  -- this guard pins one capture and can no longer tell which value the assertions below read.',
          '  A later assignment shadows the pinned one, so the step asserts on something it never fetched.',
        );
      }
    }
  }

  // Every invocation of the pinned commands, as an exact list. This is the allowlist form
  // of "Do NOT collapse this back into a single pipeline".
  for (const [name, commands] of Object.entries(PINNED_COMMAND_LINES)) {
    const lines = bodies.get(name);
    if (!lines) continue;
    for (const [command, expectedLines] of Object.entries(commands)) {
      const found = lines.filter(l => l.includes(command));
      if (!deepEqual(found, expectedLines)) {
        fail(
          `${WORKFLOW_REL} step ${JSON.stringify(name)} invokes \`${command}\` on lines this guard does not pin.`,
          `    actual:   ${JSON.stringify(found)}`,
          `    expected: ${JSON.stringify(expectedLines)}`,
          `  Reintroducing a pipe (\`${command} ... | consumer\`) is the exact vacuity these steps were fixed`,
          '  for: the pipeline exits with its LAST command\'s status, so the failure is thrown away.',
        );
      }
    }
  }

  // The both-directions page assertions (#144).
  for (const [name, spec] of Object.entries(PAGE_ASSERTIONS)) {
    const step = byName.get(name);
    const lines = bodies.get(name);
    if (!step || !lines) continue;

    if (!deepEqual(step.env, EXPECTED_PAGE_ENV)) {
      fail(
        `${WORKFLOW_REL} step ${JSON.stringify(name)} env: is ${JSON.stringify(step.env)},`,
        `  expected exactly ${JSON.stringify(EXPECTED_PAGE_ENV)}.`,
        '  These two values ARE the assertion: #144 was a marker that matched both pages, so both pages',
        '  passed. Changing either has to come through here, and the marker check below then proves the',
        '  new value actually discriminates.',
      );
    }

    const guards = extractIfGuards(lines);
    if (guards === null) {
      fail(
        `${WORKFLOW_REL} step ${JSON.stringify(name)} has unbalanced if/fi -- this guard cannot read its`,
        '  assertions, so it fails rather than passing over them.',
      );
      continue;
    }

    for (const [role, marker] of [['present', spec.present], ['absent', spec.absent]]) {
      const condition = `echo "$${spec.subject}" | grep -q "$${marker}"`;
      const negated = role === 'present';
      const matching = guards.filter(g => g.condition === condition);
      if (matching.length !== 1) {
        fail(
          `${WORKFLOW_REL} step ${JSON.stringify(name)} has ${matching.length} guards on \`${condition}\`, expected 1.`,
          `  The ${role} half of the assertion is what makes this step non-vacuous: without it, a page that`,
          '  is not the one under test satisfies the step. See PR #144.',
        );
        continue;
      }
      const g = matching[0];
      if (g.negated !== negated) {
        fail(
          `${WORKFLOW_REL} step ${JSON.stringify(name)} asserts \`${condition}\` with`,
          `  ${g.negated ? 'a negation' : 'no negation'}, expected ${negated ? 'a negation' : 'no negation'}.`,
          `  $${marker} must be asserted ${role.toUpperCase()} here; flipping the negation inverts the test`,
          '  into one that passes on exactly the wrong page.',
        );
      }
      if (!guardExits(g)) {
        fail(
          `${WORKFLOW_REL} step ${JSON.stringify(name)}: the \`${condition}\` guard no longer exits non-zero.`,
          '  A guard whose body only echoes reports the failure and then passes the step anyway.',
        );
      }
    }
  }

  // The healthcheck step's non-blank probe check (#148), and its position.
  {
    const lines = bodies.get(PROBE_GUARD.step);
    if (lines) {
      const guards = extractIfGuards(lines);
      if (guards === null) {
        fail(
          `${WORKFLOW_REL} step ${JSON.stringify(PROBE_GUARD.step)} has unbalanced if/fi -- this guard cannot`,
          '  read its assertions, so it fails rather than passing over them.',
        );
      } else {
        const matching = guards.filter(g => g.condition === PROBE_GUARD.condition && !g.negated);
        if (matching.length !== 1) {
          fail(
            `${WORKFLOW_REL} step ${JSON.stringify(PROBE_GUARD.step)} has ${matching.length} un-negated guards on`,
            `  \`${PROBE_GUARD.condition}\`, expected 1.`,
            '  `python3 - < empty-file` exits 0 -- an empty script is a successful no-op -- so without this',
            '  check an extraction that yielded nothing reports green having executed nothing (PR #148).',
          );
        } else if (!guardExits(matching[0])) {
          fail(
            `${WORKFLOW_REL} step ${JSON.stringify(PROBE_GUARD.step)}: the blank-probe guard no longer exits`,
            '  non-zero, so a blank probe is reported and then executed anyway.',
          );
        } else {
          // Taken from the guard that was already matched, not found again by text. Both
          // text-based anchors were wrong in opposite directions -- a substring scan a
          // decoy could move, then an exact match that returned -1 for `if [ x ] ; then`
          // and silently disabled every comparison below. This cannot disagree with the
          // guard it came from, and it cannot be -1.
          const guardIdx = matching[0].at;
          if (typeof guardIdx !== 'number' || guardIdx < 0) {
            // Unreachable by construction; reported rather than assumed, because the last
            // two spellings of this line both failed OPEN and said nothing while doing it.
            fail(
              `${WORKFLOW_REL} step ${JSON.stringify(PROBE_GUARD.step)}: cannot locate the blank-probe guard's`,
              '  own line, so the ordering assertion cannot run. It fails rather than passing silently.',
            );
          }
          for (const later of PROBE_GUARD.mustPrecede) {
            const idx = lines.indexOf(later);
            if (idx === -1) {
              fail(
                `${WORKFLOW_REL} step ${JSON.stringify(PROBE_GUARD.step)} no longer runs ${JSON.stringify(later)},`,
                '  so this guard can no longer prove the blank-probe check happens first.',
              );
            } else if (idx < guardIdx) {
              fail(
                `${WORKFLOW_REL} step ${JSON.stringify(PROBE_GUARD.step)} runs ${JSON.stringify(later)} BEFORE the`,
                '  blank-probe check. Ordering is the whole point: `> /tmp/probe.py` truncates the file before',
                '  its pipeline runs, so a check placed after the write still reads as a guard and guards',
                '  nothing -- the green verdict has already been earned by executing an empty file.',
              );
            }
          }
        }
      }
    }
  }

  // ── Marker discrimination, against the real pages ──────────────────────────
  //
  // The one property the both-directions design rests on, and the one no structural
  // assertion can see: each marker must appear in its own page and NOT in the other.
  const pages = { [DASHBOARD_REL]: dashboardHtml, [SETUP_REL]: setupHtml };
  for (const [envVar, where] of Object.entries(MARKER_PAGES)) {
    const marker = EXPECTED_PAGE_ENV[envVar];
    const presentText = pages[where.present];
    const absentText = pages[where.absent];
    if (typeof presentText !== 'string' || typeof absentText !== 'string') {
      fail(
        `Cannot verify the $${envVar} marker: ${where.present} or ${where.absent} is missing or unreadable.`,
        '  The guard reports this rather than skipping it -- an unreadable page makes a broken run',
        '  indistinguishable from a clean one.',
      );
      continue;
    }
    if (!presentText.includes(marker)) {
      fail(
        `$${envVar} is ${JSON.stringify(marker)}, which does NOT appear in ${where.present}.`,
        `  The smoke job asserts this marker is present when ${where.present} is served, so that assertion`,
        '  can only ever fail. Pick a marker the page actually contains.',
      );
    }
    if (absentText.includes(marker)) {
      fail(
        `$${envVar} is ${JSON.stringify(marker)}, which appears in BOTH ${where.present} and ${where.absent}.`,
        '  A marker matching both pages makes the assertion vacuous in exactly the way PR #144 found: the',
        '  presence half passes whichever page was served. Both `<!doctype html>` and `dailynode-prefs`',
        '  fail this test today. Pick a marker unique to one page.',
      );
    }
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

// Reads the files under `root` and returns problems. A missing file is a problem, not a
// crash, and emphatically not a pass -- check-secrets.cjs shipped a bug where an
// unreadable file made a broken run indistinguishable from a clean one.
//
// `root` is a parameter purely so the behaviour test can drive this end-to-end against a
// temp directory holding a mutated workflow. Without that, replacing the file read with a
// hardcoded good string -- which makes `npm run check:docker-smoke` decorative, reporting
// the job intact no matter what the file says -- would keep the whole suite green.
function checkRepo(root = REPO_ROOT) {
  const workflowText = readOrNull(WORKFLOW_REL, root);
  if (workflowText === null) {
    return [`${WORKFLOW_REL} is missing or unreadable -- the smoke job is pinned by nothing.`];
  }
  return checkDockerSmoke({
    workflowText,
    dashboardHtml: readOrNull(DASHBOARD_REL, root),
    setupHtml: readOrNull(SETUP_REL, root),
  });
}

if (require.main === module) {
  const problems = checkRepo();
  if (problems.length > 0) {
    console.error(`✗ ${WORKFLOW_REL} smoke-job guard failed:`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(
    `✓ docker.yml smoke job intact (${EXPECTED_STEPS.length} steps pinned, ` +
    `${Object.keys(PINNED_RUN_LINES).length} run bodies, markers discriminate)`,
  );
}

// Only what the behaviour test and the CLI actually consume.
module.exports = {
  checkDockerSmoke,
  checkRepo,
  parseYaml,
  YamlShapeError,
  PINNED_RUN_LINES,
  significantLines,
  extractIfGuards,
  EXPECTED_PAGE_ENV,
  EXPECTED_STEPS,
};
