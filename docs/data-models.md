# Data Models - TuneCamp

## Overview
TuneCamp uses SQLite for local metadata storage and Zen (a decentralized graph) for social interactions and community signaling.

## Database Schema (Local SQLite)
The primary data is stored in `tunecamp.db`. Core tables include:

### 1. Music Entities
- **Artists:** `id`, `name`, `slug`, `bio`, `photo_path`, `visibility`, `wallet_address`.
- **Albums:** `id`, `artist_id`, `title`, `slug`, `year`, `cover_path`, `visibility`, `owner_id`, `is_release`.
- **Tracks:** `id`, `album_id`, `artist_id`, `title`, `slug`, `file_path`, `duration`, `bitrate`, `track_num`, `visibility`, `waveform`, `lyrics`, `external_artwork`.

### 2. Social & Identity (Local)
- **Admin/Users:** `id`, `username`, `password_hash`, `role` (`admin`, `user`, `super_user`), `artist_id`, `isActive`.
- **RemoteActors:** Caches `pubKey`, `name`, `avatar`, `domain`.

### 3. Decentralized Models (Zen Graph)
- **SiteRecord:** `id`, `url`, `title`, `artistName`, `pub` (owner key), `lastSeen`, `version`.
- **Comment:** `id` (slugified), `trackId`, `pubKey`, `username`, `text`, `signature`, `createdAt`.
- **Stats:** Play/Like/Download counts mapped by `releaseSlug` and `trackId` across the peer network.

### 3. System
- **Settings:** Key-value store for server configuration (site name, ports, keys).
- **LibraryStats:** Aggregated data for fast dashboard rendering.

## Decentralized Models (Zen Graph)
Defined in `src/server/zendb.ts`, these models handle data shared across the network:

### UserProfile
- `pubKey`: Unique identifier.
- `username`: Global alias.
- `avatar`: URL to profile image.

### Comment
- `id`: Unique identifier.
- `trackId`: Link to local/remote track.
- `pubKey`: Author identity.
- `text`: Comment content.
- `createdAt`: Timestamp.

### Community Stats
- **Downloads/Plays/Likes:** Counts stored per release/track slug to allow for decentralized popularity tracking.
