# TuneCamp Backend

## Purpose

Express/TypeScript server: local music library, ActivityPub federation, HTTP-gossip instance discovery, community chat/live, and blockchain payment integration. See `../../docs/architecture-backend.md` for the full component map.

## Ownership

- `core/` — SQLite database layer (`database.ts`)
- `modules/` — feature modules: `network/` (federated discovery), `fedify/` + `activitypub/` (federation), `catalog/` (scanner + metadata), `auth/` (JWT/bcrypt/RBAC), `chat/` + `live/` (community), `publishing/` (blockchain)
- `middleware/`, `routes/` — REST API (`/api/*`, `/rest` Subsonic-compat, `/health`)
- `plugins/`, `providers/`, `repositories/` — extensibility points and data access
- `tools/` — one-off maintenance scripts (backup, migrate, relink)

## Local Contracts

Inherits root [../../AGENTS.md](../../AGENTS.md). Backend-specific:

- SQLite only (`core/database.ts`), WAL mode, no other DB engine.
- Never move or rename files on disk; DB stores metadata pointing at existing paths.
- `GET /health` must stay registered before federation middleware — a blocked integration must not shadow it (Docker `HEALTHCHECK` depends on it).
- ZEN/ZEN removed — do not import from the main thread; any future re-add goes through worker_thread RPC.
- New publish/sell endpoints must gate on `VisibilityGuardian.canPublishContent()`.

## Work Guidance

(none beyond root)

## Verification

`npm test` from `tunecamp/` (Jest, `--experimental-vm-modules` for ESM).

## Child DOX Index

None.
