export const meta = {
  name: 'full-repo-review',
  description: 'Full codebase review: correctness bugs, security issues, simplification — adversarial verification on high-severity findings',
  phases: [
    { title: 'Review', detail: 'Fan out review agents per module group' },
    { title: 'Verify', detail: '3-vote adversarial panel on critical/high findings' },
    { title: 'Synthesize', detail: 'Group findings by severity and return structured report' },
  ],
};

// Repo-relative: agents run from the repo root, so no absolute path is needed
// (and this file is public — see CLAUDE.md on not committing local paths).
const PROJECT_ROOT = '.';

const GROUPS = [
  {
    key: 'app-root',
    label: 'App Root (App.jsx / config.js / theme.js)',
    files: [
      'src/App.jsx',
      'src/config.js',
      'src/theme.js',
    ],
  },
  {
    key: 'hooks-data',
    label: 'Data-Fetching Hooks (BTC / chain / miners / RSS / weather / alerts / history)',
    files: [
      'src/hooks/useBTC.js',
      'src/hooks/useChain.js',
      'src/hooks/useBitaxe.js',
      'src/hooks/useRSS.js',
      'src/hooks/useWeather.js',
      'src/hooks/useAlerts.js',
      'src/hooks/useHistory.js',
    ],
  },
  {
    key: 'hooks-support',
    label: 'Support Hooks (clock / feedHealth / pageRefresh / interval / viewport)',
    files: [
      'src/hooks/useClock.js',
      'src/hooks/useFeedHealth.js',
      'src/hooks/usePageRefresh.js',
      'src/hooks/useResettableInterval.js',
      'src/hooks/useViewportMode.js',
    ],
  },
  {
    key: 'utils',
    label: 'Utilities (api / formatting / alertThresholds / autoTheme / freshness / ipValidation / v2prefs)',
    files: [
      'src/utils/api.js',
      'src/utils/formatting.js',
      'src/utils/alertThresholds.js',
      'src/utils/autoTheme.js',
      'src/utils/freshness.js',
      'src/utils/ipValidation.js',
      'src/utils/log.js',
      'src/utils/scale.js',
      'src/utils/svg.js',
      'src/utils/v2prefs.js',
    ],
  },
  {
    key: 'components-desktop',
    label: 'Desktop Components (CommandCenter / columns / price / charts / miners / sidebar / weather)',
    files: [
      'src/components/CommandCenter.jsx',
      'src/components/Masthead.jsx',
      'src/components/DesktopTicker.jsx',
      'src/components/Sidebar.jsx',
      'src/components/MarketsColumn.jsx',
      'src/components/NewsColumn.jsx',
      'src/components/LineChart.jsx',
      'src/components/ChainColumn.jsx',
      'src/components/Miners.jsx',
      'src/components/MinerRow.jsx',
      'src/components/FleetSummary.jsx',
      'src/components/Weather.jsx',
      'src/components/WxGlyph.jsx',
      'src/components/OnThisDay.jsx',
      'src/components/NetworkStatusWidget.jsx',
      'src/components/Kicker.jsx',
      'src/components/LeadImage.jsx',
      'src/components/Num.jsx',
      'src/components/StatusDot.jsx',
      'src/components/Rule.jsx',
      'src/components/ProofOfRead.jsx',
    ],
  },
  {
    key: 'components-mobile',
    label: 'Mobile Components (MobileApp / panels / header / tabbar / StatusTile)',
    files: [
      'src/components/mobile/MobileApp.jsx',
      'src/components/mobile/MobileHeader.jsx',
      'src/components/mobile/MobileTabBar.jsx',
      'src/components/mobile/BitcoinPanel.jsx',
      'src/components/mobile/HomePanel.jsx',
      'src/components/mobile/MinersPanel.jsx',
      'src/components/mobile/NewsPanel.jsx',
      'src/components/mobile/StatusTile.jsx',
    ],
  },
  {
    key: 'components-settings',
    label: 'Settings & Error Boundary (SettingsPanel / sections / ErrorBoundary)',
    files: [
      'src/components/SettingsPanel.jsx',
      'src/components/ErrorBoundary.jsx',
      'src/components/settings/AlertsSection.jsx',
      'src/components/settings/FeedsThemeSection.jsx',
      'src/components/settings/IntervalsDataSection.jsx',
      'src/components/settings/MinersSection.jsx',
      'src/components/settings/PreferencesSection.jsx',
      'src/components/settings/helpers.jsx',
    ],
  },
  {
    key: 'build-backend',
    label: 'Build & Backend (build.js / server.js / bitaxe_api.py / history_daemon.py)',
    files: [
      'build.js',
      'server.js',
      'bitaxe_api.py',
      'history_daemon.py',
    ],
  },
  {
    key: 'tests',
    label: 'Test Suite (utils / hooks / components)',
    files: [
      'tests/unit/alertThresholds.test.js',
      'tests/unit/autoTheme.test.js',
      'tests/unit/formatting.test.js',
      'tests/unit/freshness.test.js',
      'tests/unit/ipValidation.test.js',
      'tests/unit/log.test.js',
      'tests/unit/scale.test.js',
      'tests/unit/svg.test.js',
      'tests/unit/v2prefs.test.js',
      'tests/unit/useBitaxe.test.js',
      'tests/unit/useBTC.test.js',
      'tests/unit/useChain.test.js',
      'tests/unit/useFeedHealth.test.js',
      'tests/unit/useHistory.test.js',
      'tests/unit/useRSS.test.js',
      'tests/unit/useViewportMode.test.js',
      'tests/unit/useWeather.test.js',
      'tests/unit/ErrorBoundary.test.jsx',
      'tests/unit/SettingsPanel.test.jsx',
      'tests/unit/mobile/BitcoinPanel.test.jsx',
      'tests/unit/mobile/HomePanel.test.jsx',
      'tests/unit/mobile/MinersPanel.test.jsx',
      'tests/unit/mobile/MobileApp.test.jsx',
      'tests/unit/mobile/MobileTabBar.test.jsx',
      'tests/unit/mobile/NewsPanel.test.jsx',
    ],
  },
];

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'severity', 'category', 'description'],
        properties: {
          file:        { type: 'string' },
          line:        { type: 'string' },
          severity:    { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          category:    { type: 'string', enum: ['correctness', 'security', 'simplification'] },
          description: { type: 'string' },
          suggestion:  { type: 'string' },
        },
      },
    },
  },
};

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['refuted', 'reasoning'],
  properties: {
    refuted:   { type: 'boolean' },
    reasoning: { type: 'string' },
  },
};

