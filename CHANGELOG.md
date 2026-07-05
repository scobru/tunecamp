# Changelog

All notable changes to this project will be documented in this file.

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
- Zen/GunDB leftovers: `isNonFatalError` no longer guards `GunDB`/`Zen` error strings; `gundb` keyword dropped from `package.json`.
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
  - Cleaned up obsolete build args and environment variables related to Zen/GunDB in `Dockerfile` and `docker-compose.yml` while preserving standard CapRover deployment arguments.
