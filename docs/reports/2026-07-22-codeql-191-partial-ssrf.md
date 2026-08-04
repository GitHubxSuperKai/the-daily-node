# CodeQL #191 — Partial SSRF in mempool-proxy (remediation hand-off)

> [!NOTE] Resolved 2026-07-22
> Fixed and closed. PR [#105](https://github.com/GitHubxSuperKai/the-daily-node/pull/105) merged to `main` (`8a9a987`) added an endpoint allowlist that constrains the caller-controlled `path`: an `in {…8 string literals…}` membership check (CodeQL `ConstCompareBarrier`) for the static endpoints and an anchored `re.fullmatch()` (CodeQL `StringRestrictionSanitizerGuard`) for the parametric `pool/<slug>/blocks` endpoint. The post-merge CodeQL scan of `main` transitioned alert **#191** to `state: fixed` (`fixed_at 2026-07-22T23:25:00Z`). All 9 real `mempoolGet()` endpoints remain reachable; PR #96's host allowlist was untouched. Regression coverage: `EndpointAllowlistTest` (non-vacuous rejection of unlisted paths / wrong suffix / injection-char slug) plus the redirect-SSRF test repointed to stay non-vacuous.

Session 2026-07-22 diagnosed open CodeQL code-scanning alert **#191** (`py/partial-ssrf`, **critical**) while verifying the Dependabot-batch ship (PR #103). No code fix was applied in that session — the user chose **option A (remediate)** and this hand-off carried it forward. *As of that session* the alert was a real, current finding on `main`, not stale state; it was remediated later the same day (see the banner above).

> Everything below this line is the hand-off as written on 2026-07-22, preserved for the diagnosis. Line citations refer to the **pre-fix** `bitaxe_api.py` and will not match `main` today. Item status is tracked in the Inventory table.

## Diagnosis (confirmed this session)

- **Sink:** `bitaxe_api.py:341` — `req = urllib.request.Request(target, ...)` where `target = authorized_base + path` (line 334).
- **Taint source:** `path` is user-controlled — `params.get('path', [''])[0]` from the `?path=` query param (line 297).
- **Why it survived PR #96:** #96 closed the *sibling* alert #190 (`py/full-ssrf`) by sourcing the request **host** from the server-side allowlist frozenset (`authorized_base`, line 333), breaking host taint. But `path` is still caller-controlled and still concatenated into the request URL, so CodeQL's **partial**-ssrf query (user controls part of the URL, not the host) correctly still fires. #96 fixed the host half; #191 is the path half. Open since the #96 scan on 2026-07-17.
- **Real-world exploitability: LOW but non-zero.** Existing defense-in-depth: host/authority fully server-controlled (path must start `/api/` per line 299, so it can only extend the path — can't alter scheme/host/port); `..` traversal blocked (line 299); redirects refused (`_NoRedirect`, line 342); allowlist empty by default so the sink is unreachable until a proxy base is authorized (line 325 → 403). Residual risk: once a self-hosted node is authorized, a caller could reach unintended `/api/*` paths on that already-trusted host. Not a false positive — a genuinely open critical.

## Deliverable

Make the `path` taint provably safe so CodeQL #191 closes, without breaking legitimate self-hosted mempool proxying. Candidate direction (confirm during implementation): constrain `path` to an allowlist of expected endpoint prefixes, or reconstruct the request path from validated/parsed components rather than raw concatenation — whichever CodeQL recognizes as sanitization. Ship via `/ship-it` with a code-review pass (security-sensitive, same route as #95/#96). Add a non-vacuous regression test proven to fail against the unpatched path handling.

## Inventory

| ID | Status | Item | Priority | Notes |
|----|--------|------|----------|-------|
| S1 | ✅ Done | Constrain user-controlled `path` at `bitaxe_api.py:334`/`:341` so `py/partial-ssrf` #191 closes | High | Shipped in PR #105. Landed as an endpoint allowlist, not a path-prefix rule: `in {…8 literals…}` for static endpoints + anchored `re.fullmatch()` for `pool/<slug>/blocks` |
| S2 | ✅ Done | Add regression test proving the path constraint rejects the crafted input | High | `EndpointAllowlistTest` — rejects unlisted paths, wrong suffix, injection-char slug; the #95 redirect test was repointed to stay non-vacuous |
| S3 | ✅ Done | Verify #191 auto-closes `fixed` on the post-merge main CodeQL scan | Medium | Confirmed `state: fixed`, `fixed_at 2026-07-22T23:25:00Z`. Re-verified 2026-08-04, still `fixed` |
| S4 | ⚠️ Open | Decide fate of the empty-default vs authorized-node UX | Low | Confirm the tighter path rule doesn't block a real Start9 `/api/*` endpoint the proxy is meant to serve |

**S4 is the one item still genuinely open.** The allowlist has never been exercised against a real self-hosted node: the proxy 403s until a base is authorized via `--allow-proxy`/`proxy_hosts`, and the VM node has not been configured. So whether the 8 allowlisted endpoints plus the `pool/<slug>/blocks` pattern actually cover what a live Start9 mempool serves is **untested, not confirmed**. If proxying is ever switched on, expect to discover missing endpoints there first.

## Not in scope for this hand-off (tracked elsewhere)

- Dependabot alert **#12** (brace-expansion ReDoS) — already fixed in lockfile + GitHub SBOM; `open` only due to alert-reconciler lag, not code. Separate task in the project note.
- **PR #104** (`/api/setup` test collection fix) — separate in-flight ship by another session.
- Orphaned release tags / Windows `verify:vendor` — project-note watch-fors, unrelated.
