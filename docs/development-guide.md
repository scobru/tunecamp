# Development Guide - TuneCamp

## Prerequisites
- **Node.js:** v20+ recommended.
- **npm:** v10+.
- **FFmpeg:** Required for audio processing and metadata extraction.
- **SQLite:** Pre-installed on most systems (accessed via `better-sqlite3`).

## Project Setup
1. Clone the repository.
2. Install dependencies in the root:
   ```bash
   npm install
   ```
3. Install dependencies for the webapp:
   ```bash
   cd webapp && npm install
   ```

## Local Development

### Running the Backend
From the project root:
```bash
# Start in development mode (with watch)
npm run dev
```
The server defaults to port `1970`.

### Running the WebApp
From the `webapp/` directory:
```bash
# Start Vite development server
npm run dev
```
The frontend typically runs on `http://localhost:5173`.

## Build Commands
- **Backend:** `npm run build` (runs `tsc`).
- **WebApp:** `npm run build` (runs `vite build`).
- **CSS:** `npm run build:css` (runs Tailwind CLI).

## Testing
The project uses **Jest** for testing.
```bash
# Run all tests
npm test
```
Tests are located alongside the code (e.g., `*.test.ts`).

## Maintenance Tools
Located in `src/tools/`, these can be run using `node dist/tools/<script-name>.js`:
- `migrate-dedupe.js`: Cleans up duplicate library entries.
- `restore.js`: Restores the library from a backup.
- `generate-zen-pair.js`: Generates a new identity for the server.

## Coding Standards
- Use **TypeScript** for all new code.
- Follow the **Repository pattern** for database access.
- Ensure all API routes have corresponding **validators** and **security tests**.
