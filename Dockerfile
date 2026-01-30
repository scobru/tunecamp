# ===================================================
# TuneCamp Docker Image
# Multi-stage build for production deployment
# ===================================================

ARG TUNECAMP_PUBLIC_URL
ARG RELAY_CACHE_BUST




# Build stage
FROM node:20-alpine AS builder

WORKDIR /app



# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++ curl

# Install Gleam
ENV GLEAM_VERSION=v1.14.0
RUN curl -fsSL https://github.com/gleam-lang/gleam/releases/download/${GLEAM_VERSION}/gleam-${GLEAM_VERSION}-x86_64-unknown-linux-musl.tar.gz | tar xz -C /usr/local/bin

RUN echo "Relay cache bust: $RELAY_CACHE_BUST"


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

WORKDIR /app


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

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:1970/api/catalog || exit 1

# Default command: start server with /music as library
CMD ["node", "dist/cli.js", "server", "/music", "--port", "1970", "--db", "/data/tunecamp.db"]
