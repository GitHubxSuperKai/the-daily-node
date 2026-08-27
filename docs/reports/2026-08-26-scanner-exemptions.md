# check:secrets — docs/ and tests/ exemptions

```
You are Claude in the The Daily Node repo (the working dir this prompt is
pasted into; paths below are repo-relative because this repo is public and
its CLAUDE.md forbids absolute local paths in committed files). Last
session (2026-08-26) shipped PR #134 and PR #135: the secrets pre-commit
hook is now tracked at .githooks/pre-commit, and check:secrets runs in CI
as the `secrets` job in .github/workflows/build.yml, which is now a
REQUIRED status check on main. What did NOT get fixed is the scanner
itself: scripts/check-secrets.cjs skips docs/ and tests/ entirely.

Headline: the exemptions cannot simply be deleted. docs/ and tests/
already contain 78 RFC1918 matches across 16 files, so removing the skip
turns the now-required `secrets` check red and blocks every merge on the
repo — including the merge that carries the fix. Those 78 must be dealt
with first. This is an ordering problem, not a security one: Kai has
confirmed the addresses — all low-numbered hosts in the 192.168.1.x,
10.0.0.x and 172.16.x private ranges — are old, no longer in use, and not
his real miner IPs. Do not treat this as a live leak or an incident.
(The literal values are deliberately not reproduced here: this file lives
under docs/, which the scanner does not read, so spelling them out would
add to the very pile you are about to clear. Find them with a private-range
grep over docs/ and tests/.)

Your job: make check:secrets scan docs/ and tests/ without breaking the
required check. In order: decide scrub-vs-allowlist for the 78 existing
matches, apply that decision, then remove the skip entries, then prove the
result both ways — a planted private IP under docs/ must fail, and a
full-repo scan of main must pass.

The prior session's recommendation, for you to confirm or overturn: scrub
the values to documented placeholders rather than allowlisting them. More
churn once, but it leaves the scanner with no allowlist to maintain, and
it still works when the pattern is later widened beyond RFC1918 (item E5).
An allowlist is the smaller diff but silently permits those exact strings
anywhere in future.

Constraints. scripts/check-secrets.cjs is currently unreadable: the global
deny list in ~/.claude/settings.json contains Read(**/*secret*), which
matches it by name. Deny beats allow in Claude Code, so the pattern itself
must be narrowed before you can edit the file — if a read still fails,
stop and say so rather than working around it. Note the same rule blocks
writing any file whose own name contains "secret", which is why this
report is named scanner-exemptions. Do not narrow existing coverage: src/,
scripts/, .github/, .claude/, .githooks/ and repo-root files are scanned
today and must stay scanned. Do not change the CI staging mechanism in the
`secrets` job (the git reset --soft base resolution) — it landed in PR
#135 and is verified against both the pull_request and push event paths.
Because `secrets` is a required check, run a full-repo scan locally and
confirm it is green BEFORE pushing; a red scanner blocks all merges
including the fix itself. Present your scrub-vs-allowlist choice with the
file list and wait for Kai's explicit go-ahead before making the bulk
edit across the 16 files.

Open items: docs/reports/2026-08-26-scanner-exemptions.md

When docs/ and tests/ are scanned and the required check is green, add
this line at the very top of that file, above the code block containing
this prompt, before wrapping — a blockquote reading
"[!NOTE] Resolved YYYY-MM-DD" with the date you finish on. If only partly
done, do not resolve it — update the inventory and write a fresh
initiation prompt in a plain code fence like this one, replacing the block
at the top of that same file.
```

## Work Inventory

Session 2026-08-26 shipped PR #134 (track the pre-commit hook) and PR #135 (run the scan in CI as a required check), and established by black-box probe what `check:secrets` actually covers — the scanner file itself was unreadable throughout. The items below are what those two PRs deliberately left open, plus the blockers discovered while scoping them.

One question raised during scoping is already settled and is recorded here rather than as a row: the 78 RFC1918 values in `docs/` and `tests/` are **old addresses, no longer in use, and not Kai's real miner IPs** (confirmed 2026-08-26). They still have to be handled before the skip entries come out, but for merge-blocking reasons alone — there is no leak to remediate and no urgency beyond ordinary work.

Retain until resolved; a resolved hand-off stays as a record — do not delete.

| ID | Item | Priority | Notes |
|----|------|----------|-------|
| E1 | `Read(**/*secret*)` in `~/.claude/settings.json` blocks reading `scripts/check-secrets.cjs` | High | Hard blocker for every other item touching the scanner. Deny beats allow, so an allow entry will not override it; the pattern needs narrowing (e.g. `Read(**/*secret*.json)` plus `Read(**/.env*)`, `Read(**/secrets/**)`). Also blocks writing any file whose name contains "secret". Permission changes generally need a fresh session. |
| E2 | Clear the 78 pre-existing RFC1918 matches from `docs/` and `tests/` | High | 16 files. Heaviest: `docs/superpowers/plans/2026-05-08-bitaxe-onboarding.md` (26), `tests/unit/SettingsPanel.test.jsx` (17), `docs/superpowers/plans/2026-05-27-onboarding-redesign.md` (13). Values confirmed obsolete, so this is mechanical, not a security triage. Blocks E3. Approach depends on E4. |
| E3 | Remove the `docs/` and `tests/` skip entries from the scanner | High | The actual deliverable. Must land only after E2, or the required `secrets` check goes red and blocks all merges. Verify both directions: planted IP under `docs/` fails, full-repo scan of main passes. |
| E4 | Decide scrub-to-placeholder vs allowlist for the E2 values | High | Prior session recommends scrub: no allowlist to maintain, and it survives widening the pattern in E5. Allowlist is the smaller diff but permanently permits those literals anywhere. Kai's call — present the file list and wait for go-ahead before the bulk edit. |
| E5 | Pattern matches only literal RFC1918 | Medium | Confirmed not caught: `127.0.0.1`, CGNAT `100.64.x`, link-local, IPv6, hostnames, usernames, absolute local paths, SSH keys, API tokens. CLAUDE.md bans seven categories; the scanner enforces one. Widening it will surface more pre-existing hits — expect an E2-shaped pass per category. |
| E6 | Scanner reads working-copy content, not the staged blob | Medium | Stage a secret, edit it out without re-staging, and it commits unscanned. Affects the local hook only — CI stages from a clean checkout, so index and worktree agree there. |
| E7 | `build.yml` has no `merge_group` trigger | Low | Not a bug today (no merge queue; `strict: true` forces serial merges instead). If a queue is ever enabled, the required `secrets` check would never report on `merge_group` events and would deadlock it. The existing `build` job has the same gap. |
