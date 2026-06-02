# Federation & Decentralization in Tunecamp

Tunecamp leverages two primary technologies to enable a decentralized music ecosystem: **ActivityPub** for social federation and **Zen** for decentralized data storage and discovery. It also provides full **Subsonic API** compatibility for mobile and desktop clients.

## Zen Protocol: Decentralized Social & Discovery

The Zen protocol (built on the Zen decentralized graph) is used for features that require real-time, decentralized synchronization without a central authority.

### Key Roles

- **Community Registry**: Servers can register themselves in a global decentralized directory.
- **Music Discovery**: The "Network" page scans Zen peers to discover other Tunecamp instances and their public tracks.
- **Social Features**: Comments, track play/download stats, and user playlists are stored in Zen.
- **Identity (SEA)**: Each server and user has a cryptographic keypair (SEA) for signing data, verifying social interactions, and authenticating across instances.
- **Cross-Instance Roaming**: Users can log in to any sibling instance using their Zen identity. The instance verifies their cryptographic proof and lazily creates a local profile.

### Secure Graph Strategy

Tunecamp uses a "Secure Graph" approach:

1.  **Authoritative Data**: Data signed by a server's public key is stored in its specific namespace.
2.  **Public Directory**: A reference (link) is placed in a public directory namespace (`tunecamp-community`).
3.  **Verification**: When discovery scans the network, it validates the data against the sender's public key.

### Decentralized Identity & Auth Flow

Tunecamp implements a **Zen-first authentication** flow:

1.  **Registration**: A Zen SEA keypair is generated on the client. The backend verifies the cryptographic signature of the username before creating the local account, linking the public key.
2.  **Login**: The client authenticates against Zen peers first. It then generates a proof-of-possession (signature) sent to the backend.
3.  **Roaming**: If a user hits a new Tunecamp instance where they don't have an account, they provide their Zen proof. The backend verifies this against the peer network and lazily creates a local SQLite entry and Artist profile, allowing "session roaming."

### Configuration

Set Zen relay peers using:

- `TUNECAMP_GUN_PEERS` (Backend)
- `VITE_GUN_PEERS` (Frontend)

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

### Scrobbling & Zen

When a Subsonic client scrobbles a track (`scrobble.view`), Tunecamp records the play in the local database **and** increments the play count in Zen for public/unlisted releases, enabling decentralized play statistics.

---

## Architecture Summary

| Feature              | Technology   | Scope                     |
| :------------------- | :----------- | :------------------------ |
| Artist Following     | ActivityPub  | External (Mastodon, etc)  |
| Likes / Favorites    | ActivityPub  | External (Mastodon, etc)  |
| Release Notification | ActivityPub  | External (Mastodon, etc)  |
| Funkwhale Federation | ActivityPub  | External (Funkwhale)      |
| User Identity / Roaming | Zen        | Internal (Tunecamp Nodes) |
| Mobile Streaming     | Subsonic API | External (Any client)     |
| Starred / Favorites  | Subsonic API | Local (per user)          |
 Favorites  | Subsonic API | Local (per user)          |
