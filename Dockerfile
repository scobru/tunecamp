# ===================================================
# TuneCamp Docker Image
# Multi-stage build for production deployment
# ===================================================

ARG TUNECAMP_PUBLIC_URL
ARG RELAY_CACHE_BUST
# CapRover passes this on deploy; using it invalidates cache per commit
ARG CAPROVER_GIT_COMMIT_SHA

# Build stage
FROM node:20-alpine AS builder

# Re-declare ARGs needed in this stage (multi-stage build)
ARG CAPROVER_GIT_COMMIT_SHA
ARG RELAY_CACHE_BUST
ARG TUNECAMP_PUBLIC_URL

WORKDIR /app

# Consume build-args (avoids unconsumed build-arg warnings; SHA also busts cache per deploy)
RUN echo "CapRover commit: ${CAPROVER_GIT_COMMIT_SHA:-none}" && \
    echo "Tunecamp URL: ${TUNECAMP_PUBLIC_URL:-unset}" && \
    echo "Relay cache bust: ${RELAY_CACHE_BUST:-unset}"

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++ curl

# Install Gleam
ENV GLEAM_VERSION=v1.14.0
RUN curl -fsSL https://github.com/gleam-lang/gleam/releases/download/${GLEAM_VERSION}/gleam-${GLEAM_VERSION}-x86_64-unknown-linux-musl.tar.gz | tar xz -C /usr/local/bin

# Copy package files
COPY package*.json ./
COPY gleam.toml ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY . .

# Build Gleam
RUN npm run gleam:build

# Build TypeScript
RUN npm run build

# ===================================================
# Production stage
# ===================================================
FROM node:20-alpine

# Re-declare ARG so production stage gets fresh value; busts cache so new code is always copied
ARG CAPROVER_GIT_COMMIT_SHA

WORKDIR /app

# Cache buster: forces this stage to rebuild every deploy (no "Using cache" on COPY --from=builder)
RUN echo "Production deploy commit: ${CAPROVER_GIT_COMMIT_SHA:-none}"

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && \
    apk del python3 make g++ && \
    rm -rf /root/.npm

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/webapp ./webapp
COPY --from=builder /app/templates ./templates


# Create directories for data persistence
RUN mkdir -p /music /data

# Environment variables
ENV NODE_ENV=production
ENV TUNECAMP_DB_PATH=/data/tunecamp.db

# Expose default port
EXPOSE 1970

# Install runtime dependencies
RUN apk add --no-cache curl

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:1970/api/catalog || exit 1

# Default command: start server with /music as library
CMD ["node", "dist/cli.js", "server", "/music", "--port", "1970", "--db", "/data/tunecamp.db"]