// ── Phase 1: Review ────────────────────────────────────────────────────────────

phase('Review');
log(`Reviewing ${GROUPS.length} module groups — The Daily Node codebase`);

const reviewResults = await pipeline(
  GROUPS,
  async (group) => {
    const fileList = group.files
      .map(f => `  - ${PROJECT_ROOT}/${f}`)
      .join('\n');

    const result = await agent(
      `You are reviewing source files from The Daily Node — a single-page React dashboard for Bitcoin and mining monitoring.
The project is a static HTML file (built by esbuild from JSX source) that aggregates:
- Live Bitcoin price and chart from Kraken and CoinGecko
- Blockchain stats from mempool.space (fee rates, difficulty, blocks, CLR)
- BitAxe ASIC miner fleet status via a local Python API (useBitaxe hook → bitaxe_api.py)
- Weather from Open-Meteo (also drives automatic dark mode on sunset)
- RSS news feeds from three sources via RSS2JSON

Key implementation details:
- React + ReactDOM are vendored UMD builds (no CDN). JSX is compiled by esbuild at build time.
- Styling is 100% inline style props — no CSS files. All colors come from ThemeCtx via useT().
- The canvas scales to 1920×1080 via CSS transform; u(n) returns calc(var(--u) * n).
- User prefs persist in localStorage under 'dailynode-prefs' (v1) and per-key v2 keys via v2prefs.js.
- Hooks expose a health metadata shape alongside data (lastOk, err, loading, interval).
- There is a separate mobile component tree (src/components/mobile/) gated by a 900px breakpoint.

Review these files for:
1. **Correctness bugs** — wrong calculations, incorrect data flow, race conditions in hooks, stale closure bugs, incorrect null/undefined handling, mismatched API response shapes
2. **Security issues** — unvalidated external API data rendered as HTML (XSS), unsafe URL construction, IP/hostname injection via user prefs, localStorage data read without validation
3. **Simplification opportunities** — dead code, redundant logic, overly complex constructs that meaningfully obscure intent or introduce maintenance risk

Files to review (read each file completely before forming findings):
${fileList}

Instructions:
- Read every file listed before submitting findings.
- Return ONLY findings with severity critical, high, or medium — skip low-severity style issues.
- For each finding include the exact file path (relative to project root, e.g. src/hooks/useBTC.js), approximate line number or range, severity (critical/high/medium), category (correctness/security/simplification), a clear description of the problem, and a concrete fix suggestion.
- If a group of files has no meaningful findings above low severity, return an empty findings array.`,
      {
        label: `review:${group.key}`,
        phase: 'Review',
        schema: FINDINGS_SCHEMA,
        model: 'claude-fable-5',
      }
    );

    const count = result ? result.findings.length : 0;
    log(`  ${group.label}: ${count} finding(s)`);
    return result ? result.findings : [];
  }
);

