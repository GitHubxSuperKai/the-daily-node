# Changelog

All notable changes to The Daily Node are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The secrets pre-commit hook is now tracked at `.githooks/pre-commit` instead of living untracked in `.git/hooks/`, so a fresh clone can actually get it. Enable per clone with `git config core.hooksPath .githooks` — documented as a required step in `docs/SETUP.md` and in the `CONTRIBUTING.md` PR checklist. `.gitattributes` pins LF for `.githooks/**` so the shebang survives checkout on Linux/macOS.
- The smoke suite now asserts the hook exists, keeps its shebang, stays CRLF-free, and still invokes `check:secrets` — the first CI-enforced check on this file.

### Security

- Documented three previously unstated limits of `check:secrets`, each verified by probe. The scan skipped `docs/` and `tests/` — and `CLAUDE.md` names `docs/superpowers/` as this repo's historical leak vector. It matches only literal RFC1918 addresses, so `127.0.0.1`, CGNAT `100.64.x`, hostnames, usernames, absolute local paths, and key material all pass. And it reads the working-copy content of each staged file rather than the staged blob, so a secret staged and then edited out without re-staging commits unscanned. None of these were new behavior; none were written down before. The first of the three is now fixed — see below; the other two still stand.
- `check:secrets` now scans `docs/` and `tests/`, closing the first of those three gaps. The skips could not simply be deleted: removing them brings 52 tracked files into the scan for the first time, 12 of which already contained banned patterns — 64 matches in total, 61 addresses and 3 coordinates — and `secrets` is a required check, so a naive removal turns `main` red and blocks every merge. They could not be scrubbed either — `tests/unit/ipValidation.test.js` asserts that an RFC1918 address is a LAN IP and that a public one is not, so those literals are that test's subject matter, and neither a `<lan-host>` placeholder nor an RFC5737 TEST-NET address preserves the assertion. Instead a list of 13 reserved fixture values is exempted, by whole-match comparison, and only under `tests/` and root-level `test_*.py`. `docs/` gets no exemption at all: the single tracked doc that needed one was prose and was scrubbed to a placeholder. In `src/` those same literals fail exactly as before, and a value one digit off a reserved one fails everywhere. The separate `test_*.py` skip is gone too, so all 6 Python test files are scanned for the first time.
- `scripts/smoke-build.cjs` step 15 guards the carve-out against being widened rather than merely deleted — it fails the build if `docs/`/`tests/` return to `SKIP`, if `FIXTURE_PATH` gains an un-anchored or `docs/` alternative, if the carve-out stops being gated on `FIXTURE_PATH`, or if the reserved list grows past 15 entries.
- `tests/unit/checkSecrets.test.js` verifies the scanner by behaviour rather than by shape. Step 15 is a structural guard — it regex-matches the source text of `SKIP`, `FIXTURE_PATH` and `RESERVED` — so it stays green against a gate that still looks right and no longer does anything: `exempt = FIXTURE_PATH.test(f) || true`, `offenders = exempt ? [] : hits`, `isReserved = () => true`, or the gate call wrapped in a block comment, which step 15's `//`-only comment strip does not see. Each of the 21 cases stages fixtures into a throwaway git repo, runs the CLI, and asserts on exit code and on which pattern fired; one of them scans every file in this repo and derives the expected count from the tree rather than hardcoding it, and one stages the test file itself under `src/` — off the fixture surface, where no reserved value is exempt — so its own "nothing the scanner matches is spelled out here" claim is executed rather than merely asserted. It is a vitest test specifically because CI runs `npm run test:unit` and enumerates its other steps individually — it never runs `npm test`, so a check wired only into that chain gets no CI coverage. All four hollow-out mutations verified red against a green control, with step 15 green for all four.
- `check:secrets` now runs in CI, as the `secrets` job in `.github/workflows/build.yml`. It stages the diff under review (`git reset --soft <base>`) before scanning, because the scan reads the staged set and a normal CI checkout has nothing staged — a bare step would report "checked 0 staged files" and pass unconditionally. Verified failure-capable against a planted RFC1918 address, and verified green on a clean diff. Because CI stages from a clean checkout, the working-copy gap above does not apply there.
- CI does **not** close the two remaining gaps: it runs the same scanner, so the reserved-fixture carve-out and the RFC1918-only pattern apply to the CI run exactly as they do locally.
- `setup.html` is no longer skipped by `check:secrets`. It sat in `SKIP` under a comment describing that list as build artifacts, but it is hand-written and hand-committed — nothing in `build.js` or `package.json` produces it, it has no counterpart under `src/`, and it carries its own feature commits — so it was the last tracked file that nothing scanned. Its two example addresses were benign UI placeholder text rather than real infrastructure, but nothing would have caught a real one added beside them. They are now generic placeholder text and not RFC5737 TEST-NET addresses: the setup form validates typed input against `isValidLanIp`, which rejects anything outside RFC1918 and `127.x`, so a `192.0.2.x` example would have been an address the form itself refuses. `SKIP_ALLOWED` in smoke step 15 was updated to match.
- The `index.html` entry in the `check:secrets` skip list is now anchored to `/^index\.html$/`. Unanchored it also matched `src/index.html` — the hand-written page template `build.js` reads, genuine source rather than a build artifact, and unscanned for as long as the entry was unanchored. The built root `index.html` is still skipped, and `src/index.html` scans clean.
- `setup.html` is now analysed by CodeQL. It sat in `paths-ignore` under the same wrong premise the `check:secrets` skip did — the v1.4.0 entry above describes that list as excluding "the generated build artifact," but `build.js` writes only the root `index.html` and nothing emits `setup.html`. So the last tool that was not looking at it now is: its inline JavaScript — an inlined copy of `isValidLanIp`, two `fetch('/api/setup')` calls with JSON POST bodies, an Open-Meteo geocoder fetch, and DOM writes — had never been scanned. The first scan returned zero alerts, and that is a genuine clean bill rather than a suppressed one: every DOM write goes through `textContent`/`createTextNode`, there is no `innerHTML`, `insertAdjacentHTML`, `document.write`, or `eval`, and both navigations are the constant `'/'`.
- The remaining `index.html` entry in `paths-ignore` stays, because that one really is the artifact `build.js` writes. CodeQL path patterns are root-relative paths rather than basenames, so it skips only the minified bundle — confirmed from the analysis logs, which show `src/index.html`, `setup.html`, `pitch-deck.html`, and `docs/pages-index-redirect.html` extracted and the root `index.html` not. A header comment on the config records both facts so the entry is not re-added by mistake.
- `check:secrets` now fails closed when it cannot read a staged file. The read was wrapped in a bare catch-and-continue, so a run that read nothing at all printed the same "checked N staged files, no banned patterns" line and the same exit 0 that a clean full-repo scan prints — a broken run and a green run were indistinguishable. Git emits repo-root-relative paths, so running the scanner from any other working directory made every single read throw: reproduced from `src/`, where `node ../scripts/check-secrets.cjs` reported 150 files checked and clean with a private IP planted in `setup.html`. Unreadable files are now counted and named, and the success line is unreachable while any remain. This was never reachable through the two supported entry points — git runs hooks from the top level, npm runs scripts from the package root — so it is hardening rather than a fixed leak. Staged deletions are excluded up front with `--diff-filter=d` instead of being absorbed by the same silent skip: the working-copy file is genuinely gone, there is nothing to scan, and separating that one legitimate case is what lets every remaining read failure be treated as an error. Six cases in the behaviour suite pin the guarantee. The ones that expect a refusal assert that the success line is absent rather than only that the exit code is 1 — a scanner that crashes on startup also exits 1 — and the staged-deletion case asserts the opposite, that the run still passes and the deleted path is excluded from the count rather than counted and skipped. The staged-file listing is now NUL-delimited (`-z`) as part of the same fix: `git diff --cached --name-only` C-quotes any path holding non-ASCII bytes under `core.quotepath`, returning a name no filesystem has, so a file such as `docs/café.md` was never scanned — silently before this change, and would have blocked a commit and a required CI check after it. It is now read and scanned like any other file.

