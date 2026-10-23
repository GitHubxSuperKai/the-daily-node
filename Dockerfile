# syntax=docker/dockerfile:1.7
# ─── Build stage: compile src/ → index.html ─────────────────────────
FROM node:26-alpine AS build
WORKDIR /app

# Install deps with cached layer (only re-runs if package files change)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build the dashboard
COPY src/ ./src/
COPY build.js ./
RUN node build.js

# ─── Runtime stage: minimal Python serving the dashboard + API ──────
FROM python:3.14-slim AS runtime
WORKDIR /app

# Drop to a non-root user; create /data for persistent config
RUN useradd --create-home --shell /usr/sbin/nologin app && \
    mkdir -p /data && chown app:app /data
USER app

# Config file location — override at runtime with -e CONFIG_PATH=...
# The /data volume is the canonical place for docker deployments.
ENV CONFIG_PATH=/data/bitaxe_config.json
# IMPORTANT: do not COPY anything into /data after this line — Docker silently
# discards writes to a VOLUME path at build time, and pre-populated files will
# not appear in the running container.
VOLUME /data

# Copy only the artifacts needed at runtime — proxy uses Python stdlib only.
# Adding a COPY from the build context (not --from=build) below? Add it to
# the push `paths:` filter in .github/workflows/docker.yml too, or a change
# to it will alter the image without publishing a new :latest.
COPY --chown=app:app bitaxe_api.py ./
# history_daemon.py is not the default CMD: run it as its own service with the same
# image (python history_daemon.py --bind 0.0.0.0 --db /data/history.db
# --allow-origin <dashboard origin>) so the history charts have a backend.
COPY --chown=app:app history_daemon.py ./
COPY --from=build --chown=app:app /app/index.html ./
# setup.html is served on first launch when BITAXE_IPS is not configured
COPY --chown=app:app setup.html ./

EXPOSE 3001

# Same probe and timing as the docker-compose.yml healthcheck (see the comment
# there for why /api/setup and the empty ProxyHandler); compose's own
# healthcheck overrides this one. Kept identical by
# tests/unit/dockerfileHealthcheck.test.js, and docker.yml's smoke job runs the
# compose probe inside the built image. Port is fixed: if you run with --port,
# override the healthcheck too.
HEALTHCHECK --interval=45s --timeout=6s --start-period=15s --retries=3 CMD ["python3", "-c", "import urllib.request,sys; o=urllib.request.build_opener(urllib.request.ProxyHandler({})); r=o.open('http://127.0.0.1:3001/api/setup',timeout=5); r.read(); sys.exit(0 if r.status==200 else 1)"]

# --bind 0.0.0.0 so the container is reachable from the host network.
# BITAXE_IPS is supplied at runtime via -e or compose.
CMD ["python", "bitaxe_api.py", "--bind", "0.0.0.0"]
