# ===================================================
# TuneCamp Docker Image
# Multi-stage build for production deployment
# ===================================================

ARG TUNECAMP_PUBLIC_URL
ARG TUNECAMP_ZEN_PEERS 
ARG TUNECAMP_RELAY_URL
ARG VITE_ZEN_PEERS
ARG RELAY_CACHE_BUST
ARG TUNECAMP_RPC_URL
ARG TUNECAMP_CURRENCY_CONTRACT
ARG DISCOGS_TOKEN
ARG TUNECAMP_DOWNLOAD_DIR
ARG TELEGRAM_BOT_TOKEN
ARG TELEGRAM_MASTER_ID
ARG OPENROUTER_API_KEY
ARG OPENROUTER_MODEL
ARG TUNECAMP_GDRIVE_CLIENT_ID
ARG TUNECAMP_GDRIVE_CLIENT_SECRET
ARG TUNECAMP_ZEN_EXT_EMERGENCY_MB


# CapRover passes this on deploy; using it invalidates cache per commit
ARG CAPROVER_GIT_COMMIT_SHA

# Build stage
FROM node:22-alpine AS builder

# Re-declare ARGs needed in this stage (multi-stage build)
ARG CAPROVER_GIT_COMMIT_SHA
ARG TUNECAMP_PUBLIC_URL
ARG TUNECAMP_RPC_URL
ARG TUNECAMP_CURRENCY_CONTRACT
ARG VITE_ZEN_PEERS
ARG TUNECAMP_ADMIN_USER
ARG TUNECAMP_ADMIN_PASS
ARG DISCOGS_TOKEN
ARG TUNECAMP_DOWNLOAD_DIR
ARG STRIPE_PUBLISHABLE_KEY
ARG STRIPE_SECRET_KEY
ARG STRIPE_WEBHOOK_SECRET

WORKDIR /app

# Prevent Puppeteer from downloading Chromium during build time
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Consume build-args (avoids unconsumed build-arg warnings; SHA also busts cache per deploy)
RUN echo "CapRover commit: ${CAPROVER_GIT_COMMIT_SHA:-none}" && \
    echo "Tunecamp URL: ${TUNECAMP_PUBLIC_URL:-unset}" && \
    echo "Relay cache bust: ${RELAY_CACHE_BUST:-unset}"

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++ curl git libc6-compat gcompat unzip

# Copy package files and local dependencies
COPY package*.json ./
COPY scripts ./scripts
COPY webapp/package.json ./webapp/

# Install all dependencies (including dev) for the entire workspace
RUN npm ci && \
    npm install @rollup/rollup-linux-x64-musl lightningcss-linux-x64-musl @tailwindcss/oxide-linux-x64-musl && \
    npm cache clean --force && \
    rm -rf /root/.npm/_cacache

# Copy source code
COPY . .

# Build TypeScript (Server)
RUN npm run build

# Pass ARGs to VITE_ ENVs for frontend build
ENV VITE_TUNECAMP_OWNER_ADDRESS=$TUNECAMP_OWNER_ADDRESS
ENV VITE_TUNECAMP_RPC_URL=$TUNECAMP_RPC_URL
ENV VITE_TUNECAMP_CURRENCY_CONTRACT=$TUNECAMP_CURRENCY_CONTRACT
ENV VITE_ZEN_PEERS=$VITE_ZEN_PEERS

# Build Frontend (using workspace command)
RUN npm run build -w webapp
# Ensure all public assets (manifest, sw, icons) are in dist
RUN cp -v webapp/public/manifest.json webapp/dist/ 2>/dev/null || true
RUN cp -v webapp/public/sw.js webapp/dist/ 2>/dev/null || true
RUN cp -rv webapp/public/* webapp/dist/ 2>/dev/null || true

# ===================================================
# Production stage
# ===================================================
FROM node:22-alpine

# Re-declare ARG so production stage gets fresh value; busts cache so new code is always copied
ARG CAPROVER_GIT_COMMIT_SHA

WORKDIR /app

# Cache buster: forces this stage to rebuild every deploy (no "Using cache" on COPY --from=builder)
RUN echo "Production deploy commit: ${CAPROVER_GIT_COMMIT_SHA:-none}"

# Install runtime dependencies for native modules
RUN apk add --no-cache \
    ffmpeg \
    curl \
    python3 \
    libc6-compat \
    gcompat

# Copy package files, local dependencies and install production dependencies
COPY package*.json ./
COPY deps ./deps
COPY scripts ./scripts
COPY webapp/package.json ./webapp/

# Install build tools, run npm ci, and cleanup in one layer
RUN apk add --no-cache --virtual .build-deps python3 make g++ && \
    npm ci --omit=dev && \
    npm cache clean --force && \
    apk del .build-deps && \
    rm -rf /root/.npm /tmp/*

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/webapp/dist ./webapp/dist
COPY --from=builder /app/webapp/public ./webapp/public


# Create directories for data persistence
RUN mkdir -p /music /data /radata

# Re-declare ARGs for production stage
ARG TUNECAMP_ADMIN_USER
ARG TUNECAMP_ADMIN_PASS
ARG DISCOGS_TOKEN
ARG TUNECAMP_DOWNLOAD_DIR=/music/downloads

# Environment variables
ENV NODE_ENV=production
# Deploy commit, used by Sentry as release tag (set SENTRY_DSN to enable crash reporting)
ENV TUNECAMP_GIT_SHA=$CAPROVER_GIT_COMMIT_SHA
ENV TUNECAMP_DB_PATH=/data/tunecamp.db
ENV TUNECAMP_ADMIN_USER=$TUNECAMP_ADMIN_USER
ENV TUNECAMP_ADMIN_PASS=$TUNECAMP_ADMIN_PASS
ENV DISCOGS_TOKEN=$DISCOGS_TOKEN
ENV TUNECAMP_DOWNLOAD_DIR=$TUNECAMP_DOWNLOAD_DIR
ENV TUNECAMP_MUSIC_DIR=/music
ENV SKIP_STARTUP_MAINTENANCE=true

# Puppeteer & Chromium configuration for Alpine
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Expose default port
EXPOSE 1970

# Install runtime dependencies
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont curl libc6-compat gcompat ffmpeg unzip python3 py3-pip && \
    python3 -m pip install --break-system-packages -U yt-dlp bgutil-ytdlp-pot-provider

# Add a more lenient healthcheck
# to avoid restart loops during heavy maintenance/discovery
HEALTHCHECK --interval=60s --timeout=30s --start-period=180s --retries=5 \
    CMD curl -f http://127.0.0.1:1970/health || exit 1

# Default command: start server directly
CMD ["node", "--expose-gc", "dist/index.js"]


