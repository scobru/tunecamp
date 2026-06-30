# Changelog

All notable changes to this project will be documented in this file.

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
