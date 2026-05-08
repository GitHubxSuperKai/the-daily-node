# Distribution MVP — Source + Docker

**Date:** 2026-05-08
**Status:** Approved (MVP scope)

## Goal

Ship the Daily Node Command Center to two audiences with one codebase:

- **Tier 1 — Source/script:** developers and tinkerers who want to read the code and run it directly
- **Tier 2 — Docker:** homelabbers, NAS owners, LXC users who want a one-command install

A trust ladder is implicit: tier 1 is "I read every line"; tier 2 is "Dockerfile and image build are public, I trust the pipeline." Users self-select.

Out of scope (deferred to v2): Start9 marketplace, runtime onboarding (POST `/api/config`), pre-built binaries, LXC-specific docs.

## Non-Goals

- No firmware patches to BitAxe (out of project scope)
- No HTTPS/Tor — local LAN only for v1
- No reverse proxy or auth — relies on LAN-level trust
- No runtime config UI — `BITAXE_IPS` is set via env var for v1
- No prebuilt binaries — addressed in a separate v2 spec if demand emerges

## Architecture

Both tiers run the same artifacts produced by the existing build:

- `bitaxe_api.py` — serves `index.html` at `GET /` and `/api/miners` at `GET /api/miners`
- `index.html` — built from `src/` by `node build.js`

The two distribution paths differ only in **how the process is launched** and **how dependencies are provided**.

```
+--------------------------+         +-----------------------------+
| Tier 1: Source/script    |         | Tier 2: Docker              |
| - git clone              |         | - docker run ghcr.io/.../   |
| - node build.js          |         |   the-daily-node:latest     |
| - python bitaxe_api.py   |         | - image bundles build step  |
+--------------------------+         +-----------------------------+
              \                                    /
               \                                  /
                v                                v
          +-----------------------------------------+
          |   Same bitaxe_api.py + index.html       |
          |   serving on port 3001                  |
          +-----------------------------------------+
```

## Components

### Dockerfile (multi-stage)

Two stages so the runtime image stays small and self-contained:

1. **Build stage** (`node:24-alpine`):
   - `COPY src/ ./src/`, `COPY build.js package.json package-lock.json ./`
   - `RUN npm ci && node build.js`
   - Produces `index.html`
2. **Runtime stage** (`python:3.12-slim`):
   - `COPY bitaxe_api.py ./`
   - `COPY --from=build /app/index.html ./`
   - `EXPOSE 3001`
   - `CMD ["python", "bitaxe_api.py", "--bind", "0.0.0.0"]`

Runtime image target size: < 100 MB. No Python deps beyond stdlib (the proxy uses only `http.server`, `urllib`, `ipaddress`, `threading`).

### docker-compose.yml

Example compose file at the repo root for users who prefer compose to `docker run`:

```yaml
services:
  daily-node:
    image: ghcr.io/githubxsuperkai/the-daily-node:latest
    container_name: daily-node
    ports:
      - "3001:3001"
    environment:
      BITAXE_IPS: "<miner-ip-1>,<miner-ip-2>"
    restart: unless-stopped
```

Users copy/paste, replace `<miner-ip-N>` with their miner IPs, run `docker compose up -d`.

### GitHub Actions workflow (`.github/workflows/docker.yml`)

Triggers:
- Push tag `v*.*.*` → build and publish `:latest` and `:v1.2.3` tags
- `workflow_dispatch` → manual rebuild

Steps:
- Checkout
- Set up QEMU (for cross-arch)
- Set up Docker Buildx
- Login to GHCR (using `GITHUB_TOKEN`, no extra secrets)
- `docker/build-push-action` with `platforms: linux/amd64,linux/arm64`
- Push to `ghcr.io/${{ github.repository }}`

ARM64 covers Pi 4/5, Apple Silicon Macs running Docker, most modern NASes. AMD64 covers everything else.

### README updates

Add a new top-level section "Run with Docker" between the existing "Quick start" and "BitAxe setup" sections. Three subsections:

1. **One-line `docker run`** — fastest path
2. **Docker Compose** — copy the compose snippet, edit IPs, `docker compose up -d`
3. **LXC users** — note that the same image runs in any LXC container with Docker installed

The existing "Run from source" content stays as-is, possibly retitled "Run from source (advanced)" to signal Docker as the recommended default.

## Trust & Security

- **Image build is fully public.** Dockerfile is in repo. Workflow runs in public GitHub Actions. Image layers inspectable via `docker history` / `docker inspect`.
- **No image signing in v1.** GHCR images include provenance attestation automatically (added by `docker/build-push-action`); this is sufficient trust signal for tier 2 audience without adding cosign infra to MVP.
- **No code-signing.** Not applicable — we're not shipping a binary in v1.
- **No private IPs in any artifact.** The compose file, README examples, and Dockerfile all use placeholder syntax (`<miner-ip-N>`, `192.168.x.x`, etc.). The existing `scripts/check-secrets.cjs` enforces this on every commit.

## Error Handling

- **Build stage fails** → workflow fails, no image published, no `:latest` mutation
- **Runtime: no `BITAXE_IPS` set** → proxy starts, dashboard loads, Field Report shows "no miners configured" (existing behavior)
- **Runtime: miners unreachable** → proxy returns `{miners: [...], count: N}` with `online: false` per miner; dashboard shows offline state (existing behavior)
- **Wrong port mapping in compose** → user sees connection refused; documented in troubleshooting section of README

## Testing

- **Existing smoke test** (`scripts/smoke-build.cjs`) continues to gate every commit — verifies `index.html` is built correctly.
- **New: Docker build smoke test** runs in CI on every PR (not just on tag): builds the Docker image with `docker buildx build --platform linux/amd64 --load` and asserts the resulting image starts and responds to `curl http://localhost:3001/` with HTTP 200. Doesn't push, just verifies build integrity.
- **Manual verification before first release:**
  - Pull image on amd64 host, run, verify dashboard at `http://localhost:3001/`
  - Pull image on arm64 host (Pi or Apple Silicon), same check
  - Run from source on Windows + macOS + Linux, same check

## Release Process

1. Bump version in `package.json`
2. `git tag v<version> && git push --tags`
3. GitHub Actions builds and publishes multi-arch image to GHCR with both `:latest` and `:v<version>` tags
4. Manually create GitHub release from the tag (changelog automation deferred to v2)
5. Users on `:latest` get the new image on next pull; users pinned to a specific tag stay on that version

## Estimated Work

- `Dockerfile` (multi-stage): 30 min
- `docker-compose.yml`: 5 min
- `.github/workflows/docker.yml`: 1 hour (multi-arch + permissions setup + smoke test)
- README updates: 30 min
- Smoke test for Docker build: 30 min
- Manual verification: 30 min

**Total: ~3 hours** of focused work, plus marketplace propagation time for GHCR.

## v2 Backlog (not part of this spec)

- Start9 marketplace package (`start9/` manifest, icon, instructions, submission)
- Runtime onboarding flow (POST `/api/config` to persist `BITAXE_IPS` from dashboard)
- Pre-built single-file binaries (Go/Rust rewrite + Sigstore signing)
- Reverse-proxy guide (Caddy/Traefik/nginx examples for HTTPS)
- Tor onion address support (independent of Start9)
