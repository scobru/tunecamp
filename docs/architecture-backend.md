# Backend Architecture

The TuneCamp backend is a Node.js application built with Express, designed to be federated, decentralized, and music-content oriented.

## Tech Stack

- **Framework**: Express.js (TypeScript)
- **Database**: SQLite3 (`better-sqlite3`)
- **Social Protocol**: ActivityPub (via Fedify)
- **Instance Discovery**: Gossip over HTTP (federated discovery and NodeInfo crawling)
- **Multimedia**: FFmpeg for transcoding and metadata

## Core Components

### 1. Database System (`core/database.ts`)
Manages local persistence via SQLite. Tables include:
- `artists`, `albums`, `tracks`: Core of the music library.
- `remote_actors`, `remote_content`: Cache for ActivityPub federation.
- `unlock_codes`: Key-based access management.
- `chat_messages`: Community chat history.

### 2. Federated Discovery (`modules/network/federated-discovery.service.ts`)
TuneCamp discovers other instances via **gossip over HTTP** — there is no central relay or shared registry.
- The instance crawls starting from a set of seeds (the TuneCamp instances followed via ActivityPub plus `TUNECAMP_FEDERATION_SEEDS`).
- Evaluates if each peer is an active TuneCamp instance via NodeInfo and stores reachable instances in the local SQLite database (`federated_instances` table).
- Catalogs are then read and synced directly via HTTP REST.

### 3. ActivityPub Federation (`modules/fedify/`, `modules/activitypub/`)
Allows TuneCamp to interact with other instances in the Fediverse (such as Mastodon, Funkwhale, or other TuneCamp instances).
- Implements ActivityPub Actor, Note, and other objects.
- Handles message delivery and retrieval of remote content.

### 4. Catalog Module (`modules/catalog/`)
Responsible for scanning and organizing local music.
- **Scanner**: Scans folders for new audio files. To ensure granular control, the scanner creates albums in **Draft** mode in the local library. This content is not publicly visible until manually promoted to a **Formal Release** via the Admin Dashboard.
- **Metadata**: Extracts tags (ID3, Vorbis), generates waveforms, and integrates external providers (MusicBrainz, Discogs, iTunes, Lyrics.ovh) to enrich data and lyrics.

### 5. Security & Authentication (`modules/auth/auth.service.ts`, `middleware/auth.ts`)
- Manages local users with bcrypt passwords.
- Authentication via JWT (secret from env, `.jwt-secret` file, or generated at first startup).
- Role-Based Access Control (RBAC): Instance Owner, Manager, Curator, Listener (see [ROLES.md](./ROLES.md)).

### 6. Community: Chat & Live (`modules/chat/`, `modules/live/`)
- **Chat**: Standalone instance chat with persistent history in SQLite.
- **Live**: In-memory registry of live sessions (`live.service.ts`); media **passes through the server**. The artist's browser captures audio with `MediaRecorder` and sends webm chunks, which `HlsLiveService` (`hls.service.ts`) feeds to a persistent FFmpeg process. FFmpeg produces a rolling HLS playlist (AAC segments) served to all listeners: a single shared encoding, not a copy per listener as in the legacy WebRTC mesh.

### 7. Blockchain Integration (`modules/publishing/`, routes `api/payments.ts`)
Interfaces with smart contracts to handle prices, payments, and content unlocking.

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
- `/api/chat`, `/api/live`: Community chat and live sessions.
- `/rest`: Compatibility with the Subsonic/OpenSubsonic protocol.
- `/health`: Health check.
