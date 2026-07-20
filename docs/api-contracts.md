# API Contracts

TuneCamp exposes a RESTful API for webapp–backend communication, plus dedicated endpoints for ActivityPub and the Subsonic protocol. The full OpenAPI specification is in [openapi.yml](./openapi.yml).

## Authentication

Most endpoints require a **JWT (JSON Web Token)** in the `Authorization` header:

```
Authorization: Bearer <token>
```

Obtain a token by posting credentials to `POST /api/auth/login`.

---

## Core Endpoints

### Authentication (`/api/auth`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/users/register` | Register a new user |
| `POST` | `/api/auth/login` | Authenticate and receive a JWT |
| `GET` | `/api/auth/status` | Return the current session and user profile |

### Music Catalog (`/api/catalog`, `/api/tracks`, `/api/albums`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/albums` | List all local albums. Returns `status` (`draft` \| `published`) and `is_release` (boolean) to distinguish library content from official releases |
| `GET` | `/api/albums/:id` | Album details including the track list |
| `GET` | `/api/artists` | List all artists |
| `POST` | `/api/tracks` | Create a track (import). Accepts an opt-in `localize` boolean: when set on a rippable service (`bandcamp`/`youtube`/`soundcloud`) with a source `url`, the server downloads the audio into a durable local file in the background after responding |
| `GET` | `/api/tracks/:id` | Track metadata |
| `GET` | `/api/tracks/:id/stream` | Binary audio stream (supports `Range` for cloud tracks) |
| `GET` | `/api/tracks/:id/download` | Download a single track's local audio file |
| `POST` | `/api/tracks/:id/localize` | Admin-only: download an external track's audio into a durable local file |
| `GET` | `/api/albums/:id/download` | Download a ZIP of the album's local audio files (skips streaming/linked tracks) |
| `GET` | `/api/releases/:id/download` | Download a ZIP of a release's local audio files. Resolves numeric id or slug; private releases gated to owner/admin |
| `GET` | `/api/waveform/:id` | Waveform data for visualisation |
| `GET` | `/api/releases/:id/artwork/:filename` | Serve additional release artwork securely |

### Payments & Monetisation (`/api/payments`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/payments/stripe/create-session` | Create a Stripe Checkout session for fiat purchases |
| `POST` | `/api/payments/stripe/create-trackcap-session` | Create a Stripe Checkout session to buy extra track-upload slots |
| `GET` | `/api/payments/onramp-config` | Stripe Crypto Onramp configuration |
| `POST` | `/api/payments/verify` | Verify an on-chain transaction (ETH/USDC) on Base |
| `GET` | `/api/payments/download/:trackId?code=...` | Download a purchased track via unlock code |
| `GET` | `/api/payments/rate/USD` | Current ETH/USD exchange rate |

### Storage & Cloud (`/api/storage`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/storage/gdrive/auth` | Start the Google Drive OAuth2 flow |
| `GET` | `/api/storage/gdrive/files` | List files and folders on Google Drive |
| `POST` | `/api/storage/gdrive/import` | Import a Drive file as a `gdrive://` reference |
| `POST` | `/api/storage/gdrive/localize/:id` | Permanently download a cloud file to the local server |

### Metadata & External Search (`/api/metadata`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/metadata/search?q=...` | Search album metadata across external providers (MusicBrainz, Discogs, iTunes, TheAudioDB) |
| `GET` | `/api/metadata/lyrics?artist=...&title=...` | Fetch song lyrics via Lyrics.ovh |
| `POST` | `/api/metadata/apply` | Apply selected metadata to a local track |

### Social, Comments & Posts (`/api/artists`, `/api/comments`, `/api/ap`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/artists/:id/posts` | List an artist's public posts |
| `POST` | `/api/admin/posts` | Create a new post (admin only) |
| `GET` | `/api/comments/track/:trackId` | List comments for a specific track |
| `POST` | `/api/comments/track/:trackId` | Add a comment (requires authentication) |
| `GET` | `/api/ap/timeline/:artistId` | Recent activity from followed actors |
| `GET` | `/api/ap/users/:slug` | ActivityPub profile (actor) for a local user |
| `POST` | `/api/ap/inbox` | Receive incoming remote ActivityPub messages |
| `POST` | `/api/releases/:id/report` | Report a release for copyright or inappropriate content |
| `GET` | `/api/admin/reports` | List all active release reports (admin only) |
| `DELETE` | `/api/admin/reports/:id` | Resolve or dismiss a report (admin only) |

### Administration (`/api/admin`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/system/users` | List registered users (admin only) |
| `POST` | `/api/admin/system/rescan` | Trigger a full library rescan |
| `POST` | `/api/admin/upload/additional-artworks` | Upload multiple additional artworks/booklets for a release (admin/artist only) |
| `GET` | `/api/admin/stats` | Server and database usage statistics |
| `GET` | `/api/admin/system/resources` | Live process/host resource snapshot — CPU, memory, host RAM, SQLite DB size, and running background tasks (root admin only) |
| `GET` | `/api/admin/storage/overview` | Instance-wide disk usage and per-user breakdown (root admin only) |

> P2P content acquisition (Soulseek, BitTorrent, yt-dlp) has moved out of the backend into the [Sidecamp desktop app](./sidecamp.md); the former `/api/admin/torrents*` endpoints no longer exist.

### Radio (`/api/radio`)

A single always-on station that streams the instance's catalog. Start/stop is admin-only; the stream and feeds are public.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/radio` | Current station status (playing track, listener count) |
| `POST` | `/api/radio/start` | Start the station (admin only) |
| `POST` | `/api/radio/stop` | Stop the station (admin only) |
| `GET` | `/api/radio/stream.m3u` | M3U playlist for external players |
| `GET` | `/api/radio/feed.rss` | RSS feed of the station |
| `GET` | `/api/radio/hls/:file` | HLS playlist/segments for in-browser playback |

---

## Third-Party Protocols

### Subsonic API (`/rest`)

TuneCamp implements the Subsonic protocol (v1.16.1) for compatibility with existing mobile clients such as DSub, Symfonium, Tempo, and Substreamer.

- Base path: `/rest/*.view`
- Supported methods include: `getAlbumList`, `getMusicDirectory`, `stream`, and more.

See [SUBSONIC.md](./subsonic.md) for the full compatibility table.

### Model Context Protocol (`/api/mcp`)

TuneCamp implements MCP so that external AI clients can query the catalog and server statistics.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/mcp/sse` | Open the async SSE channel. Requires `Bearer tc_...` authentication |
| `POST` | `/api/mcp/message` | Send a JSON-RPC request from client to server |

See [mcp-setup-guide.md](./mcp-setup-guide.md) for client configuration.

---

## Response Format

All API responses (except audio streams) are **JSON**. On error, the server returns an appropriate HTTP status code and an error object:

```json
{
  "error": "Descriptive error message"
}
```
