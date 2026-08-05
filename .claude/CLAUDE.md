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
- **The old ZEN P2P graph (`zendb.service`, `zen.worker`, `gun`) is fully removed** (PR #370, 2026-06-15) and must not be reimported.
- Instance discovery uses **federated HTTP** (NodeInfo `/.well-known/nodeinfo`, `/peers` endpoint, gossip crawler).
- **ZEN SEA identity was reintroduced via the `fid` package** for cross-instance SSO and portable cryptographic identity — see Federation & Auth below. This is a crypto identity layer (secp256k1 keypair derived from `alias:passphrase`), not the old P2P graph database.
- The main thread must never import the old ZEN P2P graph directly. Ephemeral presence ("who is listening now") and real-time collaborative playlists over P2P are still not implemented — any future work there goes through a worker_thread RPC.

### Federation & Auth
- Auth is **username + password + JWT, per-instance, plus optional FID SSO**.
- FID SSO (`POST /api/auth/zen/sso`, `src/server/routes/auth/zen.ts`) uses the `fid` package (`FidChallengeManager`, `FidPassportIssuer`, `FidSsoHandler`) to verify a signed SSO token and derive a deterministic Ed25519 ActivityPub keypair from the user's Zen SEA master key. This is the portable cryptographic identity across instances.
- Users authenticating via FID are looked up by `zen_pub`, never by username alone, so a colliding local handle can't be hijacked via SSO. `zen_pub` holds the Zen SEA secp256k1 public key, which is the same on every instance — that is what makes the identity portable.
- **First-time Zen SEA binding uses `POST /api/auth/zen/set`, not `/link`.** `/link` looks the account up *by* `zen_pub`, so it can't be used to set one for the first time (chicken-and-egg). `/set` instead trusts the caller's existing JWT session, verifies the signed challenge proves ownership of the private key, checks `zen_pub` isn't already claimed by another account (no DB `UNIQUE` constraint on that column — every writer must check manually), then writes it — and nulls `zen_priv`, since that vault holds the *previous* pair. Portal/website "Sign Challenge" flows must produce a real `Zen.sign` signature and point back at `/set`, never fabricate a signature client-side.
- **`zen_priv` is a client-sealed vault, not a server-held secret.** It is the Zen pair encrypted under the user's password (`encryptPairVault`) and uploaded to `POST /api/auth/zen/keys`; the server stores it opaquely. Since 4.7.0 chat DM E2EE encrypts to `zen_pub` (not a separate chat keypair), so the webapp mints and uploads a vault for any account that has none — every webapp user now has a Zen identity. Never derive the pair from the password: it would become a different identity on every password change. Any password-change path must re-seal the vault (`resealChatIdentity`).
- **`fid_registry` table** records cross-instance artist links a logged-in user has made elsewhere (`instanceDomain`, `artistName/Slug`, `publicKey`, `passportSignature`). Full CRUD lives at `/api/fid-registry` (`src/server/routes/library/fid-registry.ts`), gated by `authMiddleware.requireUser`. The portal/website hold the Zen private key but no instance session, so they can't call this directly — the flow is: portal signs and produces the entry JSON (copy-button), user pastes it into the instance webapp's `FidRegistryCard`, which POSTs it.
- **WebAuthn/passkeys were removed in fid v4** (a passkey is bound to one Relying Party domain, which forked one human into a different identity per portal). Gone with it: `fid_webauthn_credentials`, the trust-on-first-use pinning rule, and the `trustedWebauthnKey` argument to `validateSsoToken`. The table is no longer created; existing DBs keep it orphaned and unused — no `DROP` is issued. Do not reintroduce any of it. Accounts whose `zen_pub` still reads `webauthn:<credentialId>` cannot log in and need re-creating.
- A Zen token carrying its own verification key is safe (unlike the WebAuthn case): the public key *is* the identity, so a token signed by another keypair is simply another user.
- **Requires `fid` ≥ 4.0.0.** `"fid": "github:scobru/fid"` resolves from git, so fid must be pushed and reinstalled before the instance can consume it.
- SSO tokens are single-use (nonce burned by `fid`'s `FidReplayStore`). The `apSeed` in the SSO payload is the domain-scoped ActivityPub key the instance legitimately needs; the user's master secret (their passphrase-derived Zen private key) never leaves their browser.
- ActivityPub federates interactions, not logins for non-FID accounts (Mastodon/Funkwhale model).
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
