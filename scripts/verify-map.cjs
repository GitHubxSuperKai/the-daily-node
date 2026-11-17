#!/usr/bin/env node
// `node scripts/verify-map.cjs`, the non-required `verify-map` CI job (build.yml).
//
// The required `build` job runs `npm run verify` with the PR's own rubric, so a PR that
// edits a flow is judged by the flow it edited. This job holds the rubric out of the
// change's reach. It does two things:
//
//   1. names every rubric file that exists at the base and that the PR modifies or
//      deletes, plus an added playwright.config.* and a changed or removed `verify` or
//      `verify:refresh-fixtures` package.json script key (listRubricChanges);
//   2. checks out the base's copy of the rubric over the PR's (files the PR ADDS stay),
//      deletes any added playwright.config.*, and runs `node scripts/verify.cjs`.
//
// The rubric: everything under tests/e2e/, any playwright.config.*, scripts/verify.cjs,
// scripts/verify-map.cjs and scripts/verify-refresh-fixtures.cjs, and the two script
// keys above. NOT scripts/verify-vendor.cjs and NOT `verify:vendor`.
//
// The base comes from env VERIFY_MAP_BASE (a full commit SHA), never from argv. Every
// comparison is against the merge base of that commit and HEAD, as `base...HEAD` does.
// Final lines, then exit 1 on anything but clean:
//
//   verify-map: rubric changed (<files>)
//   verify-map: main's flows fail (<flows>)
//   verify-map: clean
//   verify-map: error (<message>)       -- could not compare at all; never reads clean
//
// It MODIFIES the working tree (that is how it runs the base's rubric), so it refuses
// to start on a dirty tree. Run it in CI or in a throwaway worktree, not in a checkout
// with work in it.
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RUBRIC_PATHS = [
  'tests/e2e',
  'scripts/verify.cjs',
  'scripts/verify-map.cjs',
  'scripts/verify-refresh-fixtures.cjs',
];
const SCRIPT_KEYS = ['verify', 'verify:refresh-fixtures'];
const CONFIG_RE = /(^|\/)playwright\.config\.[^/]+$/;

// --literal-pathspecs: every path below is a literal file or directory name, never a
// pattern, even if a committed config name happens to contain a glob character.
function git(args, cwd) {
  return execFileSync('git', ['--literal-pathspecs', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function existsAt(sha, rel, cwd) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}:${rel}`], { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function configsAt(sha, cwd) {
  return git(['ls-tree', '-r', '-z', '--name-only', sha], cwd)
    .split('\0').filter(p => p && CONFIG_RE.test(p));
}

function scriptsAt(sha, cwd) {
  if (!existsAt(sha, 'package.json', cwd)) return {};
  const pkg = JSON.parse(git(['show', `${sha}:package.json`], cwd));
  return pkg && typeof pkg.scripts === 'object' && pkg.scripts !== null ? pkg.scripts : {};
}

function mergeBaseOf(baseSha, headSha, cwd) {
  return git(['merge-base', baseSha, headSha], cwd).trim();
}

// The rubric paths to compare: the fixed ones plus every playwright.config.* at either end.
function rubricPaths(mergeBase, headSha, cwd) {
  const configs = new Set([...configsAt(mergeBase, cwd), ...configsAt(headSha, cwd)]);
  return [...RUBRIC_PATHS, ...[...configs].sort()];
}

function listRubricChanges(baseSha, headSha, cwd) {
  const result = { modified: [], deleted: [], addedConfigs: [], scriptKeys: [] };
  const mergeBase = mergeBaseOf(baseSha, headSha, cwd);
  // The bootstrap PR adds the config with nothing at base: an added config only counts
  // once the base already has a rubric.
  const baseHasRubric = existsAt(mergeBase, 'playwright.config.js', cwd)
    || existsAt(mergeBase, 'tests/e2e', cwd);

  const out = git(['diff', '--name-status', '--no-renames', '-z', `${baseSha}...${headSha}`, '--',
    ...rubricPaths(mergeBase, headSha, cwd)], cwd);
  const fields = out.split('\0');
  if (fields[fields.length - 1] === '') fields.pop();
  if (fields.length % 2 !== 0) throw new Error(`unparseable git diff output (${fields.length} fields)`);
  for (let i = 0; i < fields.length; i += 2) {
    const [status, file] = [fields[i], fields[i + 1]];
    if (status === 'M' || status === 'T') result.modified.push(file);
    else if (status === 'D') result.deleted.push(file);
    else if (status === 'A') {
      if (CONFIG_RE.test(file) && baseHasRubric) result.addedConfigs.push(file);
    } else {
      throw new Error(`unexpected git diff status '${status}' for ${file}`);
    }
  }

  // Keys added at head never count, which covers the bootstrap PR.
  const baseScripts = scriptsAt(mergeBase, cwd);
  const headScripts = scriptsAt(headSha, cwd);
  for (const key of SCRIPT_KEYS) {
    if (!Object.hasOwn(baseScripts, key)) continue;
    if (!Object.hasOwn(headScripts, key) || headScripts[key] !== baseScripts[key]) {
      result.scriptKeys.push(`package.json#scripts.${key}`);
    }
  }
  return result;
}

