# Development Guide

This guide covers how to set up a local development environment for TuneCamp and start contributing to the project.

## Prerequisites

- **Node.js**: v18 or higher
- **FFmpeg**: Required for audio processing and waveform generation
- **Native build toolchain**: Required to compile native modules (`better-sqlite3`, `node-datachannel`/`webtorrent`, …) when no prebuilt binary matches your platform. Install **Python 3**, **make**, and a **C/C++ compiler** (`gcc`/`g++` on Linux, the Xcode Command Line Tools on macOS, or the "Desktop development with C++" workload on Windows). **CMake** is also needed if `node-datachannel` has to build from source. On Debian/Ubuntu: `sudo apt install build-essential python3 cmake`. These are the same tools the Dockerfile installs (`python3 make g++`) for the image build, so the Docker path doesn't require them on the host.
- **SQLite3**: Optional — useful for manual database inspection

## Initial Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/scobru/tunecamp.git
   cd tunecamp
   ```

2. **Install dependencies**:
   ```bash
   # Root + backend
   npm install

   # Frontend
   cd webapp && npm install && cd ..
   ```

3. **Configure environment variables**:
   Copy `.env.example` to `.env` and fill in the required values (port, JWT secret, music directory path). See the [Configuration section in the README](https://github.com/scobru/tunecamp/blob/main/README.md#configuration) for the full variable reference.

## Running in Development

You need two terminals running in parallel.

**Terminal 1 — backend (TypeScript watch + CSS rebuild):**
```bash
npm run dev
```

**Terminal 2 — backend server:**
```bash
npm start
```

> `npm run dev` only runs `tsc --watch` and the CSS watcher — it does **not** start the server. You need `npm start` (or `node dist/index.js`) to serve requests.

The server is available at `http://localhost:1970` by default (configurable via `TUNECAMP_PORT`).

**Terminal 3 — frontend (Vite dev server with HMR):**
```bash
cd webapp && npm run dev
```

The frontend dev server runs at `http://localhost:5173` and proxies API requests to the backend.

## Running Tests

The project uses **Jest** for the existing test suite. New modules should use **Vitest**.

```bash
# Run all tests
npm test

# Run a specific test file
npm test src/server/auth.test.ts
```

Verify no TypeScript errors before opening a PR:
```bash
npm run build
cd webapp && npm run build
```

## CLI Tools (`src/tools/`)

Several maintenance scripts are available under `src/tools/`:

| Script | Command | Purpose |
|--------|---------|---------|
| `backup.ts` | `node dist/tools/backup.js ./backups` | Creates a timestamped database backup |
| `restore.ts` | `node dist/tools/restore.js ./backups/tunecamp-<date>.db --force` | Restores from a backup |
| `generate-codes.ts` | — | Generates unlock codes for releases |
| `relink-tracks.ts` | — | Updates audio file paths after moving the library |
| `migrate-dedupe.js` | `npm run migrate:dedupe` | Removes duplicate tracks from the database |
| `migrate-visibility.js` | `npm run migrate:visibility` | Bulk-updates visibility for albums and tracks |

See [backup-migration.md](./backup-migration.md) for more detail on data maintenance.

## Code Conventions

- Use **TypeScript** for all new backend code.
- Follow the existing **functional component** style in React.
- Document new API endpoints in [api-contracts.md](./api-contracts.md).
- Every new database table must be added to `src/server/core/database.ts` with appropriate indexes.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full contribution process.
