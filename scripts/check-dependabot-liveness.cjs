#!/usr/bin/env node
// Report-only liveness check for Dependabot version updates.
//
// Why this exists: PR silence cannot tell an IDLE ecosystem (nothing to bump) from a
// STALLED one (the update job failing, or no longer being scheduled at all). In
// 2026-07 an ecosystem was declared "frozen" on the strength of "no new PRs". The
// real signal is Dependabot's own update-job runs, which the Actions API exposes as
// the dynamic "Dependabot Updates" workflow (path dynamic/dependabot/dependabot-updates).
//
// How runs identify their entry. Every field that could carry it was checked against
// this repo's real runs: `event` is always "dynamic", `path` and `head_branch` are the
// same for every run, and `pull_requests` is empty. Only the run NAME differs:
//
//   "<run-ecosystem> in <dir> - Update #<job>"           full version-update job
//   "<run-ecosystem> in <dir> for <deps> - Update #<job>" targeted job: refreshes or
//                                                         rebases one PR / group, or a
//                                                         security update
//
// Only FULL jobs count as liveness. A targeted job can succeed every week while the
// scheduled full job fails, so counting it would mask exactly the stall this check is
// for. The run ecosystem is Dependabot's internal package-manager name (npm ->
// npm_and_yarn, github-actions -> github_actions) and the dir is written "/." for
// the root on full jobs and "/" on targeted ones, hence normDir().
//
// Fail-closed by construction. A config entry is OK only if a matching full run
// SUCCEEDED within its threshold. A name format Dependabot changes, an ecosystem whose
// run name is mapped wrongly, a directory spelled differently -- each yields "no
// matching runs", which FAILS rather than passing.
//
// Report-only: it reads, prints, and exits non-zero. The failed scheduled run's
// notification is the alert. No issue creation, no auto-fix, no write token.
//
// Zero-dependency on purpose, like the other check-*.cjs gates: the YAML reader below
// understands exactly the subset .github/dependabot.yml uses and THROWS on anything
// else, so a reformat it cannot read fails loudly instead of checking fewer entries.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const CONFIG_REL = '.github/dependabot.yml';
const DYNAMIC_WORKFLOW_PATH = 'dynamic/dependabot/dependabot-updates';
const DAY_MS = 24 * 60 * 60 * 1000;

// Max age, in days, of the last successful full run before an entry is flagged.
//
// weekly = 9. A weekly job's successes are ~7 days apart; this repo's real runs show
// up to 7d 7h between successes when Dependabot starts a run late (2026-10-05 04:16Z ->
// 10-12 11:37Z). 9 days keeps ~1.7 days of headroom over that, so a manual dispatch on
// any day of the week stays green while healthy. The scheduled check runs Thursday
// 17:17 UTC (see the workflow): healthy entries are then ~3-3.5 days old, and ONE
// missed Monday makes them ~10-10.5 days old -- over 9 with a day to spare, so a single
// missed week is flagged at the first scheduled check after it. 8 would leave a
// dispatch on a late Monday barely green; 10 would let a missed week of the 16:00Z npm
// job slip to the following Thursday.
// daily = 2 (one missed day plus jitter). monthly = 33 (longest month plus 2 days).
// Anything else (cron, quarterly, ...) is unsupported and throws: guessing a threshold
// for it would be a silent pass in waiting.
const THRESHOLD_DAYS = { daily: 2, weekly: 9, monthly: 33 };

// dependabot.yml ecosystem -> the name its update runs use. Unlisted ecosystems fall
// back to '-' -> '_'. If that guess is wrong, nothing matches and the entry FAILS
// (MISSING), so the fallback cannot cause a false pass -- only a loud false alarm.
const RUN_ECOSYSTEM = {
  npm: 'npm_and_yarn',
  'github-actions': 'github_actions',
  gomod: 'go_modules',
  gitsubmodule: 'submodules',
  mix: 'hex',
  'docker-compose': 'docker_compose',
};

class ConfigShapeError extends Error {}

function runEcosystemName(configEcosystem) {
  return RUN_ECOSYSTEM[configEcosystem] || configEcosystem.replace(/-/g, '_');
}

// "/." -> "/", "/" -> "/", "app/" -> "/app", "/app/." -> "/app".
function normDir(dir) {
  let d = String(dir).trim();
  if (!d.startsWith('/')) d = `/${d}`;
  d = d.replace(/\/\.$/, '/');
  if (d.length > 1) d = d.replace(/\/+$/, '');
  return d || '/';
}

function unquote(v) {
  const s = v.trim();
  if (/^".*"$/.test(s) || /^'.*'$/.test(s)) return s.slice(1, -1);
  return s;
}

