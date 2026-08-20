# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [5.4.2] - 2026-08-20

### Added

- **Docker Compose out-of-the-box support:** `docker-compose.yml` now defaults the host music volume to `./music` (`${TUNECAMP_MUSIC_PATH:-./music}:/music`) avoiding setup crashes on fresh clones when a custom path is not yet configured.
- **Container healthcheck in Compose:** Added explicit `healthcheck` definition testing `GET /health` with 30s interval, providing immediate container health visibility via `docker ps`.
- **Comprehensive test suites:**
  - `zen.supplementary.test.ts`: Added tests for client-side encrypted vault upload (`POST /api/auth/zen/keys`), instance passport cryptographic verification (`POST /api/auth/zen/verify`), and signature forgery defenses.
  - `misc.routes.test.ts`: Added full endpoint coverage for changelog, waveform SVG streaming, digital assets visibility, NodeInfo 2.0 and library federation, redirects, and RSS/podcast feeds.
  - `identity.manager.test.ts` & `integration.manager.test.ts`: Added real SQLite integration tests covering user CRUD, subscription lifecycles, column allowlist filtering on updates, cloud storage accounts, unlock code minting and redemption, and torrent tracking.
  - `community-sites.test.ts`: Added tests for federated discovery aggregation, gossip sites, ActivityPub actor liveness checks, and cross-protocol deduplication.

### Fixed

- **Async lifecycle in task-manager tests:** Fixed unhandled promises in `task-manager.test.ts` ensuring clean asynchronous teardown without Jest worker leaks.

### Documentation

- Updated `README.md`, `docs/getting-started.md`, `docs/it/getting-started.md`, `.env.example`, and `install.sh` reflecting zero-configuration Docker Compose startup.

### Security

- **`updateUser` and `updateStorageAccount` now write only known columns.** Both built their `SET` clause by interpolating the caller's object keys straight into the SQL — values were parameterised, column names were not. Neither is reachable from user input today: `updateUser` has no callers at all, and `updateStorageAccount` is called twice from `google-drive.service.ts` with literal keys. So this closes nothing that was open; it removes a footgun that the next caller would have had no reason to suspect. Each now filters against an explicit allowlist and returns early when nothing survives the filter. The allowlists match the declared types field for field — `Partial<User>` minus `id`, `Partial<StorageAccount>` minus `id` and `created_at` — so a key the type permits is never silently dropped. Note that the `admin` table carries columns the `User` type does not (`zen_pub`, `subsonic_token`, `token_version`, the `security_*` pair); reaching those needs a purpose-built method, not a wider allowlist.

### Added

- **`ActivityPubService` now has tests for the parts a remote instance can reach.** Coverage stopped short of the surface that actually faces the fediverse, so the security properties of federation rested on reading the code. 414 lines of new cases cover `verifySignature` (valid sha256 and sha512, `(request-target)` pseudo-header, tampered signature rejected, signature checked against a different keypair rejected — the actor-spoofing case, missing required header, unfetchable key, internal error swallowed rather than thrown), `getRemotePublicKey` (cache hit makes no request, cache miss fetches and caches, every failure path returns null), `handleMoveActivity` and `initiateMove` (a `Move` is refused unless the other actor backlinks via `alsoKnownAs`/`aliases`), `importRemoteIdentity` (refused unless the remote backlinks via `movedTo`/`successor`), and `setAlsoKnownAs`.

### Removed

- **`TUNECAMP_CHAT_FEDERATION_SECRET` is gone, along with the last code that read it.** 5.2.0 made inbound verification asymmetric-only, which left the shared secret authenticating nothing — but `sign()` still fell back to an HMAC under it when the site keypair was missing. That fallback could not federate anything: every peer refuses those bytes, so an operator with a broken keypair saw messages leave and never arrive, with no error at the point of failure. `sign()` now throws when there is no `site_private_key`, `fanout()` catches that and skips delivery with a logged error rather than rejecting (`chat.ws.ts` fires it without awaiting, so a rejection would be an unhandled one), and `config.chatFederationSecret` no longer exists. No action needed beyond deleting the variable from your environment; an instance generates its site keypair at boot.

### Fixed

- **An instance no longer crash-loops on `no such table: main.admin_old`.** A legacy migration did `ALTER TABLE admin RENAME TO admin_old`, which makes SQLite rewrite every referencing table's foreign key to follow the new name. The rescue phase dropped the orphan but left those references behind, and with `foreign_keys = ON` SQLite resolves a foreign key target when a statement is *prepared* — so `DELETE FROM peer_sessions` failed before running anything, taking down both the boot-time session purge and every `/ws/peer` upgrade. Reported from a live instance. The rescue phase now repairs the stored schema of any table still pointing at a dropped `*_old`, so an affected database fixes itself on restart with no operator intervention. `peer_sessions` is simply the table a timer touches first: around eighteen tables reference `admin(id)`, and all of them were exposed.
- A startup `foreign_key_check` now reports violations by table instead of being able to take the instance down: the pragma throws on a schema-level mismatch, and a diagnostic must not be fatal.

### Added

- **Every stored chat message now carries an id.** Clients had to recognise a message by sender and timestamp, which drops one of any two that land in the same millisecond. Lobby and room messages are now sent and served with an `id` (`l<row>` / `r<row>` — the two tables are separate AUTOINCREMENTs that share one list on the client, so the row number alone would collide). Scope is the instance: a client talks to exactly one, and a federated message is stored and numbered locally like any other.
- **`auth_ok` announces the chat protocol version this instance speaks.** Instances and clients upgrade on their own schedules, and until now a client had no way to ask what it was talking to: it could only send a frame and wait to see whether an answer came back, which is indistinguishable from a dropped message. `protocol` is 1, and `CHAT_PROTOCOL_VERSION` in `chat.protocol.ts` records when to bump it — only when a client assuming the older shape would get a wrong answer, never for a purely additive frame, since bumping for those trains clients to ignore the field. A client seeing no `protocol` at all is talking to an instance predating this, which is version 0. Only `/ws/chat` is versioned: `/ws/peer` is spoken by the Sidecamp daemon alone, which ships against a known instance, so nothing there has to negotiate.
- **The sender is acked with the id of the message they just sent.** They are skipped in every fan-out, so they had no way to learn it, and the copy their client rendered on send reappeared as a duplicate once history was fetched. `chat_ack` / `room_chat_ack` carry the id, the server timestamp and the client's own `ref` echoed back. Both are additive — a client that does not know them ignores them.

### Documentation

- **The chat docs now collect what the design does not protect against.** The limits were all stated somewhere — plaintext rooms, routing metadata, no durable federated queue — but spread across five sections, so finding them meant reading the whole document, and the largest one was not stated at all: DMs have **no forward secrecy**, since the secret comes from two long-term identities and never ratchets, so one leaked key opens every archived DM for that identity. A *Known limits* section in `docs/chat.md` and `docs/it/chat.md` lists that first, alongside the password that bounds every key, trust-on-first-use pinning, and the fact that the instance serves the very bundle that handles the keys.
- **Rooms are plaintext by decision, and the chat docs now say why.** They already recorded that room messages are not E2EE, but as "not E2EE yet" — which reads as an unfinished feature rather than a settled trade-off. Moderation, admin backlog clearing, and serving history to a member who joins later all require the server to read room messages; group encryption would additionally have to answer who holds the key, how it reaches a late joiner, and what becomes of the backlog when a member is removed. Both `docs/chat.md` and `docs/it/chat.md` now state the reasoning, so rooms are not mistaken for private.

### Fixed

- **One message no longer gets a different timestamp per recipient.** `Date.now()` was read inside the delivery loop, so every client was told a different `ts` for the same message and none of them matched the row that was stored. A federated lobby message was likewise stored under the receiving instance's clock while being relayed under the sender's.

## [5.4.1] - 2026-08-10

### Added

- **Prominent room header and deletion controls in Peer Chat.** When inside a room, an active room banner now displays the room title, privacy badge, member count, and explicit action buttons to Leave or Delete the room (available to room creators and instance admins/moderators).
- **Admin moderation support for chat rooms.** Server and client now allow site administrators and moderators to delete any chat room, not strictly limited to the creator.

### Fixed

- **Room action buttons accessibility in sidebar.** Room management buttons in the sidebar are no longer completely hidden on touch devices/mobile without hover. Creator matching is now case-insensitive and resilient to username resolution timings.

### Added

- **The chat page can now accept a peer's changed encryption key.** `@tunecamp/chat` pins a peer's key on first sight and blocks DMs when a different one is later offered, since the server picks which key it hands out and a silent substitution is indistinguishable from a wiretap. The page told the user to verify the new fingerprint but exposed no way to act on it, so DMs to that peer stayed blocked for good — the only escape was deleting the `tunecamp_chat_pin_*` entries from localStorage by hand. The composer now shows both fingerprints with an explicit "Accept new key" confirmation, and the connected-peers list flags the peer instead of showing it as E2E-ready.

### Fixed

- **A refused message no longer wipes the draft.** `sendMessage` became async and refuses a DM it cannot encrypt, but the page tested its return value as if it were a synchronous boolean — a Promise is always truthy, so the input was cleared on every send. The user was left with a "message not sent" notice and nothing to retry with. The draft is now cleared only once the message is on the wire, and the send button is disabled while that is in flight.

## [5.3.0] - 2026-08-07

### Added

- **Federated chat deliveries now retry a transient failure.** Fan-out previously discarded every outcome through `Promise.allSettled`, so a peer that was restarting lost the message with nothing logged. A network error, `5xx` or `429` is now retried after 2s, 8s and 30s; a `4xx` other than `429` is not, since the peer refused the message on its merits and resending the same bytes cannot change the answer. Retries are bounded by the receiver's freshness window rather than an attempt count alone — a retry carries the original signed `ts`, so past 5 minutes no delay could still get it accepted, and the attempt is abandoned with a logged warning. Deliberately not durable: unlike `ap_delivery_queue`, anything surviving a restart would already be too stale to deliver. `stopRetries()` is called during graceful shutdown.

### Documentation

- Documented what the chat server actually stores. Direct messages are never persisted, locally or on receipt from a peer — only lobby and room traffic reaches SQLite, and no table records who messaged whom. Also documented the routing metadata a peer necessarily sees in flight, the delivery/retry semantics, and why the protocol is federated rather than peer-to-peer.

## [5.2.0] - 2026-08-07

### Security

- **The shared-secret fallback for federated chat signatures is gone.** `verify()` is asymmetric only: a message whose sender cannot be pinned to one host is refused rather than half-trusted. Previously a peer that published no resolvable key was authenticated by `chatFederationSecret`, which every instance in the federation holds — so a valid signature proved "some peer", never which one. This was reachable for any claimed instance, not only known ones: `verify` runs *before* the known-peer check, so an unknown claimant's HMAC signature verified and was stopped only by the later `403`. `/inbound` now fails closed on a missing `site_public_key` alone; the secret no longer stands in for it.
- **Key resolution now prefers the peer's own origin.** A peer whose NodeInfo advertised an `actorId` on another host — a `publicUrl` misconfiguration — never resolved a key and silently fell back to the shared secret. The advertised path is now tried on the peer's origin first, and only then the advertised URI, so the key trusted for an instance comes from that instance. The resolved key is cached under the URI it was actually fetched from.

### Changed

- An instance outside the peer list is now refused at `401` (no origin from which to resolve a key) rather than reaching the `403` unknown-peer response.
- **Wire-compat break: cross-instance chat now requires peers on 5.2.0 or later.** A peer on an older release still accepts shared-secret signatures, and one before 5.1.0 signs with the secret while already publishing a site key. Upgrade both sides. `TUNECAMP_CHAT_FEDERATION_SECRET` is obsolete: it authenticates nothing on receipt, and survives only as a last-resort signing input for an instance missing its site keypair — a signature every peer now refuses.

## [5.1.0] - 2026-08-06

### Security

- **A federated chat message could be downgraded from the sender's own key to the shared federation secret.** `verify()` checked the claimed peer's published ActivityPub key first, but on any failure — bad signature, key not resolvable, peer momentarily unreachable — it fell through and accepted an HMAC minted with `chatFederationSecret`. That secret is held by every instance in the federation, so anyone with it could sign as any user of any host simply by making the asymmetric check fail. A resolved key is now conclusive: the message is accepted or refused on that key alone. The shared secret is still accepted, but only from a peer that publishes no key at all.
- **The inbound route loaded its peer list after verifying the signature.** Key resolution walks that list to map a claimed instance name onto an origin, so on the first inbound message of a process the list was empty, no key ever resolved, and the weaker path was taken for a peer that had a perfectly good key published. `setPeers` now runs before `verify`.

### Changed

- **Cross-instance chat federation now requires peers on 5.1.0 or later** wherever both sides publish a site actor key. An instance still running an older release signs with the shared secret while publishing a key, and those messages are now refused. Upgrade peers before relying on cross-instance chat; a peer with no `site_public_key` keeps working over the legacy secret.

## [5.0.0] - 2026-08-06

Major because API surface was removed and two authentication paths changed
behaviour, not because of the size of the change.

### Security

- **The account password was stored in cleartext-recoverable form for every user who had ever logged in.** Subsonic's token auth is `md5(password + salt)`, so the server needs a secret it can read back, and `authenticateUser` satisfied that by writing the real password into `admin.subsonic_password` encrypted under `JWT_SECRET` — on every login, for every account, whether or not it ever touched Subsonic. A database dump plus `JWT_SECRET` therefore yielded the credential users reuse on other sites. Subsonic now authenticates against a random per-user **app password** (`admin.subsonic_token`), generated on demand and revocable, and the login path stores nothing.
- **The Zen identity vault was sealed with an unstretched password.** `Zen.encrypt(pair, password)` derives its AES key with a single SHA-256, so an attacker holding `zen_priv` could test billions of candidate passwords per second offline. The vault is now `tcv1:<iterations>:<saltHex>:<zenBlob>` with PBKDF2-HMAC-SHA256 at 600 000 iterations over a 16-byte random salt. Iterations and salt travel with the blob so the cost can be raised later; a blob declaring fewer than 100 000 iterations is refused, since otherwise a hostile server could pick a cost it can brute-force. Pre-existing vaults still open and are re-sealed at the next login.
- **Peer chat keys are pinned trust-on-first-use.** The server decides which key it hands out, so holding a key proved nothing about whose it was. The client now pins `SHA-256(pub)` truncated to 128 bits per peer and refuses any later key that hashes differently: the pinned key stays in force, the new one is quarantined, and the UI is told. Only an explicit user action (`acceptPeerKeyChange`) — meant to follow an out-of-band fingerprint comparison — re-pins.
- **A DM with no usable recipient key was sent in plaintext.** The sender had no way to notice, and withholding a key is something the server can do at will, so this was a downgrade under its full control. Such a message is now refused with an explanation instead.
- **The server no longer returns a private key.** `GET /api/auth/status` and the password-change response both included `pair`. `zen_priv` is a client-sealed vault by design, so the server had no business handing key material back at all; the vestigial server-custody helpers behind it (`getUserPair`, `updateZenPair`, `encryptZenPriv`, `decryptZenPriv`) had no callers and were removed.

### Changed

- **Subsonic clients must be reconfigured with an app password.** Generate one under Profile → Settings → Subsonic Password; it is shown once. Existing clients keep working during a deprecation window, because `getSubsonicSecrets` still accepts the `subsonic_password` row written by earlier releases — but new logins no longer create that row, so accounts registered or password-changed from this release on have only the app password. Once this release has been deployed long enough for users to mint one, clear the column (`UPDATE admin SET subsonic_password = NULL`) and drop it.
- **`@tunecamp/chat` must be reinstalled** (`github:scobru/tunecamp-chat` ≥ 2.0.0). The vault format, the pinning gate and the plaintext-DM refusal all live in the shared library.

### Added

- **`SubsonicPasswordCard`** in Profile → Settings, with `GET`/`POST`/`DELETE /api/auth/subsonic-password` (`requireUser`, creation rate-limited to 10 per 15 minutes). Rendered for every account, including FID-only ones: those have no local password at all, so this is their first route onto Subsonic.

### Fixed

- **Subsonic secret-based auth ignored `is_active`.** The role lookup selected `id, role, artist_id` but tested `user.is_active !== 0`, which is always true on a row that lacks the column — so a deactivated account kept its role and `artist_id` over Subsonic.

