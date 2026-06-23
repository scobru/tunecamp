# Data Models

TuneCamp uses **SQLite** as its relational database engine for managing music metadata, users, and social interactions.

## Database Schema

### Core Entities (Music Library)

- **`artists`**: Stores information about artists (name, biography, image, federated identifiers).
- **`albums`**: Represents releases (title, artist, year, cover art).
- **`tracks`**: Individual audio tracks (title, album, track number, duration, file path, bitrate, `genre`, `fingerprint` for internal deduplication). Genre is a column on `tracks`, not a separate table.
- **`album_ownership`** / **`track_ownership`**: On-chain ownership (NFT) of albums and tracks.

### Users & Social

- **`admin`**: Table of all local accounts (all roles, not just admin: the name is historical). Includes `role`, `password_hash`, `artist_id`, storage quotas.
- **`gun_users`** / **`gun_cache`**: Legacy tables from the removed Zen identity layer — retained for schema compatibility but no longer written to. See [FEDERATION.md](FEDERATION.md) for history.
- **`followers`**: Follow relations between local and remote users.
- **`posts`** / **`ap_notes`**: Messages and activities in the Fediverse.
- **`starred_items`** / **`item_ratings`**: User favorites and ratings.
- **`comments`**: Comments on tracks and albums.
- **`chat_messages`**: Community chat history.
- **`bookmarks`**: Personal bookmarks.

### Federation (ActivityPub)

- **`remote_actors`**: Cache of remote user profiles discovered via ActivityPub.
- **`remote_content`**: Local copy of metadata for federated content (e.g., posts from other servers).

### Advanced Features

- **`playlists`** / **`playlist_tracks`**: User playlist management.
- **`play_history`**: Listens log for stats and recommendations.
- **`unlock_codes`**: Access codes for protected or paid content.
- **`torrents`** / **`soulseek_downloads`**: File sharing integrations for retrieving content.
- **`dig_sessions`** / **`dig_crate_items`** / **`dig_history`** / **`dig_cache`**: State and cache of "Dig" mode (crate digging / music discovery).
- **`assets`** / **`storage_accounts`**: Store assets and connected cloud storage accounts (e.g., Google Drive).
- **`track_stats`** / **`release_stats`**: Aggregated play counters.
- **`settings`**: Instance configuration (key/value).
- **`api_tokens`** / **`oauth_clients`** / **`oauth_links`**: API tokens and OAuth clients (e.g., Fediverse login).
- **`ap_interactions`** / **`ap_replies`** / **`ap_following`** / **`ap_delivery_queue`** / **`fedify_kv`**: ActivityPub state and delivery queue.
- **`system_plugins`**: State (enabled/disabled) of plugin providers.

## Key Relationships

1. **One-to-Many**: An `artist` has many `albums`. An `album` has many `tracks`.
2. **Many-to-Many**: A `playlist` contains many `tracks` via the `playlist_tracks` pivot table.
3. **Federation**: A local `post` can be linked to an actor in `remote_actors`.

## Data Access

Data access logic is encapsulated in **Repositories** (`src/server/repositories/`), which use direct SQL queries or lightweight query builders to interact with `better-sqlite3`.

## Migrations

The database is initialized and updated automatically in `src/server/core/database.ts`, which contains DDL scripts for table creation and idempotent migrations (`ALTER TABLE ... ADD COLUMN`) executed at application startup.