// Reads `updates:` entries: package-ecosystem, directory | directories, schedule.interval.
// Everything else in an entry (groups, limits, ignore, ...) is skipped by indentation.
function parseDependabotConfig(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const entries = [];
  let inUpdates = false;
  let cur = null;
  let itemIndent = -1;
  let inSchedule = false;
  let scheduleIndent = -1;
  let inDirectories = false;
  let directoriesIndent = -1;

  const finish = () => {
    if (!cur) return;
    if (!cur.ecosystem) throw new ConfigShapeError(`updates entry at line ${cur.line} has no package-ecosystem`);
    if (cur.dirs.length === 0) throw new ConfigShapeError(`updates entry at line ${cur.line} (${cur.ecosystem}) has no directory`);
    if (!cur.interval) throw new ConfigShapeError(`updates entry at line ${cur.line} (${cur.ecosystem}) has no schedule.interval`);
    if (!(cur.interval in THRESHOLD_DAYS)) {
      throw new ConfigShapeError(`updates entry at line ${cur.line} (${cur.ecosystem}): unsupported schedule.interval "${cur.interval}"`);
    }
    for (const dir of cur.dirs) {
      if (/[*?[\]{}]/.test(dir)) {
        throw new ConfigShapeError(`updates entry at line ${cur.line} (${cur.ecosystem}): glob directory "${dir}" cannot be mapped to runs`);
      }
      entries.push({ ecosystem: cur.ecosystem, directory: dir, interval: cur.interval });
    }
    cur = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\s+#.*$/, '').replace(/^\s*#.*$/, '');
    if (!line.trim()) continue;
    const indent = line.match(/^ */)[0].length;
    const body = line.trim();

    if (indent === 0) {
      finish();
      inUpdates = body === 'updates:';
      if (/^updates:\s*\S/.test(body)) throw new ConfigShapeError(`line ${i + 1}: flow-style updates is not supported`);
      continue;
    }
    if (!inUpdates) continue;

    if (body.startsWith('- ') && (itemIndent === -1 || indent === itemIndent)) {
      finish();
      itemIndent = indent;
      cur = { ecosystem: null, dirs: [], interval: null, line: i + 1 };
      inSchedule = inDirectories = false;
      // The first key sits on the dash line; treat it as a key at indent+2.
      handleKey(body.slice(2), indent + 2, i);
      continue;
    }
    if (!cur) throw new ConfigShapeError(`line ${i + 1}: content under updates: before the first "- " entry`);
    if (indent <= itemIndent) throw new ConfigShapeError(`line ${i + 1}: unexpected dedent inside updates`);
    handleKey(body, indent, i);
  }
  finish();
  if (entries.length === 0) throw new ConfigShapeError('no updates entries found');
  return entries;

  function handleKey(body, indent, i) {
    if (inDirectories) {
      // YAML allows the items at the key's own indent or deeper.
      if (indent >= directoriesIndent && body.startsWith('- ')) {
        cur.dirs.push(unquote(body.slice(2)));
        return;
      }
      inDirectories = false;
    }
    if (inSchedule) {
      if (indent > scheduleIndent) {
        const m = body.match(/^interval:\s*(.+)$/);
        if (m) cur.interval = unquote(m[1]);
        return;
      }
      inSchedule = false;
    }
    const m = body.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) {
      // Nested list items / values of keys this check ignores (groups, ignore, ...).
      return;
    }
    const [, key, value] = m;
    // Only keys at the entry's own level are interpreted; deeper ones belong to a
    // nested block (groups.<name>.patterns, ...).
    const entryLevel = itemIndent + 2;
    if (indent !== entryLevel) return;
    if (key === 'package-ecosystem') {
      cur.ecosystem = unquote(value);
    } else if (key === 'directory') {
      if (!value) throw new ConfigShapeError(`line ${i + 1}: empty directory`);
      cur.dirs.push(unquote(value));
    } else if (key === 'directories') {
      if (value) throw new ConfigShapeError(`line ${i + 1}: flow-style directories is not supported`);
      inDirectories = true;
      directoriesIndent = indent;
    } else if (key === 'schedule') {
      if (value) throw new ConfigShapeError(`line ${i + 1}: flow-style schedule is not supported`);
      inSchedule = true;
      scheduleIndent = indent;
    }
  }
}

const RUN_NAME_RE = /^([a-z0-9_]+) in (\S+?)(?: for (.+))? - Update #(\d+)$/;

// -> { ecosystem, directory, full } or null for a name this format does not describe.
function parseRunName(name) {
  const m = RUN_NAME_RE.exec(String(name || ''));
  if (!m) return null;
  return { ecosystem: m[1], directory: normDir(m[2]), full: m[3] === undefined };
}