- `.github/codeql/codeql-config.yml` is now guarded, closing the direct sibling of the gap step 15 covers. Its `paths-ignore` list decides what CodeQL never looks at, and nothing in the repo asserted on it — `git grep -l codeql -- tests scripts .githooks` returned nothing — so re-adding a file, or widening an entry to `**/*.html`, dropped that code out of every scan while `npm test` and every CI job stayed green. `scripts/check-codeql-config.cjs` pins the list with `deepStrictEqual`, and pins the complete set of top-level keys the same way: `paths:` restricts analysis to a subset, `query-filters:` excludes rules, `packs:` swaps the query set, and enumerating those individually would be a denylist — which in this repo has already let through the mutation its author did not imagine. Any edit to a guarded value fails the build until the allowlist is edited too; that forced edit is the review gate. That was verified against a real, unplanned change rather than only synthetic ones: #141 landed on main while this branch was open and removed `setup.html` from the list, the guard failed the build with a message naming `PATHS_IGNORE_ALLOWED` as the thing to edit, and the allowlist was updated to match.
- The workflow half of the guard is an allowlist too, which took three review rounds to become true. `.github/workflows/codeql.yml` is checked for the `config-file:` wiring, the `security-extended,security-and-quality` suite, the language matrix and the `languages: ${{ matrix.language }}` binding that makes it mean anything, an exact ordered list of every action it runs, the matrix's own key set, and the complete ordered input set of each `codeql-action` step. Round one guarded it with a denylist — the one thing the brief forbade — so deleting the `Perform CodeQL Analysis` step, commenting it out, hardcoding `languages:` past the matrix, and repointing an action at a fork all passed. Round two pinned the actions and the binding, and the same shape reappeared one level down: `upload: never` on the analyze step (a real action input that suppresses the results upload — green job, no alerts, ever), `packs:` on init, and `exclude:` under `matrix:` (drops a language from the expansion while `language:` still lists it) all passed, as did an inserted step whose `uses:` carried a trailing comment, `if : false` with a space before the colon, and a decoy `run:` block that misdirected the non-global assertions onto text that was not the setting. Round three found the block reader added in round two was itself lenient — it silently dropped lines it could not parse and let a column-0 comment end a block — so quoting a key, ordinary YAML that GitHub Actions honours, walked straight past the round-two fixes. Every assertion now tolerates quoted keys and `key : value` spacing, and a line the reader cannot model comes back as a sentinel no allowlist matches, so it fails loudly the way the config parser already did.
- The guard parses the YAML rather than regex-matching the text, so a reformat cannot silently defeat it, and it is deliberately zero-dependency — a security guard should not take on third-party publish risk to do its job. The parser models only the block subset this config uses and throws on everything else (flow style, anchors, block scalars, nested mappings, tabs, document markers, duplicate keys, and any line it cannot classify), so a file it cannot read fails loudly instead of passing quietly. Benign reformats — zero-indent sequences, either quote style, CRLF or LF, reordered keys, comment lines, a trailing comment after a key, a UTF-8 BOM — still pass. The workflow assertions are anchored to the key at line start, which is what stops a commented-out line being read as present; an explicit comment-stripping helper was written for that job, found to change no verdict because no `#`-prefixed line can match an anchored key, and deleted rather than kept as a defence it did not provide.
- `tests/unit/checkCodeqlConfig.test.js` is the behaviour half, because a structural assertion cannot catch a hollowed-out gate and smoke step 16 runs the guard against exactly one input: the one it passes on. Its 79 cases execute the checker against mutated fixtures — 11 config mutations, 30 workflow mutations, 8 benign reformats and 6 anchoring/quoting controls as negative controls, 10 shapes the parser must refuse, 9 covering the real repo and reads from temp directories on disk, and 5 on the parser itself. Every mutation case first asserts the mutation actually changed something; the first run caught one that had silently no-op'd against a CRLF checkout and was asserting against a pristine config. Twenty hollow-outs of the guard are verified red against a green control, thirteen of them found by review rather than by the author across three rounds. Two lessons generalised beyond this file. First, a rejection case can go red for the wrong reason and hide a bug: quoting a key *and* changing its value fails whether or not the guard understands quoting, because the assertion simply finds nothing — the cases that actually pin quoted-key and comment handling are the ones asserting a correct-but-quoted workflow still PASSES. Second, pinning constants one at a time leaves the next one, so the suite asserts the property instead: the guard makes exactly one filesystem access in the whole file, inside the one function whose reads are themselves under test.
- Known limit, stated rather than implied: this is a structural guard on a config file. It proves the config still says what it should. It cannot prove CodeQL honoured it — that runs on GitHub's side, and no assertion here observes a real scan. `npm run check:codeql` runs it standalone; CI reaches it through the existing smoke and unit steps, which is deliberate, since `.github/workflows/build.yml` never runs `npm test`.

