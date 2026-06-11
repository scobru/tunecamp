# Federation & Decentralization in Tunecamp

Tunecamp leverages two primary technologies to enable a decentralized music ecosystem: **ActivityPub** for social federation and **Zen** for instance discovery (signaling). It also provides full **Subsonic API** compatibility for mobile and desktop clients.

## Zen Protocol: Instance Discovery (Signaling)

Tunecamp uses the Zen decentralized graph **only as a signaling layer**: instances announce their public URL to a shared community registry so other instances can discover them. Everything else — accounts, playlists, comments, play history — lives in the server's local SQLite database, and catalogs are exchanged directly over HTTP.

> **Note**: Earlier versions used Zen for user identity (SEA keypairs), Zen-first authentication, wallet derivation, and cross-instance roaming. These have been removed: authentication is now username/password (JWT), and the web client no longer connects to Zen peers. Zen runs server-side only, in a dedicated worker thread.

### Key Roles

- **Community Registry**: Servers register themselves in a global decentralized directory (`tunecamp-community`).
- **Music Discovery**: The "Network" page reads the registry to discover other Tunecamp instances, then fetches their catalogs directly via HTTP (`/api/catalog`).
- **Instance Identity**: Each server holds a cryptographic keypair used to sign its registry entry.

### Secure Graph Strategy

Tunecamp uses a "Secure Graph" approach:

1.  **Authoritative Data**: Data signed by a server's public key is stored in its specific namespace.
2.  **Public Directory**: A reference (link) is placed in a public directory namespace (`tunecamp-community`).
3.  **Verification**: When discovery scans the network, it validates the data against the sender's public key.

### Configuration

- `TUNECAMP_ZEN_PEERS` (backend): comma/space-separated Zen relay peer URLs.
- `TUNECAMP_ZEN_MEMORY_LIMIT` (backend): memory limit (MB) for the Zen network worker.

---

## ActivityPub: Fediverse Integration

ActivityPub allows Tunecamp to communicate with other platforms like Mastodon, Pleroma, Funkwhale, and Lemmy.

### Key Roles

- **Artist Profiles**: Every artist on Tunecamp is an ActivityPub "Person" actor.
- **Followers & Likes**: Users on other Fediverse instances can follow Tunecamp artists and like/favorite their releases and posts.
- **Broadcasts**: When an artist publishes a new release or a post, Tunecamp broadcasts a "Create Note" activity to all followers.
- **Interoperability**: Tunecamp supports WebFinger and standard ActivityPub inboxes/outboxes.

### Implementation Details

- **Keys**: RSA 4096-bit keypairs are automatically generated for every artist.
- **Attachments**: Broadcasts include "Audio" attachments (direct stream links) and "Image" attachments (cover art).
- **Public URL**: Federation requires `TUNECAMP_PUBLIC_URL` to be correctly configured with `https`.

### Configuration

- `TUNECAMP_PUBLIC_URL`: Required for Federation.
- **ActivityPub relay** (optional): To broadcast beyond direct followers, set the relay URL at runtime in the admin panel (stored as the `relayUrl` setting). This is **not** an environment variable.

---

## Funkwhale Compatibility

Tunecamp is compatible with **Funkwhale** instances for music-specific federation.

### How It Works

- **NodeInfo**: Tunecamp exposes metadata at `/.well-known/nodeinfo` including Funkwhale-compatible fields (`library.federationEnabled`, `supportedUploadExtensions`, `funkwhaleVersion`).
- **Federation Libraries**: `GET /api/v1/federation/libraries` returns Tunecamp's music catalog in Funkwhale's expected format.
- **NodeInfo 2.0 API**: `GET /api/v1/instance/nodeinfo/2.0` provides instance metadata for Funkwhale-style discovery.
- **Actor Types**: Artists are exposed as `["Person", "Artist", "MusicArtist"]` with Funkwhale namespace extensions.
- **Audio Attachments**: Release broadcasts include `Audio` objects with `funkwhale:bitrate` and `funkwhale:duration` properties.

---

## Subsonic API: Client Compatibility

Tunecamp exposes a full **Subsonic REST API** at `/rest` (API version 1.16.1), enabling connection from any Subsonic-compatible client.

### Authentication Methods

| Method      | Format                        | Description             |
| :---------- | :---------------------------- | :---------------------- |
| Clear-text  | `p=password`                  | Plain password in query |
| Hex-encoded | `p=enc:hex`                   | Password hex-encoded    |
| Token+Salt  | `t=md5(password+salt)&s=salt` | Secure token-based auth |

### Scrobbling & Stats

When a Subsonic client scrobbles a track (`scrobble.view`), Tunecamp records the play in the local SQLite database (`play_history` table). All scrobbling and playback statistics are stored locally on the server.

---

## Architecture Summary

| Feature              | Technology   | Scope                     |
| :------------------- | :----------- | :------------------------ |
| Artist Following     | ActivityPub  | External (Mastodon, etc)  |
| Likes / Favorites    | ActivityPub  | External (Mastodon, etc)  |
| Release Notification | ActivityPub  | External (Mastodon, etc)  |
| Funkwhale Federation | ActivityPub  | External (Funkwhale)      |
| Instance Discovery   | Zen          | Internal (Tunecamp Nodes) |
| Mobile Streaming     | Subsonic API | External (Any client)     |
| Starred / Favorites  | Subsonic API | Local (per user)          |