## [4.7.0] - 2026-08-05

### Changed

- **Chat E2EE now uses the account's Zen identity instead of a chat-only, password-derived keypair.** DMs are encrypted to `admin.zen_pub` — the same key FID uses for cross-instance SSO — so a fetched public key can be checked against the account rather than trusted because the server said so. The pair is random and sealed under the user's password (`encryptPairVault`, stored opaquely as `zen_priv`), never derived from it: a derived pair silently became a different identity on every password change, and the old `deriveKeyPairFromPassword` is deprecated.
- **Every password change re-seals the vault.** `ChangePasswordCard` and `SetupWizardModal` now call `resealChatIdentity(newPassword)`; without it the vault stays encrypted under the old password and the next login cannot open it, losing the identity and every DM addressed to it.
- **`POST /api/auth/zen/set` clears `zen_priv` when it writes a new `zen_pub`.** A stale vault would otherwise pair a new public key with a private key that does not match it.
- **Local password login now returns `zenPub`/`zenPriv`/`zenAuthMode`**, so the webapp can open the vault (or mint and upload one for an account that has no identity yet). This means webapp accounts acquire a Zen identity on signup rather than only via FID.

### Security

- **`GET /api/chat/pubkey/:username` prefers the account identity and labels what it returned** (`source: "identity" | "session"`). It also answers for offline users, since the key lives on the account. The chat client refuses to let a WebSocket-announced session key overwrite an already-resolved identity key, closing a downgrade path where a malicious relay could substitute a key it controls.
- **A client whose account has a `zen_pub` but no vault does not mint a second pair** (identity bound from the FID portal, private half never uploaded). It degrades to no E2EE rather than forking one account into two identities.

## [4.6.1] - 2026-08-05

### Security

- **Federated chat messages were replayable forever.** The HMAC covers `ts` but nothing checked it, so once a captured message aged out of the 5-minute dedup window it could be re-posted indefinitely and would be relayed again. `ts` must now be within 5 minutes in the past and 1 minute in the future (clock skew) — otherwise `401`. The dedup window was widened to 6 minutes so an entry can never expire while its message is still fresh enough to re-enter.
- **The message `id` was taken from the request body but not covered by the signature.** A peer could therefore choose the dedup key and pre-seed it with the id of a message it wanted suppressed, silently censoring it. `id` is now always recomputed from the signed fields on ingest and ignored on the wire.
- **`/api/chat/federated/inbound` accepted any `instance` the sender claimed.** The claimed origin must now resolve to a peer already known to federated discovery, else `403`; the peer list is refreshed from `federatedDiscoveryService` on every inbound request so a receiver that has never sent anything is not left with an empty list. Note the remaining limit, now documented in `docs/chat.md`: the HMAC secret is shared federation-wide, so a valid signature proves *some* peer, not *which* peer — per-peer secrets are still not implemented.

### Changed

- **An instance that has not yet discovered a peer now rejects that peer's chat messages** (`403`) instead of relaying them. Federation requires mutual discovery, not just the shared secret.

## [4.6.0] - 2026-08-04

### Security

- **Chat room REST routes trusted `?username=`.** `POST /api/chat/rooms`, `DELETE /rooms/:id` and `/rooms/:id/join|leave` fell back to a query parameter for the acting user (`req.user?.username` is never set — the middleware exposes `req.username`), so any authenticated member could create, delete or join rooms as anybody else. They now take the identity from the authenticated session only.
- **Federated chat signing input was ambiguous.** The HMAC was computed over the fields joined with `|`, and `text` is attacker-controlled, so two different messages could produce the same signing input. Fields are now JSON-encoded before signing. Signature comparison is constant-time.

### Fixed

- **Federated room messages could never be delivered.** The sender signed `roomId`/`roomName` but `/api/chat/federated/inbound` rebuilt the payload without them, so the MAC never matched (`401`). The inbound route now carries every signed field through.
- **Rooms are addressed across instances by a new `global_id` UUID** instead of the local `AUTOINCREMENT` id, which means a different room on every instance. Existing rooms are backfilled on startup. A room message for an unknown `global_id` is dropped instead of being delivered into an unrelated local room; private rooms are no longer federated at all, since membership is not federated yet.
- **`/api/chat/federated/*` built its own `ChatFederationService`**, so inbound traffic used a dedup window separate from outbound fanout, and `GET /api/chat/federated/peers` always returned `[]`. The routes now use the container's service; the dead `/peers` route is removed (`GET /api/community/peers` already exposes it).
- **REST room leave was a silent no-op**: it called `leaveRoom()`, which expects a socket id, with a username.
- **Docker build failed on Apple Silicon at the `npm ci` layer.** The arch is now read with `uname -m` instead of the `TARGETARCH` build-arg, whose `=amd64` default silently wins under the classic builder and installs x64 musl binaries of rollup/lightningcss/oxide on an arm64 host (`EBADPLATFORM`).
- **Fediverse actors did not exist for accounts created by registration or FID SSO.** Actor keys were only generated in `POST /api/auth/login`, which neither path goes through, so `/users/<handle>` returned 404 while the profile page advertised the handle. Registration now generates them and SSO persists the `apSeed`-derived keypair.

### Added

- **`GET /api/users/me/fediverse`** returns the caller's real handle, actor URI and whether the actor exists. The profile panel is driven by it and hides itself when there is no actor, instead of guessing the handle client-side.

### Changed

- **Cross-instance chat federation requires both peers on ≥ 4.6.0.** The signing input changed, so a 4.5.x peer's messages fail verification and vice versa.

## [4.5.9] - 2026-08-04

### Security

- **FID-only accounts could be given a working local password through the recovery flows.** An account with `zen_auth_mode = 'zen'` authenticates solely through its Zen keypair and is stored with an empty `password_hash`; `changePassword` already refused such accounts, but `resetPasswordWithToken` and `resetPasswordWithSecurityQuestions` wrote `password_hash` with no check, and `setSecurityQuestions` let one arm the recovery path in the first place. That meant a portable cryptographic identity could be silently converted into one takeable with a password — via security questions, two guessable answers were equivalent to the Zen private key. All password-write paths now reject FID-only accounts, and `createPasswordResetToken` no longer issues tokens for them. The reset paths fail with the same generic response as a bad token or wrong answers, so they don't reveal that the account exists but is FID-only.

### Fixed

- **"Change password" and "Security questions" no longer appear in Settings for FID-only accounts.** Both cards were dead ends — the API rejected every write — and `POST /api/auth/password` reported the misleading "Current password is incorrect" instead of explaining that the account has no password. The profile now shows why there is nothing to change, and the endpoint returns a clear 400.

- **Zen SSO integration tests (`zen.integration.test.ts`) failed in CI with HTTP 500 on the valid-token paths.** The route's `db.prepare` mock returned `{ get, all }` for its default branch but no `run`, so any `UPDATE`/`INSERT` it issued threw `db.prepare(...).run is not a function`. The mock now returns a complete prepared-statement stub (`get`/`all`/`run`) for every query; the production route's `db.prepare(...).run()` is correct better-sqlite3 usage, and all 16 Zen tests pass again.

## [4.5.8] - 2026-08-04

### Fixed

- **Instances with a leftover `admin_old` table crash-looped on startup with `SqliteError: FOREIGN KEY constraint failed`.** The startup "Rescue Phase" (`database.ts`) drops orphaned `<table>_old`/`<table>_new` artifacts left by an interrupted migration, but ran with `foreign_keys = ON`. When the legacy multi-user migration in `auth.service.ts` did `ALTER TABLE admin RENAME TO admin_old`, SQLite rewrote every referencing table's foreign key (`tracks.owner_id`, `albums.owner_id`, `api_tokens.user_id`, …) to point at `admin_old` — so once those tables had rows, the cleanup `DROP TABLE admin_old` could never succeed and the server failed to boot on every restart. Both the Rescue Phase and the original rename/recreate/drop sequence now run with foreign keys disabled (the latter wrapped in `try`/`finally` so they are always re-enabled). Existing broken installs are repaired automatically on the next start; no data is affected, as `admin_old` was already a dead duplicate.

## [4.5.7] - 2026-08-04

### Removed

- **Dead Soulseek integration surface removed from the instance and docs.** Soulseek/BitTorrent acquisition was moved entirely to the companion [Sidecamp](docs/sidecamp.md) desktop app; the instance itself never re-registers a Soulseek provider (`registerBuiltInDownloadProviders()` registers nothing) and had no `search/content/soulseek/*` backend route. Removed the now-dead `SLSK_USER`/`SLSK_PASS` env vars (`.env.example`, docs), the `soulseek` field from `useConfigStore`'s `HealthStatus`, the 7 `admin.ts` API functions calling the nonexistent `search/content/soulseek/*` endpoints, and the `soulseek_username`/`soulseek_password` config type fields. Corrected doc claims that described Soulseek as an in-instance admin-toggle plugin (`comparison-funkwhale.md`, `community-mode.md`, `LAB.md`) and a nonexistent `soulseek_downloads` DB table (`architecture-backend.md`), in both EN and IT docs.

## [4.5.6] - 2026-08-04

### Fixed

- **Audiofabric (and other Lab apps) rendered a black screen when embedded via iFrame, despite working fine when opened directly on Vercel.** The Lab SDK's `getLibrary` bridge (`LabApp.tsx`) hands iframed apps stream URLs built from `/api/tracks/:id/stream`, which was gated by `strictCors` (restricted to `TUNECAMP_CORS_ORIGINS`) — the cross-origin `<audio>` fetch was silently blocked by the browser, and Audiofabric has no error handling on load failure, so it hung forever. `/rest` (Subsonic) was already carved out as public cross-origin CORS for exactly this reason but `/api/tracks` was missed. Added `/api/tracks` (GET only; mutations still go through `strictCors`) to the public federation CORS list — safe since the route is already per-request authorized via the `?token=` query param, same model as `/rest`.

### Changed

- **TuneCamp Beam lab app disabled by default**, superseded by Wormhole (id 5) which covers the same P2P file-transfer use case. Existing installs are migrated to `enabled = 0` on next startup; the row is kept (not deleted) for id stability.

## [4.5.5] - 2026-08-04

### Fixed

- **Critical: admin login (password and FID) broken after upgrading from a pre-3.11.5 database.** The workspace-wide GunDB→Zen rename (`bf5794f9`) accidentally turned the legacy column migration `["gun_pub", "zen_pub"]` into a self-mapping `["zen_pub", "zen_pub"]`, so `gun_pub`/`gun_priv` were never renamed on databases that hadn't already been migrated. This forced those databases down the "recreate admin table" path, whose schema was missing the `zen_auth_mode` column entirely — every login query selecting it then failed outright, and `zen_pub`/`zen_priv` (needed for FID) were wiped to `NULL` in the process. Restored the correct legacy column mapping, added `zen_auth_mode` to the recreate schema, and added a self-healing `ALTER TABLE` for admin tables already missing the column. Accounts whose `zen_pub` was already nulled by the broken migration need to re-link FID via `/api/auth/zen/set`; password login is restored automatically on next startup.

## [4.5.4] - 2026-08-03

### Security

- `POST /api/auth/zen/keys` let any authenticated user overwrite `admin.zen_pub`/`zen_priv` with an arbitrary `zenPubKey`, with no proof of key possession and no collision check — enough to hijack another account's portable Zen SEA identity. The endpoint now rejects a `zenPubKey` that doesn't match the account's existing one, and blocks first-time binding to a `zen_pub` already claimed by a different account.

### Removed

- Dead code cleanup (knip/fallow): unused files (`src/types/index.ts`, `webapp/src/pages/Favorites.tsx`, `webapp/src/pages/Playlists.tsx`, `webapp/src/services/e2eCrypto.ts`), unused `tweetnacl`/`tweetnacl-util` webapp dependencies and their now-orphaned `@types/extract-zip`, `@types/tar`, `@types/webtorrent`, `@types/dompurify` devDependencies, several unused exported types/re-exports across server and webapp, and two stale `knip.json` ignore entries.

## [4.5.3] - 2026-08-03

### Fixed

- Webapp `tsc -b` build was broken: `@tunecamp/chat`'s dependency `zen` ships no type declarations (`TS7016`), and `useAuthStore.ts`'s local `ChatKeyPair`/`chatKeyPair` type still required `epub`/`epriv` from the old nacl.box scheme, which `deriveKeyPairFromPassword`'s Zen SEA `KeyPair` (`{pub, priv}` only) no longer returns (`TS2739`/`TS2345`). Added `webapp/src/types/zen.d.ts` ambient declaration and dropped `epub`/`epriv` from the local type.

## [4.5.2] - 2026-08-03

### Fixed

- `catalogService.getSettings()` (public `GET /api/catalog/settings`, consumed by the storefront) was missing `adminTreasuryAddress`, `walletAddress`, `adminFeePercentage`, and `web3Enabled` from its allowlist, so `SubscriptionModal` always showed "Treasury address not configured" even when an admin had set one.
- `CheckoutModal.tsx`'s direct-purchase crypto fee-split (`adminFeePct`/`adminTreasuryAddress`/`checkoutAddr`/`ownerAddress`) read from `window.TUNECAMP_CONFIG`, which was never assigned anywhere in the app — the fee-split branch was permanently dead code. `GET /api/payments/onramp-config` now also returns these fields, and `CheckoutModal` consumes them from there instead.

## [4.5.1] - 2026-08-03

### Fixed

- `@tunecamp/chat` dependency was pinned (via lockfile) to commit `79dc33e`, predating `ensurePeerKey` cross-instance pubkey fetch (`8f9e021`) and the ZEN crypto API fix (`1289624`). The deployed client could never resolve a remote peer's key, so cross-instance/DM messages showed `[Encrypted message — key exchange pending]` forever. Reinstalled to pick up latest `main`.
- `chat.ws.ts` now silently accepts the client's redundant `type: "auth"` handshake message (sent on `ws.onopen`, before the real HTTP-upgrade auth result) instead of logging `Unknown message type: auth` on every connect/reconnect.

## [4.5.0] - 2026-08-03

### Added

- Cross-instance DM routing now actually delivers: `chat.ws.ts` resolves the target instance via a real peer origin (`federatedDiscoveryService.resolvePeerByInstance`) and fans out to that single peer, instead of discarding the instance name and never sending. `ChatFederationService.fanout` takes an optional `targetPeer` for this; lobby broadcast (no target) is unchanged.

### Fixed

- `ChatFederationService`'s peer list was never populated in production (`setPeers` was never called), so cross-instance lobby fanout silently had zero peers. Now wired from `federatedDiscoveryService.getPeers()` before each lobby broadcast.
- `POST /api/chat/federated/inbound` now fails closed (503) when `TUNECAMP_CHAT_FEDERATION_SECRET` is unset, instead of accepting/verifying HMAC signatures with an empty key.

## [4.4.3] - 2026-08-03

### Fixed

- `GET /api/chat/history`, `/api/chat/peers`, and `/api/chat/pubkey` now allow cross-origin requests (`sidecamp` desktop app and other P2P clients were blocked by `strictCors` since these routes carry no cookies — auth is Bearer-only, so wildcard CORS on these GET routes carries no CSRF risk).

## [4.4.2] - 2026-08-03

### Removed

- Deprecated `tunecamp-design-system` dependency. Design tokens are now inlined directly in app styles (`tokens.css`).
- Removed `git clone` step for `tunecamp-design-system` from CI workflow.

### Fixed

- Chat username deduplication: `ChatService.register` now accepts optional `userId` and replaces previous sessions for the same user, preventing duplicate lobby entries when browser chat and peer daemon connect simultaneously.
- `npm ci` failures caused by out-of-sync `package-lock.json`. Regenerated lockfile with npm 10.9.2 to match CI's Node 22/npm 10.9 and restore nested `@types/react@18.3.31` / `@types/prop-types` entries.
- Chat E2E keypair (`chatKeyPair`, derived via Zen SEA in `@tunecamp/chat`) is now cached in `localStorage` per username and rehydrated on `checkAuth`, so it survives a page reload instead of being lost (the password isn't kept, so it couldn't be re-derived) and forcing peers back to plaintext until the next login. Cleared on logout.

