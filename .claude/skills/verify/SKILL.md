---
name: verify
description: Run the Playwright end-to-end check (npm run verify) before committing any change to src/, build.js, index.html or tests/e2e/, and whenever asked to verify the dashboard. Reads the summary line and fixes failures within a 3-run cap.
---

# verify

Builds `index.html`, serves it on a free port (never 3002) and runs the flows in `tests/e2e/flows/` on desktop and mobile. By default every public and backend data request is stubbed from `tests/e2e/fixtures/`, and images, fonts and the Google Fonts stylesheet get placeholders from the harness; under `--live` the public data APIs are real (see `--live` below).

## Run

- `npm run verify` before every commit that touches `src/`, `build.js`, `index.html` or `tests/e2e/`.
- `npm run verify -- --live` by hand only. It never gates and never runs in CI.

Find the line matching `^verify: `:

- `verify: pass`
- `verify: fail (<flow names joined by ', '>)`
- `verify: fail (setup)`: the build, the server or the run itself failed before any flow could be judged.
- `verify: fail (harness)`: a harness self-test caught a broken guard. That is a rubric problem, not an app bug.
- `verify: fail (live: no external requests)`: a `--live` run reached no external host, so it ran on fixtures and proved nothing about the real APIs.

## On a failure

Read the failing flow's error, then `playwright-report/` and the screenshots and traces under `test-results/verify/`. Fix the cause and re-run: at most 3 runs in total, the first included. Then stop and report the failing flow with its screenshot path and console output.

A flow that fails only sometimes is a bug. No retries, sleeps, skips or `test.only` (`forbidOnly` refuses it). With no root cause, report it. Deleting or skipping a flow is the maintainer's call. The per-project skips in the output (about 14 on a green fixture run, fewer under `--live`, which filters out the `@fixtures-only` tests before they run; all are tests that run on one project only) are by design, not skips in this sense.

## Rubric (do not edit to make a run pass)

- Everything under `tests/e2e/`, any `playwright.config.*`, `scripts/verify.cjs`, `scripts/verify-map.cjs`, `scripts/verify-refresh-fixtures.cjs`.
- The `package.json` keys `verify` and `verify:refresh-fixtures`.

Editing or deleting an existing rubric file, or adding a `playwright.config.*`, needs the maintainer's approval and must be named in the PR body. CI's non-required `verify-map` job flags each of these. Adding a flow or fixture file for a new feature is fine, except a fixture whose `match` overlaps an existing fixture's: that counts as editing it and needs the same approval (the run fails on an overlap anyway). Changes to this `SKILL.md` must also be named in the PR body.

## New files and new hosts

- Register harness, spec and script files as exact paths in `GROUPS` in `.claude/workflows/full-repo-review.mjs`. Register fixture data files only in `EXCLUDED` in `scripts/check-review-paths.cjs`. `npm test` fails otherwise.
- An unstubbed request fails the run and names the URL. A new external API needs a fixture module in `tests/e2e/fixtures/public/` (recorded) or `backend/` (synthetic). Limit: image and font requests from a new host get placeholders and are not flagged, so only data requests are guaranteed to fail.

## `--live`

- Hits the real public APIs. Miners, firmware, setup and history stay synthetic.
- Skips `@fixtures-only` and `@harness` tests, so it does not check the rss2json fallback.
- Wait 1-2 minutes between live runs: keyless APIs (CoinGecko) rate-limit, and the response cache is per worker process.
- The wrapper fails a live run whose `test-results/verify/summary.json` has `externalRequests` at 0 (the `live: no external requests` line above), so a live `verify: pass` already means the network was reached. `externalOrigins` lists the hosts reached, which are allow-listed by construction, so it is not an independent allow-list check.

## `npm run verify:refresh-fixtures`

Hand-run only. Re-records public fixtures (weather at 0,0, trimmed feeds, image URLs rewritten). Review its diff before committing, and update `EXCLUDED` when it adds or removes files.