// File names come from the PR. Control characters are shown escaped, so a crafted name
// cannot start a new output line, and so cannot start a workflow command.
function show(s) {
  return [...String(s)].map(c => {
    const code = c.charCodeAt(0);
    return code < 0x20 || code === 0x7f ? `\\x${code.toString(16).padStart(2, '0')}` : c;
  }).join('');
}

// Workflow-command data escaping for `::error::`.
function annotation(s) {
  return String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function report(lines, red) {
  for (const line of lines) console.log(line);
  if (red) for (const line of lines) console.log(`::error title=verify-map::${annotation(line)}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## verify-map\n\n${lines.join('\n\n')}\n`);
  }
}

// Runs the wrapper, passing its output straight through, and returns its exit code and
// the last `verify: ` summary line it printed.
function runVerify() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join('scripts', 'verify.cjs')], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let text = '';
    child.stdout.on('data', chunk => {
      process.stdout.write(chunk);
      text += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', code => {
      const summaries = text.split(/\r?\n/).filter(l => /^verify: /.test(l));
      resolve({ code, line: summaries.length ? summaries[summaries.length - 1] : null });
    });
  });
}

async function main() {
  const base = process.env.VERIFY_MAP_BASE;
  if (!base || !/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(base)) {
    throw new Error(`VERIFY_MAP_BASE must be a full commit SHA, got '${show(base ?? '')}'`);
  }
  const baseSha = git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`], ROOT).trim();
  const headSha = git(['rev-parse', '--verify', 'HEAD'], ROOT).trim();
  if (git(['status', '--porcelain'], ROOT).trim() !== '') {
    throw new Error('the working tree is not clean; verify-map checks out base files over it');
  }

  const changes = listRubricChanges(baseSha, headSha, ROOT);
  const mergeBase = mergeBaseOf(baseSha, headSha, ROOT);
  console.log(`verify-map: base ${baseSha}, merge base ${mergeBase}, head ${headSha}`);
  for (const [kind, list] of Object.entries(changes)) {
    for (const item of list) console.log(`verify-map: ${kind}: ${show(item)}`);
  }

  // The base's copy of every rubric path that exists at the base. Paths absent at the
  // base (the bootstrap PR) are skipped and run as the PR has them. A directory checkout
  // keeps files the PR added under it: "main's rubric plus any files the PR adds".
  const fromBase = rubricPaths(mergeBase, headSha, ROOT).filter(p => existsAt(mergeBase, p, ROOT));
  if (fromBase.length > 0) git(['checkout', mergeBase, '--', ...fromBase], ROOT);
  for (const file of changes.addedConfigs) fs.rmSync(path.join(ROOT, file), { force: true });
  console.log(`verify-map: running the base rubric (${fromBase.map(show).join(', ') || 'none at base'})`);

  const run = await runVerify();
  const passed = run.code === 0 && run.line === 'verify: pass';
  const failMatch = run.line && /^verify: fail \((.*)\)$/.exec(run.line);
  const flows = failMatch ? failMatch[1] : 'setup';

  const files = [...changes.modified, ...changes.deleted, ...changes.addedConfigs, ...changes.scriptKeys];
  const lines = [];
  if (files.length > 0) lines.push(`verify-map: rubric changed (${files.map(show).join(', ')})`);
  if (!passed) lines.push(`verify-map: main's flows fail (${show(flows)})`);
  const red = lines.length > 0;
  if (!red) lines.push('verify-map: clean');
  report(lines, red);
  process.exitCode = red ? 1 : 0;
}

if (require.main === module) {
  main().catch(err => {
    report([`verify-map: error (${show(err && err.message ? err.message : err)})`], true);
    process.exitCode = 1;
  });
}

module.exports = { listRubricChanges };