const allFindings = reviewResults.filter(Boolean).flat();
log(`Review complete — ${allFindings.length} raw findings across ${GROUPS.length} groups`);

// ── Phase 2: Adversarial Verification (critical + high only) ───────────────────

const highSeverityFindings = allFindings.filter(
  f => f.severity === 'critical' || f.severity === 'high'
);
const otherFindings = allFindings.filter(
  f => f.severity !== 'critical' && f.severity !== 'high'
);

log(`Adversarially verifying ${highSeverityFindings.length} critical/high finding(s) with 3-vote panels...`);
phase('Verify');

const verifiedFindings = await pipeline(
  highSeverityFindings,
  async (finding) => {
    const votes = await parallel(
      [0, 1, 2].map(voteIndex => async () =>
        agent(
          `You are an adversarial code reviewer. Your job is to REFUTE the finding below if you legitimately can.

Read the source file and look for evidence that the finding is:
- A false positive (the code actually handles this correctly)
- Already mitigated elsewhere in the codebase
- Based on a misreading of the code

Default to refuted=true only if you find concrete evidence the finding is wrong.
If you cannot find the file or cannot determine either way, set refuted=false (give the finding the benefit of the doubt).

Finding to evaluate:
  File:        ${finding.file}
  Line:        ${finding.line || 'unspecified'}
  Severity:    ${finding.severity}
  Category:    ${finding.category}
  Description: ${finding.description}
  Suggestion:  ${finding.suggestion || 'N/A'}

Read the file at: ${PROJECT_ROOT}/${finding.file}
Then return your verdict with clear reasoning.`,
          {
            label: `verify:${finding.file}:v${voteIndex}`,
            phase: 'Verify',
            schema: VERDICT_SCHEMA,
            model: 'claude-fable-5',
          }
        )
      )
    );

    const validVotes = votes.filter(Boolean);
    const refuteCount = validVotes.filter(v => v.refuted).length;
    // Survives adversarial review if fewer than 2 of 3 skeptics refute it
    const confirmed = refuteCount < 2;

    return {
      ...finding,
      confirmed,
      adversarial: {
        refuteCount,
        totalVotes: validVotes.length,
        reasoning: validVotes.map(v => v.reasoning),
      },
    };
  }
);

const confirmedHighSeverity = verifiedFindings.filter(f => f.confirmed);
const refutedFindings      = verifiedFindings.filter(f => !f.confirmed);

log(`Verification complete — ${confirmedHighSeverity.length}/${highSeverityFindings.length} confirmed, ${refutedFindings.length} refuted`);

// ── Phase 3: Synthesize ────────────────────────────────────────────────────────

phase('Synthesize');

const criticalFindings = confirmedHighSeverity.filter(f => f.severity === 'critical');
const highFindings     = confirmedHighSeverity.filter(f => f.severity === 'high');
const mediumFindings   = otherFindings.filter(f => f.severity === 'medium');

log(`Report: ${criticalFindings.length} critical | ${highFindings.length} high | ${mediumFindings.length} medium | ${refutedFindings.length} refuted`);

return {
  summary: {
    groupsReviewed:         GROUPS.length,
    totalRawFindings:       allFindings.length,
    highSeveritySubmitted:  highSeverityFindings.length,
    highSeverityConfirmed:  confirmedHighSeverity.length,
    highSeverityRefuted:    refutedFindings.length,
  },
  findings: {
    critical: criticalFindings,
    high:     highFindings,
    medium:   mediumFindings,
    refuted:  refutedFindings,
  },
};