## [1.4.0] — 2026-08-26

### Added

- Mobile feature parity with the desktop dashboard — Epoch & Halving section and eco fee and blocks-to-clear vitals on the Bitcoin tab, fleet efficiency and solo-mining odds on the Miners tab, lead-story image and snippet on the News tab, and per-miner power, uptime, and share counts in the fleet rows.
- CI gate that fails the build when the committed `index.html` differs from a fresh rebuild, so a build-affecting dependency bump can no longer merge with a stale artifact.
- CI now runs the JS smoke, unit, and vendor-integrity checks in the build job, with a 250KB byte floor on the bundle.
- Declared `engines.node` (`^22.22.2 || ^24.15.0 || >=26.0.0`) to pin the range the toolchain actually requires. This raises the floor for building from source — Node 20 is no longer supported. The published `index.html` is unaffected; it has no runtime Node dependency.

### Changed

- Mobile Bitcoin tab information architecture — removed the duplicate Chain Vitals block and retargeted the progress indicator.
- All numeric displays standardized on the monospace face with tabular numerals.
- Miner uptime renders as a duration rather than a percentage of 24h.
- CodeQL scanning excludes the generated build artifact; ESLint excludes `.claude/**`; `index.html` is marked generated for language statistics.
- Dependencies: ESLint 9 → 10, `eslint-plugin-react-hooks` 5 → 7, globals 15 → 17, jsdom 29 → 30, esbuild 0.28.0 → 0.28.2, vitest 4.1.7 → 4.1.11, playwright 1.60 → 1.62, plus GitHub Actions and Docker action bumps.
- Documentation corrected against the actual build: `docs/SETUP.md` no longer describes the pre-esbuild concatenation pipeline, Babel, or a CDN dependency, and its Node version requirement now matches `engines`. The agent instructions' hook reference was corrected from `useLayoutSize` to `useViewportMode`.

