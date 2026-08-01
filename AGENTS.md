# TuneCamp

## Purpose

Federated, self-hosted music platform: personal music server + Fediverse (ActivityPub) social protocols + HTTP-gossip instance discovery + web3 monetization on Base.

## Ownership

Monorepo, three subprojects:

- `src/server/` — Express/TypeScript backend (SQLite, federation, catalog, auth, community, blockchain integration)
- `webapp/` — React/Vite SPA frontend
- `contracts/` — Solidity contracts (Base network)

`docs/` holds technical docs (architecture, API contracts, data models); `scripts/` holds one-off install/patch scripts. Neither is a durable code boundary — no child AGENTS.md.

## Local Contracts

Full session rules live in `.claude/CLAUDE.md` (git workflow, architecture decisions) — read it before editing. Summary of what must not be violated:

- **Branching**: `dev` is the integration branch. Never commit to `main` or branch off `main`. Feature/fix branches merge into `dev`; `dev` promotes to `main` for releases.
- **Before every push**: update `CHANGELOG.md` and bump `package.json` version (semver: patch/minor/major).
- **Database**: SQLite (`better-sqlite3`, WAL) only. No Postgres/Redis while single-machine.
- **Filesystem**: files are never moved or renamed. `consolidateFiles()` was removed — do not reintroduce file-moving logic.
- **ZEN/Gun.js**: fully removed. Never re-import `zen`, `zendb.service`, `zen.worker`, or `gun` outside a worker_thread RPC.
- **Auth**: username + password + JWT, per-instance. Cross-instance identity federation is provided by FID (Fediverse-ID); this is optional SSO, not the primary auth system.
- **Publishing gate**: use `VisibilityGuardian.canPublishContent()`, never a raw `artistId` check.
- **Playlists**: members-only, not restricted above `user` role.
- **End of every feature**: update `CHANGELOG.md`, update `tunecamp-website` (landing/docs pages if the feature is user-facing), update `docs/` (architecture/API/data-model docs this repo owns), update `tunecamp-ecosystem` (Components table / relevant vendored doc under `docs/tunecamp/`). Do this alongside the changelog+version bump above, not as a separate pass.

## Work Guidance

- Root `package.json` workspaces include `webapp` — installing at repo root covers both.
- `postinstall` runs `scripts/patch-ffmpeg.js` and `scripts/patch-slsk.js`; don't remove without checking why they exist (native module patches).

## Verification

- Backend: `npm test` (Jest, ESM via `--experimental-vm-modules`)
- Webapp: `npm --prefix webapp test` (Vitest) / `npm --prefix webapp run lint`

## Child DOX Index

- [src/server/AGENTS.md](src/server/AGENTS.md) — backend
- [webapp/AGENTS.md](webapp/AGENTS.md) — frontend
- [contracts/AGENTS.md](contracts/AGENTS.md) — smart contracts