// entries: from parseDependabotConfig. runs: Actions API workflow_run objects.
// Returns { ok, results: [{ ecosystem, directory, interval, thresholdDays, status,
//   lastSuccessAt, ageDays, lastRun, fullRunCount }] }.
// status: OK | STALE (last success too old) | FAILING (full runs seen, none
// succeeded) | MISSING (no full runs at all for this entry).
function evaluate({ entries, runs, now = Date.now() }) {
  const parsed = runs.map(r => ({ run: r, id: parseRunName(r.name) })).filter(x => x.id && x.id.full);
  const results = entries.map(entry => {
    const want = runEcosystemName(entry.ecosystem);
    const dir = normDir(entry.directory);
    const thresholdDays = THRESHOLD_DAYS[entry.interval];
    const mine = parsed
      .filter(x => x.id.ecosystem === want && x.id.directory === dir)
      .map(x => x.run)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const success = mine.find(r => r.status === 'completed' && r.conclusion === 'success');
    const lastRun = mine[0] || null;
    const lastSuccessAt = success ? success.created_at : null;
    const ageDays = success ? (now - Date.parse(success.created_at)) / DAY_MS : null;
    let status;
    if (mine.length === 0) status = 'MISSING';
    else if (!success) status = 'FAILING';
    else if (!(ageDays <= thresholdDays)) status = 'STALE';
    else status = 'OK';
    return {
      ecosystem: entry.ecosystem,
      directory: entry.directory,
      interval: entry.interval,
      thresholdDays,
      status,
      lastSuccessAt,
      ageDays,
      lastRun: lastRun && {
        name: lastRun.name,
        created_at: lastRun.created_at,
        conclusion: lastRun.conclusion || lastRun.status,
        html_url: lastRun.html_url,
      },
      fullRunCount: mine.length,
    };
  });
  // Zero entries is never a pass: a check that checked nothing proves nothing.
  return { ok: results.length > 0 && results.every(r => r.status === 'OK'), results };
}

function formatReport({ ok, results }, { lookbackDays } = {}) {
  const rows = results.map(r => {
    const age = r.ageDays == null ? '-' : `${r.ageDays.toFixed(1)}d`;
    const last = r.lastRun ? `${r.lastRun.created_at} ${r.lastRun.conclusion}` : '-';
    return `| ${r.status} | ${r.ecosystem} | ${r.directory} | ${r.interval} (<=${r.thresholdDays}d) | ${r.lastSuccessAt || '-'} | ${age} | ${last} |`;
  });
  const lines = [
    '| Status | Ecosystem | Directory | Interval (threshold) | Last successful full run | Age | Latest full run |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
    ok
      ? 'All configured Dependabot entries have a recent successful update run.'
      : 'One or more Dependabot entries have NO successful update run within threshold.',
  ];
  if (lookbackDays) lines.push(`(Run history read back ${lookbackDays} days; "-" means none in that window.)`);
  return lines.join('\n');
}

// ── Live API (only main() touches the network) ───────────────────────────────

async function gh(url, token) {
  const res = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'dependabot-liveness-check',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function fetchRuns({ repo, token, sinceMs, api = 'https://api.github.com' }) {
  const wf = await gh(`${api}/repos/${repo}/actions/workflows?per_page=100`, token);
  const dyn = (wf.workflows || []).find(w => w.path === DYNAMIC_WORKFLOW_PATH);
  // No Dependabot Updates workflow at all: return no runs, so every entry is MISSING
  // and the check fails -- the strongest stall there is.
  if (!dyn) return [];
  const runs = [];
  for (let page = 1; page <= 10; page++) {
    const j = await gh(`${api}/repos/${repo}/actions/workflows/${dyn.id}/runs?per_page=100&page=${page}`, token);
    const batch = j.workflow_runs || [];
    runs.push(...batch);
    if (batch.length < 100) break;
    const oldest = batch[batch.length - 1];
    if (Date.parse(oldest.created_at) < sinceMs) break;
  }
  return runs;
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('GITHUB_REPOSITORY is not set (owner/name)');
  const entries = parseDependabotConfig(fs.readFileSync(path.join(REPO_ROOT, CONFIG_REL), 'utf8'));
  const now = Date.now();
  // Read back well past the largest threshold so a STALE entry can still show when it
  // last succeeded. Entries older than this read as FAILING/MISSING -- still a fail.
  const lookbackDays = 4 * Math.max(...entries.map(e => THRESHOLD_DAYS[e.interval]));
  const runs = await fetchRuns({ repo, token: process.env.GITHUB_TOKEN, sinceMs: now - lookbackDays * DAY_MS });
  const verdict = evaluate({ entries, runs, now });
  const report = formatReport(verdict, { lookbackDays });
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Dependabot liveness\n\n${report}\n`);
  }
  for (const r of verdict.results.filter(x => x.status !== 'OK')) {
    console.log(`::error title=Dependabot ${r.status}::${r.ecosystem} in ${r.directory}: no successful update run within ${r.thresholdDays} days`);
  }
  return verdict.ok ? 0 : 1;
}

if (require.main === module) {
  main().then(
    code => process.exit(code),
    err => {
      console.error(`::error title=Dependabot liveness check broken::${err.message}`);
      process.exit(2);
    },
  );
}

module.exports = {
  THRESHOLD_DAYS,
  ConfigShapeError,
  runEcosystemName,
  normDir,
  parseDependabotConfig,
  parseRunName,
  evaluate,
  formatReport,
  fetchRuns,
};