## [4.4.1] - 2026-08-01

### Added

- Integrated shared `@tunecamp/chat` package ([github:scobru/tunecamp-chat](https://github.com/scobru/tunecamp-chat)) in `webapp`.
- Display of instance domain labels next to peer nicknames in Chat UI (e.g. `admin (sudorecords)`).

## [4.4.0] - 2026-07-31

### Added

- Connected-peers list in the chat UI, and message filtering by the selected peer contact.

### Fixed

- `usePeerChat` reconnect loop: `username` was in the connection effect's dependency array but is set from the socket's own `auth_ok`, so every successful connect tore the WebSocket down and rebuilt it. `refreshPeers` was listed too but unused in that effect. On close the roster is now cleared outright instead of dropping only the local user.

## [4.3.4] - 2026-07-30

### Fixed

- `peer.service.test.ts`: fixed a race in the `requestImport` tests where `ws.send` was inspected synchronously before the real `fs.promises.mkdir` await had resolved, causing `mock.calls[0]` to be `undefined` and leaving a dangling 5-minute import timeout that crashed the Jest worker. Tests now await a `waitForSend` helper that resolves once `ws.send` is actually invoked.

## [4.3.3] - 2026-07-30

### Added

- Test coverage for `src/server/routes/library/tracks.ts`: list/starred/pricing, track create, batch update/delete, localize, star/unstar/rating, lyrics, single-track read/update, cover, metadata match, and stream/download access guards. File goes from 13%/2.7% (stmt/branch) to 73.4%/63.6%.
- Test coverage for `src/server/modules/catalog/catalog.service.ts`: `promoteToRelease`, `setVisibility`, `deleteAlbum`, `deleteTrack`, `batchDeleteTracks`, star/rating helpers, `getSettings`, `getLegalPages`, `getRemoteTracks`, `getRandomTracks`, and `updateAlbum`'s artist-resolution branches. File goes from 14.3%/8.5% (stmt/branch) to 50.3%/45.5%.

## [4.3.2] - 2026-07-30

### Added

- Test coverage for `src/server/middleware/auth.ts`: `requireAdmin`, `requireManager`, `requireRootAdmin`, `requireFidAuth`, `requireWriteAccess`, and the DB-user role/isActive override branch shared by `requireUser`/`optionalAuth`. File goes from 44.5%/46.4% (stmt/branch) to 100%/85.5%.

## [4.3.1] - 2026-07-29

### Removed

- Dead `zen_cache` table, `getGunCache`/`setGunCache`/`clearExpiredGunCache` DB helpers, and `GunCacheEntry` type (zero callers, leftover from removed ZEN P2P graph).
- Dead `publishedToZen` admin API alias (never sent by any client, name collided with FID Zen SSO identity naming). `publishedToZen` alias and `published_to_zen` federation-publish column are untouched.
- Leftover `dgram`/`child_process`/`os`/`zlib`/`stream` entries from webapp's `vite-plugin-node-polyfills` config and the dead `"zen"` alias (pointed at a non-existent `src/zen.js`), both residue of the removed ZEN/ZEN stack.

## [4.3.0] - 2026-07-29

### Added

- Home page shows a "Community Feed" section (latest board messages, public `/api/board/history`) above "Recent Releases" when the instance `mode` is `community` and `boardEnabled` is on — makes the Setup Wizard's `mode` toggle have a visible effect.

## [4.2.0] - 2026-07-29

### Added

- Collab and Lab modules now gated by `hideCollab`/`hideLab` site-settings flags, enforced by `ModuleGuard` on `/collab`, `/collab/:id`, `/lab`, `/lab/:appId` and by `requireModuleEnabled` on `/api/collab`, `/api/lab-apps`, `/api/live`. Sidebar hides Dig/Lab/Collab nav items when their flag is set.

### Removed

- `hideDj` flag removed (superseded by `hideCollab`/`hideLab`) from the site-settings schema, admin route, and `catalog.service.ts` allowlist.

## [4.1.1] - 2026-07-29

### Fixed

- `ZenIdentityCard` (webapp) retried `/api/auth/zen/set` after a failure using the stale challenge — `FidChallengeManager.consumeChallenge` burns the nonce on every attempt past validation (success or failure), so the retry always failed with "Invalid signature, or invalid/expired challenge nonce". A failed submit now clears `challenge`/`signedJsonInput`, forcing the user back to "Genera Challenge".

## [4.1.0] - 2026-07-29

### Added

- **`POST /api/auth/zen/set`** — binds a Zen SEA identity (`zen_pub`) to the currently authenticated (JWT/session) account for the first time. `/link` requires `zen_pub` already set, so it can't be reused for this case; `/set` trusts the session and verifies a signed challenge instead, rejecting if the key is already claimed by another account.
- **`FidRegistryCard`** (webapp Settings/Profile) — lists and lets the user register cross-instance artist links via `/api/fid-registry`, which previously had no frontend caller. The portal/website sign the link and produce a copyable JSON entry; the user pastes it here to persist it server-side.

### Fixed

- `tunecamp-website/profile.html` and the webapp's `ZenIdentityCard` produced fake, unverifiable signatures (`sea_signed_...`) and fabricated passports (`HMAC_...`) instead of real `Zen.sign` output. Both now sign with the actual Zen SEA private key and submit to a real endpoint (`/api/auth/zen/set` for first-time linking).

## [4.0.1] - 2026-07-29

### Fixed

- `GET /api/auth/zen/user/:username/public` returned `cover_path` verbatim as `cover_url`/`album_cover` for releases, playlists, and starred items. `cover_path` is a path resolved server-side against `musicDir` (see `GET /api/albums/:id/cover`) — not a servable URL. Cross-instance clients (FID portal, website profile aggregation) that joined it with `baseUrl` got a broken or, if another route happened to overlap, a wrong image. Now returns `/api/albums/:id/cover` and `/api/playlists/:id/cover` instead.

## [4.0.0] - 2026-07-28

### ⚠️ Breaking

- **WebAuthn/passkey login is removed.** FID dropped it in v4: a passkey is bound to a Relying Party ID (eTLD+1), so the same person logging in through `fid-portal.vercel.app` and through `tunecamp.org` got two different credentials, two different master keys and two different accounts. Identity is now Zen SEA only — a secp256k1 keypair derived from `alias:passphrase`, which is the same on every instance by construction.
- **Accounts whose `zen_pub` is `webauthn:<credentialId>` can no longer authenticate.** A WebAuthn PRF secret is not extractable from an authenticator and cannot be converted into a Zen keypair, so there is no migration path — affected users must create a Zen identity in the portal and be re-linked. Check with `SELECT username FROM admin WHERE zen_pub LIKE 'webauthn:%'` before upgrading.
- **Requires `fid` ≥ 4.0.0.** `"fid": "github:scobru/fid"` resolves from git — fid must be pushed and reinstalled first, or `validateSsoToken`'s changed signature will not match.

### Changed

- `validateSsoToken(ssoToken)` is called with one argument. `fid` v4 removed the `trustedWebauthnKey` parameter along with the trust-on-first-use pinning it enforced: a Zen public key *is* the identity, so a token signed by a different keypair is a different user, not an impersonation of this one.
- `POST /api/auth/zen/sso` no longer looks up or pins credential keys; `zen_pub` is read straight from the token's Zen public key.
- Removed `getFidWebauthnKey` / `registerFidWebauthnKey` from `IdentityManager` and its interface.

### Fixed

- **Two tests failed on Windows for platform reasons, not code reasons.** `resolveSafePath › ...filesystem root` hardcoded the POSIX literal `/foo`, but `path.resolve('/', 'foo')` is `C:\foo` on Windows — the expectation is now computed the same way the code resolves it. `ffmpeg.ts › acquireTaskSlot ...` called `jest.mock('os', ...)` inside the test body, which is not hoisted and never reached `ffmpeg.js`'s dynamic ESM import, so the module used the real core count while the test asserted the mocked one (3 vs 4 on an 8-core machine); the expected limit is now derived from `os.cpus().length` with the same `[2, 4]` clamp as `MAX_CONCURRENT_TASKS`.

### Database

- `fid_webauthn_credentials` is **no longer created** on schema init. Existing databases keep the table, orphaned and unused — no `DROP` is issued, so a downgrade loses nothing. Drop it manually once you are sure you are not rolling back.

## [3.13.0] - 2026-07-28

### Fixed

- **"Add to Registry" in the FID portal could never reach the instance.** `GET /api/auth/zen/challenge` was behind `requireUser` and strict CORS, but the portal is a different origin holding no session for the instance — the browser blocked the request before the route ran (`TypeError: Failed to fetch`). The endpoint now accepts an unauthenticated `?zenPubKey=` and resolves the account with the same `SELECT username FROM admin WHERE zen_pub = ?` lookup `/link` uses, so the challenge is stored under the username `consumeChallenge` will look it up by. Resolving from a caller-supplied username instead would mismatch whenever the account's alias differs from what the caller typed.

### Security

- The opened `/challenge` path hands out nothing but a server-generated nonce and authorises nothing by itself — `POST /link` remains the authenticating step, verifying the Zen SEA signature over `${username}:${nonce}`. It is restricted to requests carrying no cookie or `Authorization` header (a session request still takes the strict-CORS path), returns 404 for a `zenPubKey` no account is linked to, and is now rate limited (30 / 15 min); it previously had no limiter at all.

## [3.12.0] - 2026-07-28

### Added

- **SSO code exchange — the ActivityPub seed no longer travels through the browser.** The portal now POSTs `{ ssoToken, apSeed, mode: "code" }` straight to `POST /api/auth/zen/sso` and receives only a one-time code (2 min TTL, burned on first redemption), which it appends to the callback as `?fid_code=`. The webapp trades it for its JWT on the new `POST /api/auth/zen/sso/exchange`. In code mode the response deliberately contains **no** session token: the portal is a third party and must never hold a session for this instance.
- `POST /api/auth/zen/sso` accepts cross-origin requests (`origin: '*'`, no credentials): the portal is by design a different origin and may be self-hosted, so the signed FID token is the security boundary, not the origin. `/sso/exchange` is excluded and stays under strict CORS — only the user's own webapp may redeem a code.
- Tests covering code mode: a code is returned instead of a session, redeems exactly once, and unknown/missing codes are refused.

### Changed

- The hash-fragment SSO flow (`#payload=`) still works for older portals but is **deprecated**; it puts the derived ActivityPub key in the address bar. It will be removed once the deployed portals are on the code flow.

### Security

- **SSO payloads survived in browser history.** `SsoCallback` read `window.location.hash`, which carries the `ssoToken` and the derived ActivityPub seed, but left it in the address bar and in the history entry — so the back button, session restore, and any later reader of `location.hash` could recover it. The hash is now scrubbed with `history.replaceState` as soon as it is read.
- **WebAuthn trust-on-first-use is now an explicit decision, not a library default.** `POST /api/auth/zen/sso` looks up the pinned key for the `credentialId` and, only when nothing is pinned yet, passes the token's own key as the reference — the assertion still has to verify against it, proving the caller holds the private half — then pins it. `fid`'s `validateSsoToken` no longer accepts a self-declared key implicitly, so the previous code path (passing `undefined` on first login) would have refused every first passkey login.

### Changed

- **Requires `fid` 3.0.0** (single-use SSO tokens, PRF-derived passkey identities, `masterKeySource` as an object, redirect allow-listing). Passkey users' derived ActivityPub keypair changes with this upgrade; accounts are unaffected, since they are keyed by `zen_pub = webauthn:<credentialId>`.

### Added

- Regression test covering the passkey pinning path: a first `/sso` call pins the credential's public key, and a second call signing the same `credentialId` with a different keypair is rejected with "does not match registered credential".

## [3.11.10] - 2026-07-28

### Added

- **FID registry API** (`/api/fid-registry`, `authMiddleware.requireUser`) — CRUD for the logged-in user's cross-instance artist links (`GET /`, `GET /:instanceDomain`, `POST /`, `PATCH /:id`, `POST /:id/verify`, `DELETE /:id`), backed by the existing `fid_registry` table.
- **FID/MCP auth middleware** (`authMiddleware.requireFidAuth`) — authenticates requests carrying an `Authorization: FID <zen_pub_key>` header (for the MCP server), via new `AuthService.getUserByZenPubKey` / `authenticateByFid`.

### Security

- **FID registry endpoints had no ownership check (IDOR).** `PATCH /api/fid-registry/:id`, `POST /api/fid-registry/:id/verify`, and `DELETE /api/fid-registry/:id` operated on any registry entry id without verifying it belonged to the requesting user, so any authenticated user could modify, verify, or delete another user's cross-instance artist link by guessing/enumerating ids. Fixed by requiring the entry to appear in `database.getFidRegistry(req.userId)` before acting on it.
- **FID WebAuthn SSO trusted an attacker-controlled public key.** `POST /api/auth/zen/sso` verified the WebAuthn signature against `masterKeySource.publicKeyPem`, which is part of the client-supplied token payload. An attacker who knew (or guessed) a victim's `credentialId` — public by nature of WebAuthn — could self-sign a token with their own keypair and log in as the account bound to that `credentialId`, since accounts are looked up by `zen_pub = webauthn:<credentialId>` with no username check. Fixed with trust-on-first-use: the public key is now pinned to `credentialId` in a new `fid_webauthn_credentials` table on first login, and every subsequent `/sso` call verifies against the stored key via `fid`'s new `validateSsoToken(token, maxAgeMs, trustedWebauthnKey)` parameter, ignoring the token's self-declared key.

## [3.11.9] - 2026-07-27

### Fixed

- **`npm ci` failing in CI (`Missing: @types/react@18.3.31`, `@types/prop-types@15.7.15`) after the 3.11.8 vite fix.** `@docsearch/react` (pulled in transitively by `vitepress`) declares `@types/react`/`react`/`react-dom` as *optional* peers, and npm's optional-peer resolution isn't deterministic across npm major versions — regenerating `package-lock.json` with local npm 11 silently dropped that nested `@types/react` copy, which `npm ci` (running npm ~10.9 in CI) then flagged as inconsistent. Pinned `"@docsearch/react": { "@types/react": "18.3.31" }` in `overrides` so the nested copy is always included, and regenerated `package-lock.json` with npm 10.9.2 (matching CI's Node 22) so the resolved tree matches what CI actually validates.

## [3.11.8] - 2026-07-27

### Fixed

- **`webapp` build failing with `TS2769: No overload matches call` on `PluginOption`.** `vitepress` (root devDependency) hard-pins `vite@^5.4.14`, which npm hoisted to root `node_modules`. `@vitejs/plugin-react` (used in `webapp/vite.config.ts`) resolved that old v5 `Plugin` type while `vitest`'s own nested `vite@7.x` copy gave `defineConfig`/`PluginOption` a structurally different v7 type, so `tsc` saw two incompatible `Plugin` types colliding in the same config. Pinned `"vite": "^7.3.1"` at the root and ran `npm dedupe`; `vitepress` keeps its own isolated `vite@5.4.21` copy while everything else shares one root `vite@7.x`.

## [3.11.7] - 2026-07-27

### Fixed

- **FID/Zen SSO and Instance Linking never actually verified any cryptographic signature.** `fid` v1.x's `consumeChallenge`/`validateSsoToken` never checked a real Zen SEA signature at all (the "signature" was either absent or an unverifiable HMAC keyed by the signer's own private key), meaning anyone who knew a target's `zenPubKey` could impersonate them through `POST /api/auth/zen/link` or `POST /api/auth/zen/sso`. Upgraded to `fid` v2.0.1, which performs real secp256k1 signature verification (backed by `scobru/zen`). `zen.ts`'s `/link` route now requires and verifies `seaSignature` against the submitted `zenPubKey` before consuming the challenge nonce, and `/sso` awaits the now-async `validateSsoToken` (previously un-awaited, which would have made every SSO login fail outright against the new async API).

## [3.11.6] - 2026-07-27

### Fixed

- **FID/Zen identity linking unreachable for listeners without an artist profile.** `ZenIdentityCard` (the "link your global FID identity" panel) was rendered only inside `ArtistProfileEditor`, which itself only mounts when `activeTab === "artist" && hasArtistProfile` — so a listener with no linked artist profile had no way to reach it at all. Moved to the "Settings" tab of `Profile.tsx` (next to the existing Fediverse/ActivityPub identity panel), which is visible to every authenticated user regardless of artist status.

## [3.11.5] - 2026-07-27

### Changed

- **Renamed legacy `gun_*` DB columns/tables to `zen_*` for naming consistency.** `admin.zen_pub`/`zen_priv`/`gun_auth_mode` → `zen_pub`/`zen_priv`/`zen_auth_mode`, and the `zen_users` table → `zen_users`. This is the FID identity linkage introduced in 3.11.0-3.11.4; the `gun_*` naming was a leftover from the removed ZEN layer and no longer reflected what the columns actually do. Existing databases are migrated in place (`ALTER TABLE ... RENAME COLUMN` / `RENAME TO`) so no data is lost. `zen_cache` (unrelated legacy ZEN sync table) is untouched.

## [3.11.4] - 2026-07-27

### Fixed

- **FID SSO account hijack / everyone landing on the same curator account.** `POST /api/auth/zen/sso` looked up the local account by `username OR alias` and, if `zen_pub` was unset, silently linked that account to the incoming Zen pubkey — so a FID login whose derived username collided with an existing, unrelated local account (or its alias) took over that account's role, including curator/admin. New FID identities also failed outright if no local account already used that exact username. Now looks up strictly by `zen_pub` (the FID identity) first; a new identity always gets a fresh `NORMAL_USER` account, and if the desired handle is taken it's registered under a unique internal username with the requested handle kept as the public alias.

## [3.11.3] - 2026-07-27

### Fixed

- **Private-library tracks leaking into "Jump back in" for unauthorized viewers.** `recentlyPlayed` is persisted to `localStorage` (`usePlayerStore`) and survives logout/account switches on the same browser, so a previous privileged session's private plays stayed visible to anyone using that browser afterward. `Home.tsx` now re-checks each item's `albumVisibility`/ownership against the current viewer (mirroring `VisibilityGuardian`) before rendering, and `logout()` clears `recentlyPlayed` outright.

## [3.11.2] - 2026-07-27

### Fixed

- **Freshly established FID SSO session immediately wiped on login.** The global 401 handler in `services/api/client.ts` cleared `tunecamp_token` and dispatched `auth:unauthorized` on *any* 401 as long as a token existed in `localStorage`, without checking that the 401 belonged to a request that actually used that token. A stale, unauthenticated request fired at page load could resolve after the SSO callback stored a valid token, wiping the brand-new session and reverting the UI to logged-out. Now only invalidates the session when the failing request's `Authorization` header matches the current token.

## [3.11.1] - 2026-07-27

### Fixed

- **FID SSO login silently failing to persist session.** `POST /api/auth/zen/sso` hardcoded `tokenVersion: 0` when issuing the JWT for returning users, instead of reading the account's actual `token_version`. Any user whose tokens had been revoked (logout, password change, admin action) got a JWT that always failed `verifyToken`'s version check — the SSO response reported success but the user was never actually authenticated on subsequent requests.

## [3.11.0] - 2026-07-26

### Added

- **FID (Fediverse-ID) Integration & Instance Passports.** Integrated [`@scobru/fid`](https://github.com/scobru/fid) for decentralized zero-knowledge authentication across independent TuneCamp instances. Refactored server routes `GET /api/auth/zen/challenge`, `POST /api/auth/zen/link`, and `POST /api/auth/zen/sso` using `FidChallengeManager`, `FidPassportIssuer`, and `FidSsoHandler`. New SSO users register as standard Listeners (`NORMAL_USER`), and existing users retain their instance-assigned roles and artist profiles. Added "Sign in with FID" button to `AuthModal.tsx` and updated documentation in `docs/FID-IDENTITY.md` with demo portal `https://fid-portal.vercel.app/` and Zen P2P relay node setup.

## [3.10.2] - 2026-07-26

### Refactored

- **Modularized `api.ts` frontend API client.** Split the 869-line monolithic `api.ts` service object into 7 domain-specific modules under `webapp/src/services/api/` (`auth.ts`, `catalog.ts`, `social.ts`, `admin.ts`, `network.ts`, `media.ts`, `commerce.ts`) with `client.ts` handling shared Axios/error instance and `index.ts` providing a backward-compatible barrel re-export. Moved `PublicProfile` and `NowListeningEntry` types into `webapp/src/types/index.ts`.

## [3.10.1] - 2026-07-26

### Changed

- **Scheduled jobs extracted from `server.ts`.** New `src/server/core/scheduler.ts` (`scheduleRecurring`, `scheduleOnce`) replaces 4 inline `setTimeout`/`setInterval` blocks (federated discovery crawl, off-peak library scan, RSS refresh, community follow sync). Jobs are now cancelled on graceful shutdown, closing a timer leak.

## [3.10.0] - 2026-07-25

### Added

- **Collab.** New native feature for multi-artist collaborative track building on a single instance: `collab_projects` (shared/private visibility), append-only `collab_versions` (`UNIQUE(project_id, version)`, never overwritten), and `collab_stems` (raw in-progress audio layers, separate from `tracks`/`samples`). Write access (create project, upload stem, save version) gated by `VisibilityGuardian.canPublishContent()`; open collaboration — any artist on the instance can contribute to a shared project; delete restricted to the project creator. `GET/POST /api/collab`, `GET /api/collab/:id`, `DELETE /api/collab/:id`, `POST /api/collab/:id/versions`, `POST/GET/DELETE /api/collab/:id/stems`. Webapp: new `/collab` (list + create) and `/collab/:id` (stems, version history, snapshot save) pages, linked from the sidebar. No ZEN/realtime — versioning-only, matching the ZEN-removal architecture decision; live presence/collaboration deferred to the already-planned Phase C ZEN-via-worker_thread work.

## [3.9.0] - 2026-07-24

### Added

- **Sample pack cover images.** `POST /api/sample-packs/:id/cover` uploads a cover image for a pack (owner/manager only); `GET /api/sample-packs/:id/cover` serves it, falling back to a generated placeholder. Pack cards, the pack detail page, and "My Samples" now show the real cover instead of a static icon.
- **Pack-aware "My Samples" management.** The admin/self-service samples list now groups a user's sample packs into their own section (cover editable in place, pack-level delete) and excludes their member files from the loose-samples table, instead of listing packed files as indistinguishable standalone samples.

## [3.8.0] - 2026-07-24

### Added

- **Sample packs.** New `sample_packs` table (`samples.pack_id` FK). `POST /api/sample-packs` uploads multiple files at once under one pack (same publish/auto-approve gate as single samples); `GET /api/sample-packs`, `GET /api/sample-packs/:id` (pack + its samples), `PUT`/`DELETE`, moderation `approve`/`reject` (cascades to child samples). Public `/api/samples` listing excludes packed samples so they only surface via their pack. Webapp: pack cards on `/samples`, new `/samples/pack/:id` detail page, and the upload modal now accepts multiple files to create a pack.

## [3.7.0] - 2026-07-24

### Added

- **Sample waveform preview.** New `GET /api/samples/:id/waveform` (SVG, reuses `WaveformService`). `/samples` cards now show a real waveform as the cover art, with hover-to-preview playback (mouse enter plays, mouse leave stops) instead of a plain gradient placeholder.

### Fixed

- **`artistName` was never populated on samples.** `SampleRepository` never joined `artists`/`admin`, so uploads without a linked artist profile (e.g. root-admin uploads) always showed as "undefined"/missing artist. Now resolves `artists.name` → `attribution_name` → uploader's username → `null`.

## [3.6.0] - 2026-07-24

### Added

- **Inline sample preview.** `/samples` cards now play/pause in place (single shared `<audio>`, progress bar over the cover art) instead of requiring a full download to hear a sample.

## [3.5.1] - 2026-07-24

### Fixed

- **Samples not visible on `tunecamp-website`'s community showcase.** `/api/samples` was missing the `publicFederationCors` wildcard CORS policy already applied to `/api/community` and `/api/catalog`, so cross-origin `fetch()` calls from the website were silently blocked by the browser.

## [3.5.0] - 2026-07-24

### Added

- **Public Samples showcase (`/samples`) + `hideSamples` module toggle.** New public browse page mirroring `/store` (search, download, license/BPM/key display), listed in the sidebar and gated by `ModuleGuard`. Added `hideSamples` as a full `ModuleFlag`: threaded through `useSiteSettingsStore`, `AdminSettingsPanel`'s "Customize Modules" tab, and server-side via `requireModuleEnabled` on `/api/samples` (mirroring `/api/dig`'s gate — previously ungated server-side).
- **"Sound Designer" setup-wizard preset.** New `SetupWizard` preset (community mode, samples-focused: store/network/live/dig/dj hidden, social + samples + self-publish enabled) alongside Solo Artist/Record Label/Curator/Streamer.

## [3.4.0] - 2026-07-24

### Added

- **Samples frontend.** Free-sample upload/browse/moderation now reachable from the webapp: a "Free Sample" card on `/publish` (`UploadSampleModal`), a "Samples" tab on `/my-music` (`AdminSamplesList`, list/download/delete own uploads), and a "Sample Curation" tab on `/admin` (`SamplesCurationQueue`, approve/reject pending) for root-admin/admin/super-user. Reuses the existing `/api/samples*` endpoints and `VisibilityGuardian` gates — no new backend surface.

### Documentation

- `docs/api-contracts.md`: documented `/api/samples*` endpoints.
- `tunecamp-website/usecases.html`: added "Beatmaker & Producer" use case for free samples.

## [3.3.0] - 2026-07-24

### Added

- **Free samples/sample-pack content type.** New `samples` table + `SampleRepository`, mounted at `/api/samples`: list (approved-only public, `?mine=true` for own uploads), detail, download (with download-count tracking), upload, edit, delete, and moderation (`/moderation/pending`, `/:id/approve`, `/:id/reject`). Publishing gated by the existing `VisibilityGuardian.canPublishContent()` — no new capability or role added; ownership/moderation gated by `canManageItem`/`MANAGE_PRIVATE_LIBRARY`, matching tracks/releases. Auto-approves for admins/root-admins/super-users or when `listenerSelfPublish` is on, otherwise pending moderation.

## [3.2.1] - 2026-07-24

### Fixed

- **Duplicate instances in the federated community/peers list.** `buildCommunitySites()` merged NodeInfo-crawled sites (`federated_instances` table) and followed ActivityPub site actors without deduping — an instance discovered both ways (gossip crawl + AP follow) showed up twice, once tagged `federated` and once `activitypub`. Now dedupes AP actors against already-known crawled origins before merging.

## [3.2.0] - 2026-07-23

### Added

- **Peer guest mode.** `/ws/peer` now accepts connections without a JWT `token` when the `peerGuestEnabled` setting is on: connects as `(Guest) <name>` (sanitized `guestName` param or a random hex suffix) with a virtual negative `userId`. Requires `peerEnabled` regardless of guest/authenticated path.
- **E2E public key relay for peer chat.** New `pubkey` message type: server stores each session's Curve25519 public key and broadcasts it to connected peers on exchange. Server remains an opaque relay — it never sees plaintext, only forwards keys for client-side encryption (see `tunecamp-sidecamp` `e2eCrypto.ts`).
- **Lobby broadcast in peer chat.** `relayChat` with an empty `toUsername` now broadcasts to every other connected peer session instead of being silently dropped.

## [3.1.5] - 2026-07-22

### Fixed

- **Subsonic `formatAlbum`/`formatArtist` N+1 queries.** Both ran a per-row `isStarred()`/`getItemRating()` lookup for every album/artist in a list response, with no bulk prefetch (tracks already avoided this via `formatTracksBulk`). Added `formatAlbumsBulk`/`formatArtistsBulk`, prefetching starred status as a `Set` and ratings as a `Map`; `getIndexes`/`search`/`getStarred` now call the bulk variant instead of looping the per-row formatter.
- **Album covers served with caching disabled (`maxAge: 0`)** while track/artist images used `maxAge: 86400000`. Aligned album covers to the same 24h cache.

See `docs/PERFORMANCE-AUDIT.md` for the full cross-repo (tunecamp/sidecamp/graphofone) performance audit this was drawn from.

## [3.1.4] - 2026-07-21

### Fixed

- **Production Docker build and CI's "Webapp build" job both failed with `Cannot find module 'tunecamp-design-system'`.** `webapp/package.json` depends on it via `file:../../tunecamp-design-system`, a sibling repo checked out next to `tunecamp` only on developer machines — neither the Docker build context nor the GitHub Actions checkout has that sibling directory, so `tsc -b`/`vite build` failed resolving the module and its types in both places. The Docker builder stage now `git clone`s `scobru/tunecamp-design-system` to `/tunecamp-design-system` (the same location `file:../../tunecamp-design-system` resolves to from `/app/webapp`) and runs `npm ci` there before installing `tunecamp`'s own dependencies; the `webapp` CI job does the equivalent clone to `../tunecamp-design-system` before its `npm ci`. Both rely on the package's `prepare` script (`npm run build`) to produce `dist` during that `npm ci`.

## [3.1.3] - 2026-07-21

### Fixed

- **README ecosystem list still cited `tunecamp-peer` as a standalone project.** Its reverse-WebSocket-tunnel peer file-sharing was absorbed into Sidecamp; the README's own `sidecamp` bullet already describes it. Removed the stale duplicate `tunecamp-peer` entry.

## [3.1.2] - 2026-07-21

### Fixed

- **Server crash-loop on startup when a library artist already owns the site actor's reserved slug or name.** The site actor (`id = -1`) bootstrap in `database.ts` and the two self-healing paths in `artist.repository.ts` (`getById`/`getByIdSimple`) inserted/updated the reserved `slug`/`name` unconditionally, so if a scanned music-library artist had already claimed either (both columns are `UNIQUE`) — e.g. slug `sudo-records`, or name matching the configured `siteName` — the insert hit `SQLITE_CONSTRAINT_UNIQUE` and the process died before the HTTP server could bind, restarting endlessly. All three sites now free the colliding artist's slug/name (suffixed rename) before claiming them for the site actor. Deduped the two repository copies into `ArtistRepository.ensureSiteActor()`.

## [3.1.1] - 2026-07-21

### Fixed

- **CI: pinned exact React versions in `webapp/package.json` and added root-level `overrides` to collapse the dependency tree to a single React copy.** `npm ci` was failing non-deterministically because unpinned `^19.2.0` caret ranges for `react`/`react-dom`/`@types/react`/`@types/react-dom` let different install passes resolve different patch versions, which `npm ci`'s lockfile validation flagged as stale. Beyond that, npm workspaces hoisting split `react` into two live copies — root `node_modules/react@18.3.1` (needed by `vitepress`'s `@docsearch/react`, plus hoisted there for webapp's own `@testing-library/react`, `@tanstack/react-query`, `react-router-dom`, `react-hot-toast`, `react-i18next`, `zustand`, `lucide-react`) vs `webapp/node_modules/react@19.2.5` (used by webapp's own source) — causing `Objects are not valid as a React child` failures in `Search.test.tsx` and `ThemeSwitcher.test.tsx`. Added `overrides` forcing `react`/`react-dom` to the pinned `19.2.5` tree-wide, with an explicit exemption keeping `color-thief-react`'s isolated legacy React 16 copy untouched.

## [3.1.0] - 2026-07-20

### Added

- **Per-listener track-count cap, with a Stripe track-slot topup to raise it.** Listeners are now limited to `listenerTrackCap` tracks (a new global admin setting, 0 = unlimited) unless a per-user `track_quota` override is set on their admin row. `POST /tracks` upload now enforces the effective cap independently from the existing storage-quota check, returning 413 with the current usage when exceeded. Root admins can set `trackQuota` per user via `POST/PUT /admin/system/users`; a value below the user's purchased floor (`track_quota_floor`) is clamped up rather than rejected. `POST /api/payments/stripe/create-trackcap-session` lets an authenticated listener buy `trackcapTopupTracksGranted` extra slots for `trackcapTopupPriceUsd` (both new admin settings); the Stripe webhook's `trackcap_topup` branch calls `AuthService.addPurchasedTracks` on completion, which raises both the quota and its floor so a later admin override can't undercut a paid purchase.

## [3.0.1] - 2026-07-20

### Fixed

- **Built-in Lab apps now point to their deployed URLs.** The `lab_apps` seed/migration rows for 4-Track Recorder and Audiofabric now target `tunecamp-4-track-recorder.vercel.app` and `tunecamp-audiofabric.vercel.app` instead of the old `4track.cc` / locally-bundled path, with a runtime `UPDATE` so existing installs migrate too.
- **`LAB.md` (and its Italian mirror) rewritten to match the real Lab apps architecture.** The docs still described a static `webapp/src/data/labApps.ts` registry array; Lab apps have actually been DB-backed (`lab_apps` table, admin API, Admin panel) for a while. Also corrected `id` from a string slug to the numeric DB row id, and dropped stale "PostMessage bridge not yet implemented" language in `STATUS.md` — it's implemented. `source-tree-analysis.md` and `audiofabric.md` (plus Italian mirrors) updated to match.

## [3.0.0] - 2026-07-17

### Removed

- **BREAKING: instance-side SSO handoff removed.** The karma/reputation system it was built to support (see `docs/karma.md`) has been shelved as unnecessary complexity for what it would actually deliver, so its only prerequisite goes with it. Removed `POST /api/oauth/authorize` (`src/server/routes/network/oauth-authorize.ts`), the `webapp/src/pages/SsoAuthorize.tsx` handoff page and its `/oauth/authorize` route, the `ssoAuthorize()` API client method, and the `ssoRedirectUris`/`TUNECAMP_SSO_REDIRECT_URIS` config option. No production consumer ever depended on this endpoint — the standalone `tunecamp-sso` service (separate repo) is left untouched but is now an orphaned counterpart with nothing on this side to talk to. `docs/karma.md` rewritten to record the decision instead of a still-open design.

## [2.24.2] - 2026-07-17

### Fixed

- **Webapp architecture docs rewritten to match the current frontend.** `architecture-webapp.md` and `component-inventory.md` (plus their Italian mirrors) had drifted significantly from `webapp/src/`: they still described a removed `ContentSearch` page and `Tracks`/`Favorites`/`Playlists`/`Albums` as standalone pages (now redirects into the merged `Library` page), a nonexistent `components/auth/` folder, modals that no longer exist (`AddBandcampTrackModal`, `ArtistKeysModal`, `MyPlaylistDetails`), and omitted entire areas added since: the frontend plugin registry (`core/plugins/`, `plugins/builtins|metadata|youtube`), TanStack Query data layer (`hooks/queries.ts`, `lib/queryClient.ts`), several stores (`useAuthStore`, `useSiteSettingsStore`, `useNowPlayingStore`, `useConfirmStore`), the `network/` components, and route guard components (`AdminGuard`, `ModuleGuard`, etc.). Both docs were rewritten against the actual directory tree and route table.

## [2.24.1] - 2026-07-12

### Fixed

- **Documentation consistency: removed references to endpoints and components that no longer exist.** Audited the docs against the current routes in `src/server/`. Removed the `/api/admin/torrents*` endpoints from `api-contracts.md` and the `/search/content` (torrents/Soulseek) and `/ap/remote-actors` operations from `openapi.yml` — torrent/P2P acquisition moved to the Sidecamp desktop app and those backend routes no longer exist. Corrected three stale paths in `openapi.yml` to match the actual routes: `/auth/me` → `/auth/status`, `/admin/scan` → `/admin/system/rescan`, and `/comments` → `/comments/track/{trackId}`. Dropped the non-existent `CommandPalette.tsx` entry from `component-inventory.md`. Italian mirrors updated to match.

## [2.24.0] - 2026-07-12

### Added

- **Upstream update check for admins.** New `GET /api/admin/system/update-check` endpoint (root/system admins only) compares the running version against the latest `package.json` on GitHub `main`, with the lookup cached in memory for 24h so polling never hits GitHub rate limits. The admin System Resources panel now shows an update banner ("TuneCamp X.Y.Z is available") with a link to the changelog when the instance is behind. Network failures are not cached, so a transient outage retries on the next check; the banner simply stays hidden when the check can't run.

## [2.23.0] - 2026-07-11

### Added

- **Cross-instance peer search: pir shares now surface across federated instances.** Peer (pir/sidecamp) manifests were scoped to the single instance a daemon connected to — instance B's users could only see pir tracks from daemons connected to B, never those on a federated instance A. B's global search now fans out to known federated instances (`getCommunitySites()`, bounded to 10, parallel with a 3s per-instance timeout, SSRF-guarded via `fetchJsonSafe`) and merges their peer tracks into the `peers` results, each tagged with its `origin`. A new public `GET /api/peers/federated-search?q=` exposes an instance's connected-pir tracks to remote instances, gated behind the same `peerEnabled` + `peerFederation` opt-in as the existing `federated-stream`/`federated-download` routes (search + stream only, no download tunnel). Remote peer results stream directly from the hosting instance's public `federated-stream` endpoint (no token) instead of the local token tunnel. Requires the instance *hosting* the pir (A) to have `peerFederation` enabled; with the flag off its pir shares stay invisible. Single hop only — no multi-hop propagation (C does not see A's pir via B).

### Fixed

- **Resolved merge conflict for the fedify `handleDeleteObject` optimization.** PR #954 restated the single-query `removeAllFollowers` optimization that already landed on `dev` via #952, colliding in `fedify.ts`. Kept `dev`'s version (the redundant `actorUri as string` cast is unnecessary since the enclosing guard already narrows it to `string`) and merged in the clarifying comments on `removeAllFollowers` in `database.types.ts` and `social.repository.ts`.

## [2.22.4] - 2026-07-10

### Fixed

- **Admins can now use peer sharing.** The peer WebSocket handler required the per-user `can_peer` grant for everyone with no role bypass, while the `can-peer` toggle endpoint (and the users-list UI) refuse to modify user 1 — so the root admin was permanently locked out of connecting a peer daemon, and Managers needed an explicit grant like any listener. `canUsePeer()` in `peer.ws.ts` now allows Root Admin and Manager (`admin` role) implicitly; other roles still need the `can_peer` toggle. The Peer Sharing column in Admin → Users shows admin rows as always-on (disabled toggle with a tooltip) instead of a misleading "off" state.

## [2.22.3] - 2026-07-08

### Fixed

- **Disabling the Soulseek integration now actually hides and disconnects it.** Turning the toggle off in Admin → Integrations blocked the API routes (403 via `requireDownloadProvider`) but nothing else: `/api/admin/system/health` kept calling `soulseekService.checkStatus()` without consulting the registry, so the frontend still saw `soulseek.connected: true`, kept the Soulseek/Transfers tabs in Content Search, and showed a green "Connected as …" badge on a disabled card. The health check now reports `connected: false, error: "Disabled"` when the plugin is off (same pattern the Torrent probe already used), and `SoulseekDownloadProvider` gained `onEnable()`/`onDisable()` lifecycle hooks: disabling disconnects the client from the Soulseek network, enabling (re)connects with the persisted credentials — no restart or credential re-save needed. The startup auto-connect block in `registerBuiltInDownloadProviders()` is gone; the registry sync's `onEnable()` hook covers it.

## [2.22.2] - 2026-07-08

### Changed

- **Tools page rewritten with a curated FMHY selection.** The webapp's Tools tab grew from 6 links in 2 categories to 22 tools in 7 categories picked from the FMHY audio wiki for what a TuneCamp user actually does: Tagging & Library Management (Picard, Mp3tag, Kid3, Beets), Convert & Prepare Files (fre:ac, FFmpeg, CUETools), Quality Check & Analysis (Spek, Sonic Visualiser, Tunebat), Record & Edit (Audacity, ocenaudio), Produce (REAPER, LMMS, Waveform Free, Vital), Lyrics & Synced Lyrics (LRCLIB, LRCGET, LRC Maker) and Royalty-Free Sounds & Samples (Freesound, BBC Sound Effects, Citizen DJ). The stream-ripping services previously listed (DoubleDouble, Lucida) were dropped — out of place on a platform where artists sell their own music. The page is now data-driven (sections/tools arrays rendered by one card template) instead of hand-written JSX per card, and each section carries a one-line blurb tying it to the TuneCamp workflow.

## [2.22.1] - 2026-07-08

### Fixed

- **Soulseek plugin never loaded: "Named export 'SoulseekDownloader' not found".** `andrade-soulseek-downloader`'s `package.json` `main` field points at `dist/api.js` (a single default-exported function), but the `SoulseekDownloader` class is only exported from `dist/index.js` — a mismatch between the package's declared entry point and its own type declarations. Node resolved the broken `main` at runtime and the plugin's dynamic `import()` threw on every boot, silently disabling Soulseek. `src/server/plugins/soulseek/service.ts` now imports directly from `andrade-soulseek-downloader/dist/index.js`, sidestepping the bad entry point.
- **Torrent plugin status never reported to the admin UI.** The `/api/admin/system/health` handler set `results.soulseek` but never set `results.torrent`, so the frontend's Torrent card always read `status.torrent === undefined` and showed "Not configured" regardless of actual state — even while WebTorrent was fully connected and seeding. The health check now reports `results.torrent` (`connected`, `totalPeers`, `activeTorrents`) based on the registry's enabled state and `torrentService.getTorrentsStatus()`.

## [2.22.0] - 2026-07-08

### Added

- **White-label plugin scorporo completed.** Finishes the groundwork from 2.21.0: `webapp/src/core/plugins/index.ts` no longer statically imports each plugin folder — it uses `import.meta.glob('../../plugins/*/index.{ts,tsx}', { eager: true })`, so deleting a plugin's frontend folder is enough to drop it from the bundle (no import line to edit). `webtorrent` and `andrade-soulseek-downloader` moved from `dependencies` to `optionalDependencies` in the root `package.json`, so `npm install --omit=optional` produces a build without those runtime packages. `container.ts` no longer imports types from `src/server/plugins/{soulseek,torrent,ytdlp}`: it uses structural contracts defined in the new `src/server/core/plugin-contracts.ts`, so the container's types don't depend on plugin folders existing. Removing a grey-area provider from a white-label build is now: delete its backend plugin folder, delete its frontend plugin folder, and (optionally) drop its package from `optionalDependencies`.

## [2.21.0] - 2026-07-08

### Added

- **Dynamic plugin registry for grey-area integrations (white-label groundwork).** Soulseek, WebTorrent and yt-dlp are no longer hard-wired into the core: on the backend they moved to `src/server/plugins/{soulseek,torrent,ytdlp}/` and self-register at startup via `registerBuiltInDownloadProviders()` (dynamic imports — if a plugin's files or optional deps are missing, the server logs it and keeps running; the affected routes answer `501 Plugin not loaded`). On the frontend, `ContentSearch` and `IntegrationsPanel` no longer contain per-provider code: tabs and config panels are contributed by plugins in `webapp/src/plugins/` through a `pluginRegistry`. Removing a provider from a build is now: delete its two plugin folders and its import line in `webapp/src/core/plugins/index.ts`.
- `LocalizationService` renamed to the `ytdlp` plugin service; gdrive-hosted track localization stays in core (`catalogService.localizeTrack`), external stream ripping requires the yt-dlp plugin.

### Fixed

- **Admin P2P opt-ins survive restarts.** The registry sync that restores each provider's persisted enabled/disabled state ran before the providers were registered, so Soulseek/WebTorrent silently reverted to disabled on every boot (and Soulseek never auto-connected). The sync now runs after plugin registration, and the Soulseek auto-connect check runs after the sync.
- **Streaming (yt-dlp) tab no longer disappears from Content Search.** Its status check depended on a backend plugin list that Content Search doesn't have; it now falls back to the YouTube health probe.
- Broken relative imports (`../../../` instead of `../../`) in the extracted plugin tab components, which failed the webapp build.

## [2.20.2] - 2026-07-08

### Fixed

- **Private-library playback broken: `MEDIA_ELEMENT_ERROR: Format error` on every track.** PR #886 removed `?token=` extraction from the auth middleware to keep session JWTs out of request logs — but native browser consumers (`<audio>` elements, `EventSource`, plain `<a>` download links) cannot send an `Authorization` header, and the webapp authenticates exactly those URLs via `?token=`. The backend therefore saw every stream request as anonymous, `canConsumeTrack` denied private tracks with a 403 JSON body, and the audio element choked trying to decode JSON as audio. Query-token auth is now restored **only** for routes that native consumers load — `/stream`, `/download` and `/api/admin/backup/*` — while every other API route remains header-only, preserving the original log-leak fix. Payment downloads are unaffected: they keep their own short-lived `?dt=` token scheme.

## [2.20.1] - 2026-07-07

### Fixed

- **Followed peers are never auto-purged from federated discovery.** The 30-day garbage collection introduced in 2.20.0 deleted *any* long-offline row from `federated_instances`, including instances the admin explicitly follows — which silently removed their "Offline" badge from the Instances & Peers panel after a month. `prune()` now skips origins that are federation seeds or ActivityPub-followed instance actors: their offline flag persists until the admin unfollows. Gossip-discovered instances (never followed) are still purged after 30 days offline, keeping the cache from accumulating dead strangers.

## [2.20.0] - 2026-07-07

### Added

- **Offline flag on followed peer instances.** Federated-discovery's 24h prune used to silently `DELETE` a peer from `federated_instances` once it stopped answering probes, so a followed instance that went dark just vanished from Network → Instances with no signal to the admin. Dead peers are now flagged `offline_since` instead (kept, not deleted) and only garbage-collected after 30 days offline. The "Instances & Peers" admin panel (`GET /api/admin/network/ap/peers`) surfaces this as a red "Offline" badge with an "unreachable since — consider unfollowing" tooltip on each affected peer.
- **1-day dead-instance cleanup on the marketing site's Network Graph.** `network-graph.html` crawls live from the browser with no backend, so unreachable nodes previously stayed red forever. It now tracks "first seen offline" per origin in `localStorage` and drops a node from the graph once it's been continuously unreachable for 24h — mirroring the same expiry the TuneCamp instance itself uses.

## [2.19.6] - 2026-07-07

### Fixed

- **Deleting additional artworks (booklet images) from a release now persists.** Removing an image in the release editor and saving appeared to work, but the deletion was silently dropped and the image reappeared on reload. The editor sends the full desired artwork list on every save, yet `PUT /api/admin/releases/:id` (in `admin.ts`) rebuilds a whitelisted `updates` object and never copied `additional_artworks` — so the column was only ever written (append-only) by the upload endpoint. The handler now persists `additional_artworks` from the request body for both formal releases and library albums, so removals and full clears stick.

## [2.19.5] - 2026-07-07

### Changed

- **Dead federated instances are dropped after 1 day instead of 7.** Discovered TuneCamp instances only refresh their `fetched_at` timestamp on a *successful* probe, and the discovery crawl runs every 6 hours — so a live peer is re-confirmed ~4×/day. The hard expiry that prunes unreachable instances was lowered from 7 days to 24 hours (`HARD_EXPIRY_MS` in `federated-discovery.service.ts`), so an instance that stops responding disappears from Network → Instances within a day rather than lingering for a week.

## [2.19.4] - 2026-07-07

### Fixed

- **Import: clean filename-fallback titles.** Tracks with no usable tags derived their title from the raw filename, keeping conversion junk suffixes (e.g. `A_Gravame_mp3_mp3.wav` → title `A_Gravame_mp3_mp3`). Those dirty titles then leaked into every future generated filename (localize, cloud import, peer import), compounding `_mp3`/`_wav` tokens on each generation. Trailing audio-extension tokens are now stripped from fallback titles at import time.
- **Artwork no longer saved next to audio files.** Remote track artwork and album covers were downloaded into the track's own directory, polluting library folders with `artwork-tr*.jpg`/`cover-al*.jpg` files (which the scanner then had to special-case skip). They now always go to `artwork/tracks/` and `artwork/albums/`. Existing files stay where they are (files are never moved); the DB keeps pointing at them.

## [2.19.3] - 2026-07-07

### Fixed

- **Docker build failed on `npm ci` (lock file out of sync).** `package-lock.json` was missing the optional React 18 peer-dependency entries nested under `@docsearch/js` (pulled in by vitepress): `react@18.3.1`, `react-dom@18.3.1`, `@types/react@18.3.31`, `@types/prop-types`, `scheduler` — so `npm ci` aborted with EUSAGE ("lock file is not in sync"). Regenerated the lock with `npm install`; `npm ci` passes again.

## [2.19.2] - 2026-07-06

### Fixed

- **Retrieve track owner/uploader name in Admin Tracks List**: Joined the `admin` table in the database `v_tracks` view to retrieve `owner_name`, so that the "User" column displays the correct uploader/owner username instead of falling back to the artist's name.

## [2.19.1] - 2026-07-06

### Changed

- **"Jump back in" now shows local library plays only.** Recently-played tracks played from a peer/federated instance (`activitypub`/`http`/`rss` network tracks — identified by their remote `siteUrl`) are mostly raw MP3s with no cover art or metadata, which made the row look broken. The Home page now filters them out of "Jump back in"; they remain fully playable everywhere else and in the underlying play history.

## [2.19.0] - 2026-07-06

### Added

- **UI internationalization (EN/IT) — foundation.** The webapp now ships an i18n layer (`react-i18next` + `i18next-browser-languagedetector`): English is the source/fallback locale, Italian the first translation. Language is auto-detected (localStorage `tc_lang` → browser), switchable via a new EN/IT toggle next to the theme switcher in the sidebar, and kept in sync with `<html lang>`. Pilot surface: the Setup Wizard modal is fully translated; remaining screens will be migrated namespace-by-namespace (see `docs/i18n-plan.md`).

## [2.18.2] - 2026-07-06

### Added

- **Artist short-links (`/@slug`):** Added frontend client-side redirection from `/@slug` to `/artists/:slug` and backend `/@:slug` interception to dynamically inject Open Graph (og:title, og:description, og:image) SEO metadata tags for rich social preview cards when sharing links.

### Changed

- **Archive Sidebar Icon:** Replaced the generic Folder icon with a dedicated Archive icon to avoid visual confusion with the admin Files/Browser folder icon.

## [2.18.1] - 2026-07-06

### Fixed

- **Matching album metadata wiped the existing cover (and other fields) — the new cover showed until a browser refresh, then the preset placeholder returned.** `POST /api/albums/:id/match-metadata` always sends every field, with `undefined` for anything the chosen result lacks (e.g. no `coverUrl`). The album/track repository `update()` bound those `undefined` values straight into SQL, and better-sqlite3 binds `undefined` as `NULL` — so applying a match without a cover **nulled `cover_path`** (same for description, genre, etc.). Both repositories now follow `Partial<T>` semantics: `undefined` leaves a column unchanged; only an explicit `null` clears it. Regression test added.
- **The "External / Streaming" filter in Admin → Maintenance listed nearly the whole local library.** The query used `external_id IS NULL` (which matches every normal local track) instead of selecting actual streaming references. It now returns tracks whose audio is not a durable local file: no `file_path`, an `http` path, or a non-`local` service.

### Changed

- **Startup/maintenance repairs now report tracks whose `file_path` points to a file missing from disk** (e.g. legacy mangled names like `..._wav_wav.wav` — the source of the ffmpeg "No such file or directory" prewarm failures). Report-only by design: files are never moved or renamed, and the real file (if present under another name) is re-imported by the orphan scan, leaving the broken row as a duplicate to review manually.
- **Maintenance panel cleanup:** the ambiguous "Scan" button is now "Refresh List" with a tooltip clarifying it only reloads the table (vs. "Rescan Library" which scans the filesystem); Rescan/Optimize DB have independent spinners instead of sharing one processing flag with every other button; fixed the indeterminate progress bar on background tasks.

## [2.18.0] - 2026-07-06

### Changed

- **Fully-imported Bandcamp releases now become durable local files instead of rotting streaming references.** A "complete" Bandcamp import created each track as an external streaming reference (`service='bandcamp'`, `file_path=null`, `url=`the Bandcamp page or a signed CDN link). Those references are not durable: signed `bcbits.com/stream` links carry a short-lived `ts=` token and expire within hours (→ tracks stop playing "on their own"), the durable page URL is proxied as HTML rather than re-resolved to audio (the Bandcamp streaming provider ships disabled), and on a Railway redeploy only files under `music/` survive — external references were never files, so they never came back. Tracks imported from the local library were unaffected because they are real files on the persistent volume. The import now asks the server to **localize** each Bandcamp track (download the audio into `music/localized/` via the existing `LocalizationService`), so imported tracks turn into durable local files that survive link expiry and redeploys.
  - `POST /api/tracks` accepts an opt-in `localize` boolean; when set on a rippable service (`bandcamp`/`youtube`/`soundcloud`) with a source URL, localization runs in the background after the response is sent, then re-syncs the release. The admin release editor sends `localize: true` for Bandcamp-imported tracks.
  - `LocalizationService.localizeTrack` now runs through a global, concurrency-limited queue (2 at a time) so importing a whole album doesn't spawn one parallel `yt-dlp` per track and starve the single-process server.

## [2.17.5] - 2026-07-06

### Fixed

- **Free download of a *release* opened a blank page instead of downloading.** The album/release page links the "Download" / "Free Download" button to `/api/releases/:id/download` when the item is a release (the normal case), but only `/api/albums/:id/download` existed — there was no ZIP route on the releases router. The request fell through to the SPA catch-all (`app.get("*")` → JSON 404 for `/api/*`), so the new tab showed a blank/error page and nothing was downloaded. Added `GET /api/releases/:id/download`, mirroring the album ZIP route: it resolves either a numeric id or a slug (the frontend links with `slug || id`), gates private releases to owner/admin, streams a `.zip` of the release's local audio files, and skips streaming/linked tracks (null/`http(s)`/`gdrive://` paths) that have no on-disk payload.

## [2.17.4] - 2026-07-06

### Fixed

- **`dev` CI turned red after merging several independently-green test PRs: `scanner.service.test.ts` failed on `expect(getScannerService()).toBeNull()`.** The file had two sibling `describe` blocks sharing the module-level singleton in `scanner.service.ts`; the first block (`Singleton logic`) called `initScannerService` and never reset the singleton, so the second block (`ScannerService singleton`) — a near-duplicate — then saw a non-null instance and failed its "null initially" assertion. Each PR passed in isolation but collided once combined on `dev`. Removed the redundant second `describe` block, whose assertions are already fully covered by `Singleton logic` (null-initial state, init returns the instance, `getScannerService` returns it, and `syncRegistryWithDatabase` is called). Full server suite is green again (1250/1250).

## [2.17.3] - 2026-07-06

### Fixed

- **Runaway `/tmp/webtorrent` growth: seeded torrents copied into `/tmp` and recursively nested every seed inside every other on each restart.** `TorrentService` seeded library files without an `opts.path`, so WebTorrent fell back to its `os.tmpdir()/webtorrent` default store — off any Docker volume, never reaped — and copied the full audio payload there. Worse, `updateDbProgress` wrote `torrent.path` (the store *base*) back into the torrent's DB `path` on every progress tick, overwriting the real `/music` source path with the shared tmp root; on the next restart `resumeSeeding` did `readdir()` on that shared root and re-seeded **all** sibling seed folders under one new name, copying the whole tree one level deeper. The result was exponential matryoshka nesting (the same track appearing many times at escalating depth) that filled the disk. Fixes:
  - Seeds now use a dedicated, hidden, on-volume store (`music/.torrent-seeds`) that the catalog scanner and file watcher skip (dot-prefixed), instead of `/tmp`.
  - `resumeSeeding` seeds the stored path **directly** (a file or a single directory) and never `readdir`s a store dir into its siblings.
  - `updateDbProgress` preserves the torrent's meaningful source path instead of clobbering it with the store base.
  - On startup, the service ensures the seed store exists and reaps the legacy `os.tmpdir()/webtorrent` store (now unused). Existing servers should stop the container, `rm -rf /tmp/webtorrent/*`, and restart; the real files on the `/music` volume are untouched.
  - `removeTorrent` deliberately does **not** delete files (seeds point at `/music` library originals) — matching the "files are never moved/renamed" rule.

## [2.17.2] - 2026-07-06

### Fixed

- **A release could federate to ActivityPub + Mastodon while staying invisible on the site ("published in AP, missing on the site").** `PublishingService.syncRelease` gated federation on visibility alone (`public`/`unlisted`), but the public site catalog also requires `status='released'` (`VisibilityGuardian`). So a release that was public but not yet released (`draft`/`pending`/`awaiting_finalization`) broadcast an AP note and cross-posted to Mastodon while never appearing on the site or in the federation catalog. `syncRelease` now uses the same predicate as the catalog (visibility public/unlisted **and** `status='released'`), so the two surfaces can no longer diverge. Any release wrongly federated earlier self-heals on its next sync: it falls to the unpublish branch, broadcasts a Delete and clears `published_to_ap`, then re-federates cleanly once actually released.

## [2.17.1] - 2026-07-05

### Changed

- **CI now validates `dev` and auto-prepares releases to `main`.** The `CI` workflow runs on pushes to `dev` (not just `main` and PRs), so every commit landing on the integration branch is built and tested. A new `promote` job runs only after both the server and webapp jobs pass on a `dev` push (the "green" gate); once `dev` is at least `PROMOTE_THRESHOLD` commits (default 5) ahead of `main`, it opens a `dev → main` pull request so the batch can be reviewed and merged to cut a release. The threshold is a single env var at the top of the job; merging into `main` remains a human/automerge decision.

### Added

- **Assign the owning user of a release in the admin release editor.** Previously a release's `owner_id` was always forced to whoever created it, so an admin/label creating a release on behalf of someone else stayed the sole owner and the actual user couldn't manage it. The editor now shows an **Owner (User)** selector (visible to Admins/Root Admins) that assigns the release to any user account; that user can then manage/edit it (`canManageItem` gates on `owner_id`). Choosing "Unassigned" on an existing release clears `owner_id` so management falls back to the linked artist.
  - Backend: `POST /api/admin/releases` and `PUT /api/admin/releases/:id` now accept an `owner_id`, but only honor it for callers with `MANAGE_ALL_CONTENT` (Admin/Root Admin). Non-privileged publishers can never reassign ownership — their releases remain their own.

## [2.16.4] - 2026-07-05

### Changed

- **Admin Setup Wizard is now fully in English.** All user-facing copy in `SetupWizard.tsx` (the four instance-profile presets — Solo Artist, Record Label, Music Curator, Web Radio/Streamer — their descriptions, tagline/description templates and next-step checklists, plus every step heading, module toggle label, warning, button and success message) was previously hardcoded in Italian and has been translated to English. The template placeholders were updated accordingly (`[Nome Artista]` → `[Artist Name]`, etc.), so pre-filled site name/description still populate correctly. Behavior is unchanged.
- **Contributor workflow: `dev` is now the integration branch.** `.claude/CLAUDE.md` git rules updated — all work branches off `dev` (not `main`), `dev` is kept synced with the latest `main`, and PRs target `dev`.

### Added

- **`docs/i18n-plan.md`** — an agile, sprint-based plan to internationalize the webapp so TuneCamp ships in at least two languages (English + Italian), including the recommended stack (`react-i18next`), resource-file layout, epics, a 3-sprint backlog with acceptance criteria, and guardrails to keep the two-language guarantee from rotting.

## [2.16.3] - 2026-07-05

### Fixed

- **Releases with a digit-prefixed slug showed the wrong cover on the Network page (and to federated peers), while looking correct on the instance.** The network feed and the federation catalog request covers by release slug (`/api/albums/<slug>/cover`), but that endpoint resolved the parameter with `parseInt` — so a slug like `6avant` was truncated to `6` and matched a *different* album by numeric ID (typically a private library album, whose cover/track artwork was then served). The endpoint now only takes the numeric-ID path for all-digit parameters (same strict `/^\d+$/` check already used by `/api/releases/:id/cover` and `DiscoveryService.getAlbumForUser`), falling back to slug lookup otherwise. Instance pages were unaffected because they resolve covers by numeric ID or via `/api/releases/...`.

## [2.16.2] - 2026-07-05

### Fixed

- **Ripping a Bandcamp track imported via "Import from Bandcamp" failed with `410 Gone`.** `AdminReleaseEditor`'s Bandcamp-release import staged tracks using the signed, short-lived `t*.bcbits.com` stream link returned by `extractBandcampMetadata` as the track's permanent `url` — that link expires (embedded `ts=` timestamp), so localization later re-downloaded an already-dead URL. `extractBandcampMetadata` now also returns each track's durable page URL (from Bandcamp's `title_link`), and the importer stores that instead. As a safety net, `LocalizationService` now detects an expired-style `bcbits.com/stream/` URL on any existing track and re-resolves a fresh stream URL via the streaming provider before downloading, instead of retrying the stale one.

## [2.16.1] - 2026-07-05

### Fixed

- **Localized/ripped SoundCloud (and other external) tracks kept streaming from the source instead of the local file.** `LocalizationService.localizeTrack()` sets `file_path` after downloading but never clears the old `external_id`/`url`, and `MediaEngine.getStream()` checked those before checking `file_path` — so a ripped track was still re-resolved and proxied through the origin provider (visible as repeated `403`s from expired signed SoundCloud URLs). Local files now take priority over any leftover external reference.

## [2.16.0] - 2026-07-05

### Changed

- **Typography overhaul to match design mockup:**
  - Switched default app font from Outfit to **Inter** (cleaner, more neutral geometric sans-serif); Outfit remains selectable in admin settings.
  - Sidebar section headers toned down from `font-black` to `font-semibold` with reduced tracking for a lighter, more refined look.
  - Sidebar brand name weight reduced from `font-black` to `font-bold`; byline uses `font-medium` with less opacity.
  - Nav item labels now use `font-medium` for inactive items and `font-semibold` for the active item, improving the weight hierarchy.
  - Hero section: added an instance eyebrow label (`SITENAME · Self-Hosted`) above the greeting in the style of the design mockup.
  - Hero Resume button now shows the current track title (`Resume — Track Name`) when a track is loaded, matching the mockup.

## [2.15.2] - 2026-07-05

### Changed

- **ESLint debt triaged.** To make webapp `eslint` gate-able without touching ~560 pre-existing occurrences, `@typescript-eslint/no-explicit-any` and the React-Compiler-era hook rules (`exhaustive-deps`, `set-state-in-effect`, `immutability`, `static-components`, `refs`, `purity`) are downgraded to **warnings**; genuine hook misuse (`rules-of-hooks`) stays an error. `public/` (vendored bundles) is now ignored, and `_`-prefixed names are allowed unused. All 20 residual eslint **errors** fixed. (The CI `Lint webapp` step lands in a separate workflow-only PR.)

### Fixed

- **Glass Overlay Opacity showed `NaN%`** when `themeOverlayOpacity` was unset: the guard `Number(x) !== undefined` is always true (`Number()` never returns `undefined`), so the `0.85` fallback was dead. Now uses `Number.isFinite`.

## [2.15.1] - 2026-07-05

### Fixed

- **Home "Jump back in" row: blank covers, empty artist, dead play button.** The row reads full track objects from the player store (`recentlyPlayed`) but rendered them as a custom `{cover, artist, type}` shape — so covers/artist were blank and the play handler's `type` dispatch never matched (nothing happened on click). Now resolves the track cover (album/track endpoints), uses `artistName`, and plays the track directly via `playQueue`. (The fix landed just after #728 was squash-merged, so it missed that release.)

## [2.15.0] - 2026-07-04

### Changed

- **UX Redesign:** Implemented a series of user experience enhancements based on the design handoff:
  - **Sidebar IA:** Regrouped navigation by intent (Primary, Explore, Community, Studio). Moved `Library` to Primary, and `Now Listening` & `Stats` to Community. Added a comprehensive Profile dropdown containing Admin (Files, Search Content), Settings, and Resources.
  - **Unified Library:** Merged `/playlists` and `/favorites` into a single, unified `/library` page with top-level tabs for Playlists, Tracks, Albums, and Artists.
  - **PlayerBar Cleanup:** Streamlined the desktop player bar by moving secondary actions (Lyrics, Visualizer, Crossfade, Radio) into an overflow menu.
  - **Actionable Home:** Replaced the generic hero section with a compact, listen-oriented hero featuring a Resume CTA and a "Last played" history card.
  - **Tracks integrated into Releases:** Consolidated the Tracks view as a tab within the Releases page.

### Fixed

- **Lyrics Button State:** Fixed a bug where the Lyrics button in the PlayerBar incorrectly lit up when Shuffle was enabled, instead of when Lyrics were actually open.

## [2.14.4] - 2026-07-04

- **Restored the "TuneCamp Network" tab on the Network page** (reverts the removal in 2.14.1). The tab was dropped as "redundant" with Search Content's torrent discovery, but those are two different things: torrent search is discovery, while this tab streams the tracks published by the *registered TuneCamp instances* you federate with (hosts in the Instances directory). Because remote tracks from those hosts are deliberately excluded from "Other Networks", removing the tab left them with no listing anywhere — the tracks of the instances you're connected to silently disappeared from view. The tab (and its per-instance grouping) is back, and the Network page again defaults to it.

## [2.14.3] - 2026-07-04

### Fixed

- **Edit Artist form became editable after pressing Cancel on a locked (user-linked) artist**: `AdminArtistModal` was rendered twice on the `/my-music` page — once globally in `MainLayout` and again inside `MyMusic` — both bound to the same `open-admin-artist-modal` event and the same dialog id. Opening the editor stacked two native `<dialog>`s, and each instance loaded its own `currentUser` asynchronously, so they could disagree on the `profileLocked` state. Closing the top one with "Cancel" revealed the second instance underneath in its stale (editable) state, making a read-only linked artist appear editable. The redundant instance is removed; only the global `MainLayout` modal remains (now also bumping the cache-buster so avatar edits still refresh).

## [2.14.2] - 2026-07-04

### Fixed

- **Peer sessions never disconnect / ghost peers linger**: the admin "Disconnect" button did nothing for a peer that had already gone offline, and sessions from peers that disconnected long ago (e.g. "17h ago", offline since the previous day) kept showing as active. `unregisterSession()` only deleted the DB row when a live in-memory session existed, so kicking an orphaned row (left behind after a server restart) was a no-op; and `getActivePeerSessions()` returned every stored row with no freshness check, so orphans were never pruned. Now `unregisterSession()` always deletes the row, active-session listing filters out rows whose last heartbeat is older than 90s, and the heartbeat loop purges stale DB rows each cycle.

## [2.14.1] - 2026-07-04

### Removed

- **"TuneCamp Network" tab removed from the Network page**: it duplicated the network torrent/track discovery already offered by Search Content's "Torrents from the Network" section (which works), while the Network-page version showed no results. Network-instance discovery now lives solely in Search Content; the Network page keeps Live Peers, Other Networks, My Instance, Posts and Instances.

## [2.14.0] - 2026-07-04

### Changed

- **Playlist detail pages merged**: `/playlists/:id` and `/my-playlists/:id` were two ~85%-duplicate components with diverging UX (file-upload vs `window.prompt()` cover editing, "Make Public/Private" vs state-labelled visibility toggle). One unified page now handles genre mixes, public playlists and owned playlists — edit affordances follow ownership/admin auth, cover editing is always file upload, the visibility button always reads as the action ("Make Public"/"Make Private"), and "Copy Link" only shows on public playlists. Old `/my-playlists/:id` links redirect.
- **Site settings fetched once, shared everywhere**: Sidebar, Home, Board, Profile, Store and MainLayout each fetched `/api/settings` on mount (6+ duplicate requests per page load) and re-implemented the `=== true || === "true"` flag parsing. All consumers now read from the cached `useSiteSettingsStore`.
- **Module gating simplified**: Store, Dig, Social and Network dropped their internal `hideX` checks (and duplicate settings fetches) — the route-level `ModuleGuard` already blocks disabled modules.
- **Sidebar admin link renamed "Settings" → "Admin"** — it opens instance administration, and "Settings" collided with the Profile → Settings tab.
- **Role badge helpers deduplicated** into `utils/roles.ts`; the Board now labels self-publish listeners "Artist" like the sidebar does, instead of "Listener".

### Fixed

- **Home "Library Additions → View All" linked the wrong page**: it pointed to `/albums` (public Releases), which doesn't contain the private library albums shown in the section. The link is removed — the full archive lives at `/library`, which is gated to admins/artists.
- **Stats page claimed "Your most listened tracks"** while showing instance-wide play counts; the copy now says so.
- Stale ZEN references cleaned up (Network federation badge, JWT-secret warning text, comments) — ZEN was removed in 2.x.

### Removed

- **CommandPalette (Ctrl+K)**: six static navigation links already present in the sidebar; the `cmdk` dependency goes with it.
- **ArtistKeysModal**: dead code — mounted globally and listening for an `open-artist-keys-modal` event that nothing ever dispatched.
- **Home hero "Browse Music" button**: it only scrolled to the section directly below.

## [2.13.2] - 2026-07-04

### Fixed

- **Album-page "Seed" still produced title-only torrent names** (v2.13.1 only fixed publish-triggered auto-seeding). The `Artist - Title` naming now lives in `TorrentService.seedFiles()` itself, so every caller — album page, manual Seed Files form, publish auto-seed — gets the same convention; a caller that already prefixed the artist isn't double-prefixed. Existing torrents keep their old name (it's baked into the info hash): delete and re-seed to rename.

## [2.13.1] - 2026-07-04

### Fixed

- **Auto-seeded torrent names now include the artist** (e.g. `Burial - Untrue` instead of just `Untrue`) so the "Torrents from the Network" list is scannable — publish-triggered seeding builds the name from `artistName - release.title`, and the existing-seed dedup lookup matches on the same combined name.
- **Peer sessions could stay "connected" forever after a dead/crashed daemon.** The heartbeat marked a session alive as soon as the server *sent* a ping, not when the peer actually replied `pong` — a half-open TCP socket (crash, sleep, dropped route with no clean FIN) never throws on `send()`, so `last_seen` kept refreshing every 30s with nobody there. Liveness is now driven by the received `pong`; a session that misses two heartbeat cycles (60s) is torn down.

## [2.13.0] - 2026-07-04

### Added

- **Torrent search now covers the federated network**: the WebTorrent tab in Content Search has a "Torrents from the Network" panel with a My Instance / Connected Instances filter — surfaces magnets seeded locally or by connected TuneCamp instances (via the existing `/api/stats/network/tracks` federation feed) instead of only Knaben's external index.
- **Network page search box**: filter federated releases/posts by title, artist, or release name client-side.

## [2.12.1] - 2026-07-04

### Fixed

- **"Missing Cover" maintenance filter always came back empty for tracks.** The query treated any track with an `album_id` as covered, but the scanner assigns every track to an auto-generated folder album (often coverless — the UI just renders the SVG placeholder, which looks like a cover). The filter now also flags tracks whose album has no real `cover_path`; the album-side filter additionally treats `cover_path = ''` as missing.

## [2.12.0] - 2026-07-03

### Added

- **Seeding now carries artist metadata**: the "Seed Files" form has an Artist field, `seedFiles()`/`/api/admin/torrents/seed` accept it, and it flows into `metadataHints.artist` on import so re-imported/synced torrent tracks aren't stuck with "Unknown Artist" when the source files carry no ID3 artist tag.
- **Releases auto-seed on ActivityPub publish**: publishing a public release now seeds its local files as a torrent (reusing an existing seed by name instead of re-seeding on every sync) and includes the magnet URI in the Mastodon crosspost.
- **Torrents are now discoverable via the Network page**: `/api/catalog/full` and `/api/stats/network/tracks` surface a `magnetUri` per release when an active seed exists (local or federated), and the Network track card shows a copy-magnet button — riding the existing catalog federation instead of a new discovery mechanism.

## [2.11.5] - 2026-07-03

### Fixed

- **Test suite now works on Windows dev machines.** `npm test` used a hardcoded `node_modules/jest/bin/jest.js` path (broken in git worktrees, where `node_modules` lives in the parent checkout); running `npx jest` directly silently dropped `--experimental-vm-modules`, which made Jest compile ESM tests as CJS — `jest.unstable_mockModule` became a no-op, 23 suites loaded the real network providers and timed out against live HTTP. The script is now `npx --node-options=--experimental-vm-modules jest`, which resolves Jest up the tree and always carries the flag.
- **Jest no longer picks up webapp (vitest) tests on Windows**: the slash-based `testPathIgnorePatterns` never matched backslash paths; replaced with `roots: ['<rootDir>/src']`.
- **Webapp vitest runs on Windows**: the default `forks` pool timed out spawning workers; switched to `pool: 'threads'` (all 138 tests pass in ~40s).

### Added

- **Webapp tests now run in CI**: the webapp job runs `vitest run` before the build — 20 test files (138 tests) that previously never ran automatically.
- **Route tests for `/api/live`** covering the `canPublishContent` broadcast gate: listeners and unlinked curators get 403, listener-artists and admins can start, ingest is owner-only, `/sessions` stays public and honors `liveEnabled`.

### Removed

- `activitypub.bench.test.ts`: a console.log benchmark disguised as a test (seeded 500 albums + 5000 tracks on disk, asserted only that two counting strategies agree). No regression protection, ~30s of suite time.

## [2.11.4] - 2026-07-03

### Fixed

- **Peer AP spam removed**: peer session connect/upload no longer broadcasts an ActivityPub board message ("Operator is now online…") — eliminated federation noise on Mastodon and other AP servers.
- **Library Additions now sorted by date**: home page "Library Additions" section was always showing the same first 20 albums alphabetically; now sorted by `created_at DESC` so newest additions appear.
- **Genre playlist links broken for multi-word/slash genres**: `API.getPlaylist` now URL-encodes the playlist ID, fixing navigation for genres like `bass music/dubstep/experimental` whose literal slashes were split by Express as separate path segments.
- **Peer import fails after session reconnect**: `requestImport` now falls back to searching all active sessions for the same `trackId` when the original session has rotated, preventing "Peer session not found" errors when the peer briefly disconnects and reconnects.

## [2.11.3] - 2026-07-03

### Fixed

- **`StringUtils.generateUnlockCode` now uses a CSPRNG** (`crypto.getRandomValues`) instead of the predictable `Math.random`, closing the gap left after the payments security review: the `/api/unlock` purchase flow and the `generate-codes` tool were still minting predictable codes. `payments.ts` now delegates to the same shared generator (one code format everywhere: `XXXX-XXXX-XXXX`, unambiguous alphabet).
- **`MaintenanceService` now hashes files with the shared `getFastFileHash`** from `fileUtils` instead of a private 16KB variant that produced hashes incompatible with the scanner's (1MB head/tail + size), so orphan re-imports no longer store mismatched dedup hashes.

### Removed (over-engineering audit)

- Dead code: `configUtils.ts` (`validateCatalogConfig`, never called), `audioUtils` dead wrappers (`formatDuration`, `formatTimeAgo`, `formatAudioFilename`), webapp `usePurchases.getPurchase()` stub (always returned `undefined`), duplicate private `escapeHtml` in `activitypub.service.ts` (now uses `StringUtils.escapeHtml`).
- Zen/ZenDB leftovers: `isNonFatalError` no longer guards `ZenDB`/`Zen` error strings; `gundb` keyword dropped from `package.json`.
- Dead route mount: `/api/admin/lifecycle` (no caller anywhere; `/api/lifecycle` is the real endpoint).
- The `postinstall` hook is now a plain `node scripts/patch-*.js` chain (the `existsSync`/`fork` wrapper was dead defensiveness — Docker copies `scripts/` before `npm ci`).

### Changed

- Route factories (`tracks`, `upload`, `unlock`, `browser`) resolve services via a shared `resolveService()` helper instead of 22 copy-pasted `(container as any).x || (database as any).x || database` fallback chains.
- Webapp admin views (`AdminTracksList`, `TrackPickerModal`, `AdminReleaseEditor`) use the shared `formatDuration()` instead of three inline copies (durations now zero-padded consistently, e.g. `03:45`).

## [2.11.2] - 2026-07-03

### Changed

- **New brand logo from the updated press kit**: the webapp favicon, PWA manifest icons, and sidebar fallback logo now use the new orange tent mark (replacing the leftover Vite icon and the generic gradient placeholder); the repository `logo.svg` is the new full wordmark logo.

## [2.11.1] - 2026-07-03

### Changed

- **Follower auto-acceptance is now a single bulk query**: `syncActivityPub` used to accept pending followers one `UPDATE` at a time (N+1); `acceptPendingFollowers(artistId)` now flips all pending rows in one statement.

## [2.11.0] - 2026-07-02

### Added

- **Legal pages (Terms of Service & Privacy Policy)**: every instance now serves `/terms` and `/privacy` in the webapp, backed by the public `GET /api/catalog/legal` endpoint. Built-in Markdown templates (tailored to what TuneCamp actually does: uploads and rights warranty, notice-and-action reporting, Store purchases and EU withdrawal-right waiver, ActivityPub federation, scrobbling/third-party providers, GDPR rights) are served by default; operators can replace them and set a legal contact email from Admin → Settings → the new **Legal Pages** tab (`legalTerms`, `legalPrivacy`, `legalContactEmail` settings). The registration form now links both documents ("By creating an account you agree…"), and the sidebar has a "Legal" entry.

## [2.10.1] - 2026-07-02

### Fixed

- **Duplicate instance cards on the Network page**: the "Instances" tab deduplicated remote sites by full URL, so the same instance registered under different URL forms (http vs https, trailing path variants) showed up as separate cards. Dedup now keys on hostname.

## [2.10.0] - 2026-07-02

### Added

- **Actor names in the community activity feed (opt-in)**: `GET /api/community/activity` now includes the actor's `user`name on `like` events when that user enabled "Public Profile" — the static website already rendered it ("<user> liked …"), the server just never sent it. Users with a private profile keep appearing as anonymous "liked" events.

### Changed

- **Playlist events in the activity feed** now carry the creator's username only when their profile is public, matching likes. Previously the username was always exposed and the website linked it to `/u/:username`, which 404'd ("Profile not available") for users who never opted in — every name shown on the network now resolves to a working public profile page.

### Fixed

- **`/u/:username` dead end on your own private profile**: visiting your own profile page while "Public Profile" is off used to show the generic "Profile not available" message. It now explains that the profile is private and links to the settings toggle.

## [2.9.0] - 2026-07-02

### Added

- **Public listener profiles at `/u/:username` (opt-in)**: any user can expose a public page showing their display name, avatar, public playlists, and likes on *publicly-released* tracks/albums, plus a link to their artist page if they have one. Off by default (privacy) - toggled from Profile -> Settings -> "Public Profile". Private surfaces (collection/purchases, wallet, API tokens, email) are never included.
  - New column `admin.public_profile_enabled` (default 0) with `authService.get/setPublicProfileEnabled`.
  - New endpoints: `GET/PUT /api/users/me/public-profile` (toggle) and unauthenticated `GET /api/users/:username/public`, which returns 404 for both missing and non-opted-in users (existence is not leaked). Likes are filtered to public releases via the same predicate as the community activity feed; playlists are limited to `is_public = 1`.
  - The static website's "Live on the network" strip now links public-playlist activity to the creator's `/u/:username` on the origin instance.

## [2.8.0] - 2026-07-02

### Added

- **Account migration between instances (data portability)**: any logged-in user can export a portable JSON archive of their account (profile identity + playlists) and import it on another TuneCamp instance after registering there. New endpoints `GET /api/account/export` and `POST /api/account/import` (`requireUser`), plus a "Migrate account (data)" card in the profile Settings tab.
  - Follows the Mastodon data-portability model: auth stays **per-instance**, so credentials/passwords are **not** portable — the user registers manually on the target instance, then imports. Username is kept only if free on the target.
  - Playlist tracks are matched against the target catalog by title+artist; unresolved tracks are **skipped and reported**, not fatal.
  - **Not migrated by design**: purchases/collection (transactions stay local to the artist's instance) and following (instance-global, not per-account).
  - Artist **follower redirect** continues to use the existing ActivityPub `Move` flow (`/api/ap/identity/*`); on import, an artist account's source actor is added to `alsoKnownAs` so a later Move verifies.

## [2.7.0] - 2026-07-02

### Added

- **Public activity feed (`GET /api/community/activity`)**: new unauthenticated endpoint on the federated discovery surface exposing recent likes, purchases, public playlists and published releases, newest first (`?limit=`, capped at 100). Only events on *published public releases* (`is_release=1, status='released', visibility='public'`) and public playlists are exposed — private library items, private playlists and admin-minted (tx-less) unlock codes never appear. Likes and purchases carry no actor identity (there is no opt-in for those, unlike now-playing); public playlists carry their creator's username since publishing one is deliberate. Zero new tables — a UNION over `starred_items`, `unlock_codes`, `playlists` and `albums`. The static website consumes it cross-origin for the "Live on the network" home widget.
- **Registry key-binding (`registryPubkey`)**: `GET /api/community/instance` now advertises the pubkey the instance signs its tunecamp-registry record with (new admin setting, editable from Admin → Settings). The registry validator matches it against the record's signer and marks the instance "key-bound", closing the "sign a record for someone else's URL" hole.

## [2.6.0] - 2026-07-01

### Added

- **Password reset via email (Brevo)**: TuneCamp had username+password auth with no way to recover a lost password. Added an optional `email` column on `admin`, a `password_reset_tokens` table (sha256-hashed, 30-min expiry, single active token per account), and `POST /api/auth/forgot-password` / `POST /api/auth/reset-password` endpoints. Emails are sent via Brevo's transactional HTTP API (`BREVO_API_KEY` / `BREVO_SENDER_EMAIL` / optional `BREVO_SENDER_NAME`) using the already-available native `fetch` — no new dependency. `forgot-password` always returns a generic response regardless of whether the email is registered, to avoid user enumeration; without Brevo configured it still no-ops silently rather than erroring. Users set their email from Profile → Account Settings (`PATCH /api/auth/profile` now also accepts `email`). Added a "Forgot password?" flow to the login modal and a new `/reset-password` page. Documented setup in `api-setup-guide.md`.

## [2.5.3] - 2026-07-01

### Docs

- **Removed fictional MoonPay / Stripe Onramp docs (EN + IT)**: `payments.md` and `api-setup-guide.md` described a "Crypto Onramp" feature (MoonPay + Stripe Onramp) with setup steps, an env var (`MOONPAY_API_KEY`), and an `onramp_provider` admin toggle — none of which exist in the codebase. `GET /api/payments/onramp-config` hardcodes `configured: false`, there's no `onramp-session` route, no `MOONPAY_API_KEY` read anywhere in `src`, and no MoonPay UI in `CheckoutModal.tsx`. Replaced with an honest "not implemented" note; the only working crypto path is on-chain verification of a wallet transfer the buyer already holds.
- **Closed EN/IT translation gaps** (found via heading-count diff, not previously caught): `docs/it/getting-started.md` was missing the "Deploy on Railway" section entirely, `docs/it/FEDERATION.md` was missing "Self-registering with a directory", and `docs/it/ROLES.md` was missing the "Release Reports (copyright & content)" subsection under Manager. All three translated and added.

## [2.5.2] - 2026-07-01

### Changed

- **Repo-wide over-engineering cleanup (no behavior change intended)**: audited the codebase for dead code, needless abstraction, and duplicated logic, then removed what was safe to remove.
  - **Routes**: dropped ~127 no-op `(container as any).x || (container as any)` fallbacks across all 36 route files — the fallback never fired since the DI container is always fully populated at injection time. One route (`users.ts`) had a *real* three-level fallback (`container.identity || database.identity || database`) rather than a dead self-reference; that one was kept and re-verified against its test suite.
  - **Repositories**: removed `BaseRepository`, a 5-line base class that 9 repositories extended solely to get a `db` property; each now declares it directly.
  - **Middleware**: `rateLimit.ts` dropped its 10-minute `setInterval` cleanup timer in favor of lazy eviction on the request path — same behavior, no background timer.
  - **Utils**: consolidated duplicate slug/escape logic (`fileUtils.createSlug`, `site-actor.slugifySiteName` → `StringUtils.slugify`; `ap-markdown`'s hand-rolled HTML escaping → `StringUtils.escapeHtml`), removed dead exports (`StringUtils.padLeft`, `StringUtils.generateTrackSlug`, `configUtils.validateReleaseConfig`, `catalog/price.ts:clearCache`), and removed a dead singleton fallback in `playlist.service.ts`.
  - **Frontend**: inlined five trivial `useQuery` pass-through hooks (`webapp/src/hooks/queries.ts`) at their call sites, and removed a dead, never-mutated `purchases` Map from `usePurchases.ts`.
  - **Misc**: deleted two unreferenced scripts (`benchmark_fix_paths.cjs`, `scripts/check_balance.py`) and the unused `jest-util` devDependency.
  - Deliberately left alone: `ProviderRegistry` and `FederationProvider` (used generically by 8+ provider types and by test mocking respectively — shrinking either is a real redesign, not a cleanup), `moduleGuard.ts` (only 2 call sites, already minimal), `audioUtils.ts` (looked like a pure re-export layer but several functions carry real logic beyond their `StringUtils`/`LibraryUtils` calls), and `webapp/src/stubs/empty.js` (it's a live Vite alias stub, not dead).

## [2.5.1] - 2026-06-30

### Fixed

- **Curator (super_user) no longer moderates the community Board**: `DELETE /api/board/messages/:id` treated `super_user` as an admin, letting a Curator delete *any* user's Board post — inconsistent with the rest of the role's gates, where a Curator has global *read* visibility but never mutates other owners' content. The moderation check is now Manager/Root-Admin only; a Curator can still delete its own posts via the ownership branch.

### Docs

- **Clarified the Curator role in `ROLES.md` (EN + IT)**: rewrote the capability list to state plainly what a Curator *is* (global read visibility + upload into the library, even without an artist link) and what it deliberately *cannot* do (edit/delete other owners' content, manage users/settings/federation, moderate the Board). Added a naming caveat that `MANAGE_PRIVATE_LIBRARY` grants global read + own-content write, not cross-owner write.
- **Aligned the in-app Guide page (`Guide.tsx`) with the role model**: the Curator card and the "At a glance" matrix claimed a Curator could *edit any track or album / edit others' content* — contradicting `canManageItem` (cross-owner write is Manager/Root-Admin only). Fixed the matrix ("Edit others' content" → No for Curator) and rewrote the Curator bullets (see-all + own-content edits + upload without an artist link). Also softened the "Becoming an artist" callout, which said the account is "promoted" — the role stays the same; the artist-profile link is what unlocks publishing.

## [2.5.0] - 2026-06-30

### Fixed

- **Tracks without their own artwork now inherit the album cover everywhere — including ActivityPub**: A track that has no `external_artwork` of its own appeared cover-less in several places even though it belongs to an album that has one. Three gaps were closed so the cover is inherited consistently:
  - **Catalog / overview / HTTP federation** (`discovery.service.ts`): release tracks returned by `getReleaseTracks` were emitted as raw rows with no `coverUrl`, so the homepage overview and the `/api/catalog/full` payload shipped tracks without a cover. Each release track now carries `coverUrl: /api/tracks/:id/cover`, which resolves track-art → album-cover → placeholder (the consuming instance resolves this relative URL against the peer's base URL).
  - **ActivityPub `Audio` object** (`fedify.ts`): the per-track object served at `/audio/{id}` and the release-announcement `Create` advertised the **artist avatar** as the track icon. Both now point at `/api/tracks/:id/cover`, so remote instances (Mastodon, Funkwhale, other TuneCamp peers) show the track's own cover, falling back to the album cover.
  - **ActivityPub release Note** (`activitypub.renderer.ts`): the per-track `Audio` attachments in a published release Note now include an `icon` pointing at the track cover so each federated track object carries the inherited cover, not just the album-level attachment.

## [2.4.9] - 2026-06-30

### Docs

- **Documented the native build toolchain prerequisite**: `development-guide.md` (EN + IT) listed only Node.js, FFmpeg, and SQLite as prerequisites, omitting the C/C++ toolchain (`python3`, `make`, a compiler, and CMake) needed to compile native modules like `better-sqlite3` and `node-datachannel` (via `webtorrent`) when no prebuilt binary matches the host. Without these, a from-source `npm install` fails and the server cannot boot. Added the requirement and noted it mirrors what the Dockerfile installs.

## [2.4.8] - 2026-06-29

### Changed

- **Admin Tracks list shows dual-quality at a glance**: The format badge previously showed *either* the lossless master (WAV/FLAC) *or* the compressed format, hiding that many tracks ship in both. It now renders both side by side when present — the compressed format with its bitrate (e.g. `MP3 320`) and the lossless master (`WAV`/`FLAC`) — so a manager can tell a track is available in both qualities. Listener-facing pages are intentionally left unchanged (they keep the subtle `Hi-Res` badge) to avoid clutter.

### Docs

- **Aligned `.claude/CLAUDE.md` with the implemented role model**: the "Become an Artist" rule said the flow promotes the account to Curator, but the code keeps the `user` role and grants publishing via the linked artist profile (the Listener-Artist model). Also clarified that `canPublishContent` gates on the artist link, not the role, and noted the `listenerSelfPublish` auto-approval flag.

## [2.4.7] - 2026-06-29

### Docs

- **Documented release distribution modes**: Added a "Download Experience" section to `payments.md` (EN + IT) covering all four modes — Streaming Only, Free Download, Unlock Codes, and **External Showcase** (off-platform "Buy on Bandcamp" redirect, `use_nft`/price forced off, optional in-app streaming).
- **Documented the Listener Self-Publish admin flag**: `ROLES.md` (EN + IT) now explains `listenerSelfPublish` — when enabled it auto-approves artist requests and auto-publishes releases (skipping the curation queue); when off, both require explicit admin action. Includes the companion `listenerSelfPublishQuota` default.
- **Fixed stale "promoted to Curator" claims**: `community-mode.md` and `comparison-funkwhale.md` (EN + IT) said an approved artist request promotes the account to Curator, but the code keeps the `user` role (the artist-profile link grants publishing — the Listener-Artist model). Aligned the docs with the implementation and `ROLES.md`.

## [2.4.6] - 2026-06-29

### Fixed

- **Subscription modal showed a hardcoded "Pay $10 with Card"**: The Stripe button text was a literal `$10` while the rest of the modal (header, crypto amounts) used the actual `priceUsd` resolved from `membershipMonthlyPrice` settings — so a $1/month plan still said "Pay $10". The button now uses `priceUsd` and stays consistent with the displayed price.
- **Misaligned Tracks toolbar buttons in the release editor**: The `Tracks` count badge (`1 Brani`) could wrap onto two lines, and the action buttons (`Add Library`, `Upload Audio`, `Import from Bandcamp`, `Add YouTube`) staggered when they wrapped. Added `whitespace-nowrap`/`shrink-0` to the badge and button labels, `items-center` + `sm:justify-end` to the button row, and `flex-nowrap` on each button so icons and labels stay on one line and align cleanly.

## [2.4.5] - 2026-06-29

### Fixed

- **Genre autocomplete stopped suggesting after the first comma-separated tag**: The `Genre / Tags` inputs (release editor, track modal, release modal) fed the raw `GENRES` list to a native `<datalist>`, which matches options against the *entire* input value. Once a value like `"Dream Pop, "` was entered, no single-genre option matched the whole string, so suggestions disappeared for every tag after the first. Added a `genreDatalistOptions()` helper that re-prefixes each option with the already-committed segments (and drops genres already present), so suggestions now work for every tag in a comma-separated list.

## [2.4.4] - 2026-06-29

### Fixed

- **"Buy on Bandcamp" button missing on External Showcase releases**: The release page (`AlbumDetails`) re-ran `JSON.parse()` on `album.external_links`, but the API (`AlbumRepository.mapAlbum`) already returns it as a parsed array. Parsing an array throws, so the code silently fell back to `[]`, leaving `externalBuyUrl` undefined and never rendering the external-purchase button. Now it accepts an already-parsed array (and still tolerates a legacy JSON string), so External Showcase releases correctly show the "Buy on Bandcamp" link in place of the on-platform purchase flow.

## [2.4.3] - 2026-06-29

### Fixed

- **Community register rate limit collapsed to a single global bucket behind a proxy**: `POST /api/community/register` keyed its 1-request-per-hour limit off a hand-rolled `X-Forwarded-For`/`req.socket.remoteAddress` lookup, which falls back to the nginx proxy IP when the header isn't parsed — making the per-IP limit apply globally to all visitors. Now uses `req.ip` (resolved via the already-enabled `trust proxy`). Also documented that the `X-Forwarded-For` nginx header is required for correct per-IP behavior.

## [2.4.2] - 2026-06-29

### Changed

- **Maintenance orphan sync performance**: When importing genuine orphan files during a maintenance scan, metadata parsing now runs with bounded concurrency (`p-limit`, 10 parallel) instead of strictly sequentially, speeding up large orphan reconciliations.

### Fixed

- Added the missing `p-limit` entry to `package-lock.json` so `npm ci` (CI server build, tests, and webapp build) no longer fails with "Missing: p-limit from lock file".

## [2.4.1] - 2026-06-29

### Fixed

- **Instance self-registration**: `POST /api/community/register` always returned `400 "url is required"` even with a valid JSON body, because no body parser was applied to the route (there is no global `express.json()`). Added `express.json()` to the route and accept the URL from the `?url=` query string as a fallback.

## [2.4.0] - 2026-06-29

### Added

- **Canonical Genre List**: Introduced `webapp/src/constants/genres.ts` with ~100 standardized genre names sourced from the Discogs taxonomy (an already-integrated metadata provider). Covers Electronic, Rock, Pop, Hip-Hop, Jazz, Classical, Folk, Latin, Reggae, World, and more.
- **Genre Normalization**: `normalizeGenre()` utility silently maps typo-variants to the canonical form on save (e.g. `"synth-pop"` → `"Synthpop"`, `"hard-core"` → `"Hardcore"`, `"hip-hop"` → `"Hip-Hop"`).
- **Genre Autocomplete**: All genre inputs (inline `GenreTags`, `AdminTrackModal`, `AdminReleaseModal`, `AdminReleaseEditor`) now show browser-native autocomplete suggestions from the canonical list via `<datalist>`.

### Changed

- `GenreTags` component no longer fetches existing DB genres via `API.getGenres()` for suggestions; the static canonical list is used instead (faster, no network round-trip).

## [2.3.1] - 2026-06-29

### Added

- **Admin Settings — Version Badge**: App version (from root `package.json`) now displayed at the bottom of the General tab. Injected at build time via Vite `define`; updates automatically on every version bump.

## [2.3.0] - 2026-06-17

### Added

- **External Showcase & Bandcamp Redirect Release Mode**:
  - A new `"external"` option in download experiences.
  - A prominent redirect button ("Buy on Bandcamp") for showcases.
  - Automatic proxying of direct external `http`/`https` URLs in the media engine to support streaming of Bandcamp tracks.
  - Direct import of release tracklists, durations, and preview stream links from Bandcamp.
  - Support for sequential save processes to correctly register imported tracks and preserve track ordering in showcases.
- **Admin Modular Feature Toggles**:
  - Ability to dynamically show/hide major platform sections: Live Streaming, Digital Store, Artist Social Hub, Federated Network, and Crate Digging (Dig).
  - Clean error/warning banners for disabled pages accessed via direct links.
  - Settings values mapped to `hideLive`, `hideStore`, `hideSocial`, `hideNetwork`, and `hideDig` properties in database.

### Changed

- **Admin Settings Panel Redesign**:
  - Split settings into clean, tabbed categories in a side-navigation layout (General, Features, Branding, Federation, Payments, Security).
  - Improved layout spacing and responsive constraints.
  - Premium design additions (hover animations, styled transitions, unified form styling).
- **Navigation Menu Filtering**:
  - Dynamic filtering of sidebar links based on active instance modules.
- **Performance Tuning & Cache Pre-warming**:
  - Added support for pre-warming the transcode cache (`POST /api/admin/system/prewarm-cache`) for lossless tracks (FLAC/WAV).
  - Configurable cache size (`TUNECAMP_TRANSCODE_CACHE_MAX_BYTES` up to 5GB) and timeout limits (`TUNECAMP_TRANSCODE_TIMEOUT_MS`).
  - Added support for Nginx `X-Accel-Redirect` to offload audio streaming from Node.js.
  - Added `env_file` integration in `docker-compose.yml` for seamless local configuration loading.
  - Cleaned up obsolete build args and environment variables related to Zen/ZenDB in `Dockerfile` and `docker-compose.yml` while preserving standard CapRover deployment arguments.
