# syntax=docker/dockerfile:1.7

# ─── Stage 1: build ───────────────────────────────────────────────
# Full Node image so the native better-sqlite3 module can compile.
FROM node:20-bookworm AS builder

WORKDIR /app

# Cache deps separately from source so source edits don't bust npm ci.
COPY package.json package-lock.json ./
RUN npm ci

# Copy sources and compile TypeScript
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
RUN npm run build

# Drop devDependencies before copying node_modules into the runtime image.
RUN npm prune --omit=dev

# ─── Stage 2: runtime ─────────────────────────────────────────────
# Slim image for the actual bot. Includes sqlite3 CLI for backups.
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends sqlite3 ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Non-root user with stable UID/GID for predictable volume permissions.
RUN groupadd -r -g 1001 wannabet && \
    useradd -r -u 1001 -g wannabet -m -d /home/wannabet wannabet

# Copy artifacts from the builder stage.
COPY --from=builder --chown=wannabet:wannabet /app/dist ./dist
COPY --from=builder --chown=wannabet:wannabet /app/node_modules ./node_modules
COPY --from=builder --chown=wannabet:wannabet /app/migrations ./migrations
COPY --from=builder --chown=wannabet:wannabet /app/package.json ./

# Pre-create the runtime dirs and own them so volume mounts inherit perms.
RUN mkdir -p /app/data /app/logs /app/backups && \
    chown -R wannabet:wannabet /app/data /app/logs /app/backups

# Entrypoint script (runs migrations, then exec's CMD).
COPY --chown=wannabet:wannabet docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER wannabet
ENV NODE_ENV=production

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
