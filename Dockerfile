# syntax=docker/dockerfile:1
# Multi-stage production Dockerfile for Next.js 16 + better-sqlite3 native bindings

# ==============================================================================
# STAGE 1: Dependencies & Native C++ Compilation
# ==============================================================================
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# Install build essentials required by node-gyp and better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    sqlite3 \
    libsqlite3-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

# ==============================================================================
# STAGE 2: Application Builder
# ==============================================================================
FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ==============================================================================
# STAGE 3: Production Runner
# ==============================================================================
FROM node:22-bookworm-slim AS runner
WORKDIR /app

# Install runtime utilities (sqlite3 CLI for automated healthchecks/backups, gosu for safe privilege drop)
RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 \
    ca-certificates \
    curl \
    gosu \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Default paths for persistent volume mount
ENV DATABASE_PATH="/app/data/career_app.db"
ENV UPLOADS_DIR="/app/data/uploads"

# Create unprivileged system user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 nextjs

# Create persistent storage directories with proper ownership
RUN mkdir -p /app/data /app/data/uploads && \
    chown -R nextjs:nodejs /app/data

# Copy built application and runtime dependencies
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/next.config.js ./next.config.js

# Copy and set entrypoint script to fix volume permissions at runtime before dropping to nextjs user
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

# Healthcheck targeting public health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Production start with Supervisor (Option B: Web + Background Worker on shared volume)
CMD ["node", "scripts/start_all.mjs"]
