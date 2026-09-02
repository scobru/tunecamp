# Backend Architecture

The TuneCamp backend is a Node.js application built with Express, designed to be federated, decentralized, and music-content oriented.

## Tech Stack

- **Framework**: Express.js (TypeScript)
- **Database**: SQLite3 (`better-sqlite3`)
- **Social Protocol**: ActivityPub (via Fedify)
- **Instance Discovery**: Gossip over HTTP (federated discovery and NodeInfo crawling)
- **Multimedia**: FFmpeg for transcoding and metadata

## Core Components

### 1. Federated Discovery (`modules/network/federated-discovery.service.ts`)

TuneCamp discovers other instances via **gossip over HTTP** — there is no central relay or shared registry.

- The instance crawls starting from a set of seeds (the TuneCamp instances followed via ActivityPub plus `TUNECAMP_FEDERATION_SEEDS`).
- Evaluates if each peer is an active TuneCamp instance via NodeInfo and stores reachable instances in the local SQLite database (`federated_instances` table).
- Catalogs are then read and synced directly via HTTP REST.

### 2. ActivityPub Federation (`modules/fedify/`, `modules/activitypub/`)

Allows TuneCamp to interact with other instances in the Fediverse (such as Mastodon, Funkwhale, or other TuneCamp instances).

- Implements ActivityPub Actor, Note, and other objects.
- Handles message delivery and retrieval of remote content.

### 3. Catalog Module (`modules/catalog/`)

Responsible for scanning and organizing local music.

- **Scanner**: Scans folders for new audio files. To ensure granular control, the scanner creates albums in **Draft** mode in the local library. This content is not publicly visible until manually promoted to a **Formal Release** via the Admin Dashboard.
- **Metadata**: Extracts tags (ID3, Vorbis), generates waveforms, and integrates external providers (MusicBrainz, Discogs, iTunes, Lyrics.ovh) to enrich data and lyrics.

### 4. Security & Authentication (`modules/auth/auth.service.ts`, `middleware/auth.ts`)

- Manages local users with bcrypt passwords.
- Authentication via JWT (secret from env, `.jwt-secret` file, or generated at first startup).
- Role-Based Access Control (RBAC): Instance Owner, Manager, Curator, Listener (see [ROLES.md](./ROLES.md)).

### 5. Community: Live (`modules/live/`)

- **Live**: In-memory registry of live sessions (`live.service.ts`); media **passes through the server**. The artist's browser captures audio with `MediaRecorder` and sends webm chunks, which `HlsLiveService` (`hls.service.ts`) feeds to a persistent FFmpeg process. FFmpeg produces a rolling HLS playlist (AAC segments) served to all listeners: a single shared encoding, not a copy per listener as in the legacy WebRTC mesh.

### 6. Blockchain Integration (`modules/publishing/`, routes `api/payments.ts`)

Interfaces with smart contracts to handle prices, payments, and content unlocking.

## Data Model

TuneCamp uses **SQLite** as its relational database engine for managing music metadata, users, and social interactions. The database is initialized and updated automatically in `src/server/core/database.ts`, which contains DDL scripts for table creation and idempotent migrations (`ALTER TABLE ... ADD COLUMN`) executed at application startup.

### Core Entities (Music Library)

- **`artists`**: Stores information about artists (name, biography, image, federated identifiers).
- **`artist_events`**: Upcoming live dates, concerts, and tour events for artists.
- **`albums`**: Represents releases (title, artist, year, cover art).
- **`tracks`**: Individual audio tracks (title, album, track number, duration, file path, bitrate, `genre`, `fingerprint` for internal deduplication). Genre is a column on `tracks`, not a separate table.
- **`album_ownership`** / **`track_ownership`**: On-chain ownership (NFT) of albums and tracks.

### Users & Social

- **`admin`**: Table of all local accounts (all roles, not just admin: the name is historical). Includes `role`, `password_hash`, `artist_id`, storage quotas.
- **`password_reset_tokens`**: Time-limited cryptographic tokens for Brevo-powered email password resets.
- **`zen_users`**: FID/Zen identity profile cache (pub key, alias, avatar), kept in sync with `admin.zen_pub` for cross-instance SSO login.
- **`zen_cache`**: Legacy table from the removed ZEN sync layer — retained for schema compatibility but no longer written to.
- **`fid_registry`**: Federation identity passports and cryptographic claim verification registry.
- **`followers`** / **`following`**: Follow relations between local users and remote ActivityPub actors.
- **`posts`** / **`ap_notes`**: Messages and activities in the Fediverse.
- **`board_messages`**: Community pinboard / public bulletin board messages.
- **`starred_items`** / **`item_ratings`**: User favorites and track ratings.
- **`comments`**: User comments on tracks and releases.
- **`reports`**: Copyright and content abuse reports awaiting moderation in the admin panel.
- **`bookmarks`**: Personal user bookmarks.

