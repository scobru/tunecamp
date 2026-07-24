# TuneCamp — AI Session Rules

## DOX - IMPORTANT

- Always run the  "/caveman ultra" "/ponytail ultra" "/honey ultra" plugin/skills at the start of each session.
- If available read the AGENTS.md file in the root directory and list the available agents.

## Git Workflow

- **`dev` is the integration branch — never commit to `main` directly, and never branch off `main` for changes.** All work branches off `dev`: `git checkout dev && git pull` first, then `git checkout -b feat/<name>` or `fix/<name>`.
- **Keep `dev` synced with `main`.** Before starting new work (and before merging anything into `dev`), fast-forward `dev` from the latest `main` so it never drifts behind the released code: `git checkout dev && git fetch origin && git merge --ff-only origin/main` (or `git pull origin main`). Resolve conflicts on a topic branch, not on `dev` directly.
- Feature/fix branches merge into `dev`; `dev` is what gets promoted to `main` for releases.
- **Before every push:** update `CHANGELOG.md` and bump `package.json` version (semver):
  - `patch` (x.x.X) — bug fix, typo, no new feature
  - `minor` (x.X.0) — new backward-compatible feature
  - `major` (X.0.0) — breaking change, removed API, architectural shift
- Open PR with `gh pr create` targeting `dev` (not `main`).
- Multiple concurrent sessions may change branches or unstage the index — always verify current branch and commit atomically with explicit pathspec.

## Architecture Decisions

### Database
- **Stay on SQLite (better-sqlite3, WAL mode).** No Postgres/Redis while single-machine.
- Bottleneck is CPU/concurrency/IO on one process, not the DB.
- Migrate only if: horizontal scale (multi-machine) OR sustained write contention (`SQLITE_BUSY`).

### Filesystem
- **Files are never moved or renamed.** The filesystem is the truth of *where* a file is; the DB holds metadata.
- `consolidateFiles()` has been removed — do not reintroduce it or any logic that moves/renames files.
- `sync-tags` (rewrites ID3 tags from DB) is kept as a manual on-demand action only.
- Dedup by `file_path` via `mergeTracks` is fine; filesystem reorganization is not.

### ZEN / Gun.js
- **ZEN has been fully removed** (PR #370, 2026-06-15). Do not re-import `zen`, `zendb.service`, `zen.worker`, or `gun`.
- Instance discovery now uses **federated HTTP** (NodeInfo `/.well-known/nodeinfo`, `/peers` endpoint, gossip crawler).
- Future plan (Phase C, not yet started): re-add ZEN scoped only to ephemeral presence ("who is listening now") and real-time collaborative playlists — but not for auth, discovery, or social.
- The main thread must never import ZEN. Any future ZEN operations go through a worker_thread RPC.

### Federation & Auth
- Auth is **username + password + JWT, per-instance**. No cross-instance SSO, no portable cryptographic identity.
- ActivityPub federates interactions, not logins (Mastodon/Funkwhale model).
- Transactions (purchases/collections) are local to the artist's instance.
- RSS/Atom feeds can be followed: stored as `remote_actors` with `type='rss'`; items as `remote_content`.

### Publishing & Roles
- **Listeners (`user` role) cannot publish.** No uploads, releases, sales, or social posts.
- Gate: `VisibilityGuardian.canPublishContent()` — root_admin/admin always; super_user (curator) **or** `user` (listener) only when they have a linked artist profile (`artistId`); anyone without an artist link never. The gate is the artist link, not the role.
- "Become an Artist" flow keeps the account's `user` role after admin approval — it links an artist profile that grants publishing via `canPublishContent` (the "Listener-Artist" state). No Curator promotion happens; Curator/Manager elevation is a separate root-admin action. The `listenerSelfPublish` admin flag auto-approves these requests (and auto-publishes their releases).
- Every new publish/sell endpoint must use `canPublishContent`, not raw `artistId` checks.

### Playlists
- Playlists are **members-only** (401 for anonymous). All logged-in users (including Listeners) can create them.
- **Public stage model:** a private track added to a public playlist is deliberately published. This is the curation channel, not a leak.
- Do not make playlists visible to anonymous users or restrict them by role above `user`.
