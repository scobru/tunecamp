# API Contracts - TuneCamp

## Overview
TuneCamp provides a RESTful API for client interaction, ActivityPub for federation, and a Subsonic-compatible API for legacy clients.

## REST API Endpoints (Core)

### Authentication
- `POST /api/auth/login`: 
    - **Body:** `{ username, password, pubKey?, proof? }`
    - **Logic:** Supports standard password auth or decentralized identity (Zen) via pubKey/proof.
    - **Response:** JWT token, `pair` (Zen keys), `mustChangePassword` flag.
- `POST /api/auth/setup`: First-run admin setup.
- `POST /api/auth/password`: Change password (Admin only).
- `GET /api/auth/status`: Check session, returns role and Zen identity status.

### Music Catalog
- `GET /api/albums/search?q=...&limit=...`: Search albums with visibility filters.
- `POST /api/albums/:id/star`: Star/Unstar an album.
- `POST /api/albums/:id/rating`: Set rating (0-5).
- `POST /api/albums/:id/promote`: Promote a library album to a public "Release".
- `GET /api/albums/:id/cover`: Get cover art (supports local paths or external redirects).

### Streaming
- `GET /api/stream.view?id=tr_...&format=...&maxBitRate=...`: Subsonic-compatible stream endpoint.
- **Logic:** Transcodes lossless (FLAC/WAV) to MP3 on-the-fly using FFmpeg if requested or needed for bandwidth.
- **Proxy:** `/api/proxy/stream?url=...` for fetching remote federated audio safely.

### User Content
- `GET /api/playlists`: List user/public playlists.
- `POST /api/playlists`: Create a new playlist.
- `GET /api/posts`: Get social posts (Fediverse).
- `GET /api/comments`: Get comments for a track.

### Administration
- `GET /api/admin/stats`: System-wide statistics.
- `POST /api/admin/backup`: Trigger database backup.
- `GET /api/admin/users`: Manage user accounts.
- `POST /api/admin/maintenance`: Trigger library scans and cleanup.

### Specialized APIs
- **ActivityPub (`/api/activitypub/*`):** Handles webfinger, actor profiles, inboxes, and outboxes for federation.
- **Subsonic (`/api/subsonic/*`):** Implements the Subsonic REST API (v1.16.1 compatible) for third-party apps like DSub, Amperfy, etc.
- **Metadata (`/api/metadata/*`):** Integration with external services for tagging and cover art.

## Common Response Formats
Standard REST responses use JSON. Success responses typically return the requested object or an array. Error responses include a status code and an error message object.