### Retired: chat tables

Peer chat was removed; `peer_chat_messages`, `peer_chat_bans`, `peer_chat_mutes`, `chat_rooms`, `chat_room_members` and `chat_room_messages` are still created for rollback safety but nothing reads or writes them. Dropping them is a pending migration.

### P2P Peer Sharing (Sidecamp)

- **`peer_sessions`**: Active daemon connection sessions authenticated over `/ws/peer`.
- **`peer_tracks`** / **`peer_tracks_new`**: Ephemeral track manifests shared by active Sidecamp daemons.
- **`peer_catalog_cache`**: SQLite cache of remote instances' peer catalogs for federated network browsing.

### Federation (ActivityPub & Discovery)

- **`remote_actors`**: Cache of remote user profiles discovered via ActivityPub.
- **`remote_content`**: Local copy of metadata for federated content (e.g., posts from other servers).
- **`ap_interactions`** / **`ap_replies`** / **`ap_following`** / **`ap_delivery_queue`** / **`fedify_kv`**: ActivityPub state, actor signatures, and outbound delivery queue.
- **`federated_instances`**: Discovered network peers tracked by the HTTP gossip discovery service.

### Advanced Features

- **`playlists`** / **`playlist_tracks`**: User playlist management and track order.
- **`play_history`**: Listens log for stats, scrobbling, and recommendations.
- **`unlock_codes`**: Access codes for protected or paid content.
- **`torrents`**: File sharing integrations for retrieving content (P2P acquisition itself lives in the companion [Sidecamp](./sidecamp.md) app).
- **`assets`** / **`storage_accounts`**: Store assets and connected cloud storage accounts (e.g., Google Drive).
- **`track_stats`** / **`release_stats`**: Aggregated play counters and listening time analytics.
- **`settings`**: Instance configuration key/value store.
- **`api_tokens`** / **`oauth_clients`** / **`oauth_links`**: Personal API tokens (e.g. MCP) and OAuth linkages.
- **`system_plugins`**: State (enabled/disabled) of modular plugin providers.
- **`samples`** / **`sample_packs`**: Free (non-store) sample uploads — BPM, key, license, moderation status. A sample optionally belongs to a pack via `samples.pack_id`.
- **`collab_projects`** / **`collab_versions`** / **`collab_stems`**: Multi-artist collaborative track building with append-only versions and audio stem uploads.

### Key Relationships

1. **One-to-Many**: An `artist` has many `albums`. An `album` has many `tracks`.
2. **Many-to-Many**: A `playlist` contains many `tracks` via the `playlist_tracks` pivot table.
3. **Federation**: A local `post` can be linked to an actor in `remote_actors`.

### Data Access

Data access logic is encapsulated in **Repositories** (`src/server/repositories/`), which use direct SQL queries or lightweight query builders to interact with `better-sqlite3`.

## Reliability & Monitoring

- The `GET /health` endpoint is registered before the federation middleware, so a blocked integration cannot shadow it (used by the Docker `HEALTHCHECK`).
- Opt-in Sentry crash reporting via `SENTRY_DSN` (see [monitoring.md](./monitoring.md)).

## Data Flows

1. **Scanning**: The `Scanner` detects a file -> the metadata service extracts the data -> the repository saves it to the DB.
2. **Streaming**: API request -> verify permissions -> file stream (with FFmpeg transcoding if necessary).
3. **Social**: New post -> the ActivityPub service creates the object -> Fedify delivers it to remote actors.

## REST API

Endpoints are split into thematic routes in `src/server/routes/`:

- `/api/tracks`, `/api/albums`, `/api/artists`: Library management.
- `/api/admin`: Administration features.
- `/api/ap`: Endpoints for ActivityPub federation.
- `/api/live`: Live sessions.
- `/rest`: Compatibility with the Subsonic/OpenSubsonic protocol.
- `/health`: Health check.