### Fixed

- Feed health used hardcoded thresholds because `useBTC` and `useChain` did not return their intervals; they now do, so staleness is judged against the real refresh rate.
- `useResettableInterval` and `applyV2ToConfig` guard against `0`, negative, and `NaN` intervals from corrupted preferences — previously a `0ms` `setInterval` could spin the CPU.
- Dark theme persists across reloads, and the body background follows the theme.
- Hourly forecast slots are anchored to timestamps instead of wrapping on hour-of-day, fixing truncation around midnight.
- `NetworkStatusWidget` halving and reward values are gated on a `chain.data` null check; the mempool Clear badge no longer renders a stray border.
- The Masthead quote index is taken modulo the array length, so a changed quote list cannot index out of bounds.
- News components use `rss.leadStory` rather than `items[0]`; `OnThisDay` matches exactly.
- `HISTORY_BASE` derives from `window.location.hostname`, so the price-history daemon resolves for remote viewers.
- Python servers return CORS headers on error responses, not just success responses.
- VR temperature averages only over miners that actually report `vrTemp`, instead of counting non-reporting miners as zero.
- Removed dead `fetchRSSFeeds` from `src/utils/api.js`.

### Security

- Mempool proxy hardened against SSRF across several vectors: gated behind a server-side outbound allowlist, constrained to an endpoint path allowlist, refusing 3xx redirects, rejecting hostname-based URLs not in `ALLOWED_PROXY_HOSTS`, and blocking link-local, IPv4-mapped IPv6, and unspecified addresses. Closes CodeQL alerts #190 (`py/full-ssrf`) and #191 (`py/partial-ssrf`).
- RSS item links and image sources are sanitized through `safeUrl()`, blocking the `javascript:` scheme.
- Prototype-pollution guard applied at each traversal step in `setV2Path`.
- CRLF stripped from CORS origin headers.
- Bumped undici 7.25.0 → 7.28.0, clearing six Dependabot alerts (#94). Dev-scope transitive dependency (via jsdom, used by the test runner) — never present in the shipped bundle.
- Local environment details scrubbed from the public repository, with a pre-commit secrets guard to prevent recurrence.

## [1.3.0] — 2026-05-27

### Added

- Mobile responsive layout (`MobileApp`) at <900px breakpoint — tab navigation, swipe gestures between tabs, dedicated Miners tab, expandable weather tile with hourly forecast, min/max price labels on chart.
- Onboarding redesign: newspaper-themed `setup.html` with guided IP entry, city search for weather, skip path for users without miners, and dark-mode toggle.
- `GET /api/setup` endpoint — returns current miner IPs and configured state for the onboarding page to prefill.
- Unified `SettingsPanel` — consolidated Alerts, Feeds/Theme/Intervals, Location/Time/Temp, and Miners configuration into one overlay (replaces separate TweaksPanel and MastheadPanel).
- Mempool self-hosted proxy — configurable base URL via settings, `Promise.allSettled` resilience, staleness detection when CDN content diverges from self-hosted node.
- Source freshness indicators — tristate `StatusDot` (fresh/stale/down) with per-source age labels in the desktop System section and a Feeds tile on mobile.
- Alert system (`useAlerts`) — configurable price-threshold checks, cooldown periods, Notification API integration, and in-page toast display.
- Price history daemon (`history_daemon.py`) — SQLite-backed poller that extends the `LineChart` with multi-day historical data and a vs-yesterday delta indicator.
- Per-column `ErrorBoundary` isolation — render failures in one column degrade gracefully without blanking the full dashboard.
- Debug-gated logger utility (`src/utils/log.js`) — `console.error/warn` in hooks and boundaries route through it; suppressed in production.
- Docker: named volume for miner config persistence across container restarts; `:latest` image published on every merge to main.
- ESLint flat config (`eslint.config.mjs`) with `eslint-plugin-react-hooks`; lint runs in CI.
- Dependabot enabled for npm, Actions, pip, and Docker base images.

### Changed

- Build: replaced Babel CDN + manual concatenation with esbuild bundle; output is deterministic and minified.
- BitAxe API: IP precedence chain (CLI flag > env var > config file); private-IP validation on all inputs; CORS origin allowlist; config persisted to `bitaxe_config.json`.
- Dependencies: Node 26-alpine, Python 3.14-slim, `actions/checkout` v6, `docker/setup-buildx-action` v4, `github/codeql-action` v4.
- CodeQL scanning enabled for JavaScript and Python.

### Fixed

- Mempool proxy hardened against SSRF, oversized responses, and path traversal.
- Auto dark mode now re-evaluates only at sunset/sunrise crossings (edge-trigger), not on every weather poll.
- CSP `connect-src` allowlist extended to cover geocoding API and CoinGecko.

## [1.2.0] — 2026-05-09

### Added

- Unified `SettingsPanel` — all settings consolidated into one ⚙ overlay; replaces separate MastheadPanel and TweaksPanel.
- Miner management in-app — add, remove, and validate BitAxe IPs inline without touching config files; config persists server-side to `bitaxe_config.json`.
- Mobile layout shows "open on desktop to configure" notice when settings are unavailable.
- Docker `:latest` image publishes automatically on every merge to `main` — no manual tag needed for routine updates.

### Fixed

- CSP `connect-src` extended to include `geocoding-api.open-meteo.com` so city-name weather search works correctly.

## [1.0.0] — 2026-05-06

### Added

- Initial public release.
- Single-file React dashboard (`index.html`) bundled from modular `src/`.
- BTC price + 24h chart (Kraken + CoinGecko).
- Bitcoin news feed aggregating Bitcoin Magazine, CoinDesk, news.bitcoin.com (via RSS2JSON).
- Mempool.space integration: chain height, hashrate, fees, difficulty + adjustment countdown.
- BitAxe fleet monitoring via local HTTP API (with friendly empty-state when no API reachable).
- Open-Meteo weather widget with auto dark mode at sunset.
- Light/dark themes, configurable via settings panel.
- localStorage-backed user preferences (location, time format, temp unit, BitAxe API URL).
- Optional Python BitAxe fleet aggregator (`bitaxe_api.py`) with `BITAXE_IPS` env var support.
- Pitch deck (`pitch-deck.html`).
- Docs: `README.md`, `docs/ARCHITECTURE.md`, `docs/SETUP.md`.
- GitHub Actions CI: build verification + Pages auto-deploy.
- Issue templates and PR template for structured triage.

[Unreleased]: https://github.com/GitHubxSuperKai/the-daily-node/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/GitHubxSuperKai/the-daily-node/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/GitHubxSuperKai/the-daily-node/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/GitHubxSuperKai/the-daily-node/compare/v1.0.0...v1.2.0
[1.0.0]: https://github.com/GitHubxSuperKai/the-daily-node/releases/tag/v1.0.0
