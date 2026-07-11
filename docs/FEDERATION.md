# Federation & Decentralization in Tunecamp

Tunecamp leverages two primary technologies to enable a decentralized music ecosystem: **ActivityPub** for social federation and **federated HTTP/NodeInfo discovery** for finding other instances. It also provides full **Subsonic API** compatibility for mobile and desktop clients.

## Federated Discovery (HTTP / NodeInfo gossip)

Tunecamp discovers other instances by **gossip over HTTP** — there is no central relay and no shared registry. An instance crawls outward from a set of seed instances (its ActivityPub-followed TuneCamp sites plus `TUNECAMP_FEDERATION_SEEDS`), validates that each peer is a live TuneCamp via its NodeInfo, and stores the reachable set in local SQLite (`federated_instances`). Implemented in `src/server/modules/network/federated-discovery.service.ts`.

> **History**: earlier versions used the **Zen** decentralized graph for instance signaling, and before that for user identity (SEA keypairs), Zen-first auth, wallet derivation, and cross-instance roaming. **Zen has been removed entirely** (PRs #369/#370/#372): authentication is username/password (JWT), discovery is the HTTP gossip described here, and catalogs are exchanged directly over HTTP. The `zen` dependency and all `TUNECAMP_ZEN_*` env vars are gone.

### Key Roles

- **Seed-based crawl**: discovery starts from AP-followed TuneCamp actors and `TUNECAMP_FEDERATION_SEEDS`, then gossips outward (capped depth/breadth, dead instances pruned).
- **Liveness check**: a peer is only added if it answers as a live TuneCamp (NodeInfo type-check), not merely HTTP 200.
- **Music Discovery**: the "Network" page reads the federated set, then fetches catalogs directly via HTTP (`/api/catalog`), cached stale-while-revalidate.
- **Peer-track federation** (opt-in): when an instance enables *Federate Peer Tracks*, its currently-shared peer tracks ride along in `/api/catalog/full` and appear on remote Network pages (tagged `PEER`), streamable — and, if downloads are allowed, importable — cross-instance. These entries are ephemeral and use a short cache window so they vanish quickly when the peer disconnects. See [Sidecamp](./sidecamp.md#federating-peer-tracks-across-instances).
- **Cross-instance peer search** (opt-in): under the same *Federate Peer Tracks* flag, a logged-in user's global search fans out server-side to known federated instances (bounded 10, parallel, 3s timeout, SSRF-guarded) and merges their connected peers' matching tracks, tagged with `origin`. **Single hop only**; remote hits stream from the origin's public `federated-stream` endpoint (search + stream, no download). Exposed as `GET /api/peers/federated-search`.
- **One-click follow**: an admin can follow an instance directly by URL.

### Public endpoints

- `GET /api/community/instance` — this instance's own descriptor.
- `GET /api/community/peers` — known peers (the gossip surface).
- `GET /api/community/sites` — aggregated discoverable sites (local + federated + ActivityPub). CORS-enabled for external directories.
- `POST /api/community/register` — self-registration: submit your instance URL to a directory instance and appear immediately, without waiting for the next 6-hour crawl. See below.

### Self-registering with a directory

Instead of waiting up to 6 hours for gossip to reach a directory instance, admins can self-register:

```http
POST /api/community/register
Content-Type: application/json

{ "url": "https://your-instance.example.com" }
```

The directory instance will:
1. Probe your URL via NodeInfo (`/.well-known/nodeinfo`) to verify it is a reachable TuneCamp instance.
2. Store the metadata immediately — your instance appears in `GET /api/community/sites` right away.

**Responses:**

| Status | Meaning |
| :----- | :------ |
| `200 OK` | Registered. Appears in `/api/community/sites` immediately. |
| `400` | Missing or invalid `url` field. |
| `422` | URL is not a reachable TuneCamp instance (NodeInfo check failed). |
| `429` | Rate limited — 1 registration per IP per hour. `Retry-After` header included. |

The endpoint is public (no auth required) and CORS-enabled, so the [community website](https://github.com/scobru/tunecamp-website) can call it directly from the browser. The rate limit is enforced per IP to prevent abuse.

### Configuration

- `TUNECAMP_FEDERATION_SEEDS` (backend): comma/space-separated origin URLs of seed instances to bootstrap discovery. Optional — AP-followed TuneCamp sites also seed the crawl.

---

## ActivityPub: Fediverse Integration

ActivityPub allows Tunecamp to communicate with other platforms like Mastodon, Pleroma, Funkwhale, and Lemmy.

### Key Roles (Broadcaster Model)

- **Artist Profiles**: Every artist on Tunecamp is an ActivityPub "Person" actor.
- **Outbound Broadcasting**: Tunecamp focuses on a "Broadcaster" model. When an artist publishes a new release or a post, Tunecamp broadcasts a "Create Note" activity to all followers across the Fediverse.
- **Inbound Engagement**: Users on other Fediverse instances can follow Tunecamp artists and like/favorite/comment on their releases and posts. Replies and comments are federated back to Tunecamp.
- **Interoperability**: Tunecamp supports WebFinger and standard ActivityPub inboxes/outboxes. Note: Tunecamp no longer maintains an internal, Mastodon-style consumption timeline or client-side following mechanics to prioritize lightweight performance.

### Implementation Details

- **Keys**: RSA 4096-bit keypairs are automatically generated for every artist.
- **Attachments**: Broadcasts include "Audio" attachments (direct stream links) and "Image" attachments (cover art).
- **Public URL**: Federation requires `TUNECAMP_PUBLIC_URL` to be correctly configured with `https`.

### Configuration

- `TUNECAMP_PUBLIC_URL`: Required for Federation.
- **ActivityPub relay** (optional): To broadcast beyond direct followers, set the relay URL at runtime in the admin panel (stored as the `relayUrl` setting). This is **not** an environment variable.

### Troubleshooting: "Public key not found" on delivery

Remote servers (e.g. Mastodon) cache an actor's public key the first time they
see it and keep verifying signatures against that cached copy. If an actor's key
later changes — or if the same `/users/{handle}` URL previously served a
*different* identity (for example a **listener user actor before the account
became an artist**) — the remote keeps the stale key and rejects every activity
with `401 {"error":"Public key not found for key .../users/{handle}#main-key"}`.

Fix it from **Admin → Identity → the artist card → "Refresh federation"**
(`POST /api/admin/artists/:id/refresh-identity`). This ensures the artist has a
valid RSA key pair and broadcasts a signed `Update(Person)` to followers and the
relay, forcing remotes to re-fetch the actor document and replace the cached key.
The action is idempotent and safe to re-run.

---

## RSS / Atom Feeds

Beyond ActivityPub, Tunecamp can follow plain **RSS/Atom feeds** (podcasts, Owncast
streams, blogs) so their items show up alongside federated content.

- **Follow a feed**: `POST /api/admin/network/rss/follow` with the feed URL.
- **Storage**: a followed feed is stored as a remote actor with `type = 'rss'`; each item
  becomes a `remote_content` row.
- **Refresh**: feeds are refreshed by the RSS service (`src/server/modules/network/rss.service.ts`),
  independently of the ActivityPub outbox fetcher.

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
| Instance Discovery   | Federated HTTP / NodeInfo gossip | Internal (Tunecamp Nodes) |
| Mobile Streaming     | Subsonic API | External (Any client)     |
| Starred / Favorites  | Subsonic API | Local (per user)          |
