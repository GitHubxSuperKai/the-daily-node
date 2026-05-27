# syntax=docker/dockerfile:1.7
# ─── Build stage: compile src/ → index.html ─────────────────────────
FROM node:24-alpine AS build
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

# Copy only the artifacts needed at runtime — proxy uses Python stdlib only
COPY --chown=app:app bitaxe_api.py ./
COPY --from=build --chown=app:app /app/index.html ./
# setup.html is served on first launch when BITAXE_IPS is not configured
COPY --chown=app:app setup.html ./

EXPOSE 3001

# --bind 0.0.0.0 so the container is reachable from the host network.
# BITAXE_IPS is supplied at runtime via -e or compose.
CMD ["python", "bitaxe_api.py", "--bind", "0.0.0.0"]
