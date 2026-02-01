# TuneCamp Server API

REST API documentation for TuneCamp Server Mode (`tunecamp server`).

**Base URL**: `http://localhost:1970/api`

## Authentication

JWT-based authentication. Protected endpoints require `Authorization: Bearer <token>` header.

### Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/setup` | ❌ | Set admin password (first run) |
| `POST` | `/auth/login` | ❌ | Login, returns JWT token |
| `POST` | `/auth/password` | ✅ | Change admin password |
| `GET` | `/auth/status` | ❌ | Check auth status |

---

## Tracks

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/tracks` | ❌ | List all tracks |
| `GET` | `/tracks/:id` | ❌ | Get track details |
| `GET` | `/tracks/:id/stream` | ❌ | Stream audio file |
| `PUT` | `/tracks/:id` | ✅ | Update track metadata |
| `DELETE` | `/tracks/:id` | ✅ | Delete track |

---

## Albums

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/albums` | ❌ | List all albums |
| `GET` | `/albums/releases` | ❌ | List public releases |
| `GET` | `/albums/:id` | ❌ | Get album with tracks |
| `GET` | `/albums/:id/cover` | ❌ | Get cover image |
| `GET` | `/albums/:id/download` | ❌ | Download as ZIP |
| `POST` | `/albums/:id/promote` | ✅ | Promote to release |

---

## Artists

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/artists` | ❌ | List all artists |
| `GET` | `/artists/:id` | ❌ | Get artist details |
| `PUT` | `/artists/:id` | ✅ | Update artist |
| `DELETE` | `/artists/:id` | ✅ | Delete artist |
| `GET` | `/artists/:id/avatar` | ❌ | Get artist avatar |

---

## Releases

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/releases` | ❌ | List all releases |
| `POST` | `/releases` | ✅ | Create release |
| `GET` | `/releases/:slug` | ❌ | Get release details |
| `PUT` | `/releases/:id` | ✅ | Update release |
| `DELETE` | `/releases/:id` | ✅ | Delete release |
| `POST` | `/releases/:id/tracks` | ✅ | Upload track to release |

---

## Playlists

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/playlists` | ❌ | List all playlists |
| `POST` | `/playlists` | ❌ | Create playlist |
| `GET` | `/playlists/:id` | ❌ | Get playlist with tracks |
| `DELETE` | `/playlists/:id` | ❌ | Delete playlist |
| `POST` | `/playlists/:id/tracks` | ❌ | Add track to playlist |
| `DELETE` | `/playlists/:id/tracks/:trackId` | ❌ | Remove track |

---

## Uploads

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/upload/track` | ✅ | Upload audio file |
| `POST` | `/upload/cover/:albumId` | ✅ | Upload album cover |
| `POST` | `/upload/avatar/:artistId` | ✅ | Upload artist avatar |

---

## Statistics

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/stats` | ❌ | Get library statistics |
| `GET` | `/stats/recent` | ❌ | Recently added tracks |

---

## Library Statistics

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/stats/library/overview` | ❌ | Get listening statistics overview |
| `GET` | `/stats/library/recent?limit=N` | ❌ | Get recent plays (default: 50) |
| `GET` | `/stats/library/top-tracks?limit=N&days=D` | ❌ | Get top tracks (default: 20 tracks, 30 days) |
| `GET` | `/stats/library/top-artists?limit=N&days=D` | ❌ | Get top artists (default: 10 artists, 30 days) |
| `POST` | `/stats/library/play/:trackId` | ❌ | Record a play for a track |

---

## Network & Community

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/stats/network/sites` | ❌ | Get all registered TuneCamp sites |
| `GET` | `/stats/network/tracks` | ❌ | Get all tracks shared by the community |
| `POST` | `/stats/release/:slug/download` | ❌ | Increment release download count |
| `POST` | `/stats/track/:releaseSlug/:trackId/download` | ❌ | Increment track download count |

---

## Comments

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/comments/track/:trackId` | ❌ | Get comments for a track |
| `POST` | `/comments/track/:trackId` | ❌ | Add a comment (requires GunDB user auth) |
| `DELETE` | `/comments/:commentId` | ❌ | Delete a comment (requires ownership) |

---

## Users (GunDB-based)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/users/register` | ❌ | Register a new user (username + pubKey) |
| `GET` | `/users/check/:username` | ❌ | Check if username is available |
| `GET` | `/users/:pubKey` | ❌ | Get user by public key |
| `GET` | `/users/username/:username` | ❌ | Get user by username |

---

## Tracks (Extended)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/tracks/:id/lyrics` | ❌ | Get lyrics for a track |

---

## Browser (Admin Only)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/browser?path=/sub/path` | ✅ | Browse file system (admin only) |

---

## Metadata (Admin Only)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/metadata/search?q=query` | ✅ | Search music metadata (admin only) |

---

## Unlock Codes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/unlock/validate` | ❌ | Validate an unlock code |
| `POST` | `/unlock/redeem` | ❌ | Redeem an unlock code |
| `GET` | `/unlock/admin/list?releaseId=N` | ✅ | List unlock codes (admin only) |
| `POST` | `/unlock/admin/create` | ✅ | Create unlock codes (admin only) |

---

## Admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/admin/scan` | ✅ | Trigger library scan |
| `POST` | `/admin/rescan` | ✅ | Full library rescan |
| `GET` | `/admin/config` | ✅ | Get server config |
| `GET` | `/admin/stats` | ✅ | Get admin statistics |
| `PUT` | `/admin/releases/:id/visibility` | ✅ | Toggle release visibility (public/private) |

---

## User Management

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/admin/system/users` | ✅ | List all admin users |
| `POST` | `/admin/system/users` | ✅ | Create new admin user |
| `PUT` | `/admin/system/users/:id` | ✅ | Update admin (e.g. link to artist) |
| `DELETE` | `/admin/system/users/:id` | ✅ | Delete admin user |

---

## Response Formats

**Success**:
```json
{
  "id": 1,
  "title": "Track Name",
  ...
}
```

**Error**:
```json
{
  "error": "Error message"
}
```

**Auth Token** (from `/auth/login`):
```json
{
  "token": "eyJhbG...",
  "expiresIn": "7d"
}
```

---

## Subsonic API Compatibility

TuneCamp implements a subset of the [Subsonic API](http://www.subsonic.org/pages/api.jsp) (v1.16.1) at `/rest`. This allows connection from third-party clients like DSub, Symfonium, audinaut, etc.

**Base URL**: `http://localhost:1970/rest`

### Authentication

Two methods are supported:

1.  **Legacy Auth (Recommended for compatibility)**:
    -   Pass `u=<username>` and `p=enc:<hex-encoded-password>`.
    -   Password must be hex-encoded (e.g. `password` -> `70617373776f7264`).
    -   Most clients handle this automatically when "Legacy Auth" is enabled.

2.  **Token Auth**:
    -   Pass `u=<username>`, `t=<token>`, `s=<salt>`.
    -   *Note*: TuneCamp currently enforces Legacy Auth verification due to bcrypt hashing. Token auth requests may fail if the client doesn't fallback to sending the password.

### Supported Methods

| Method | Description | Notes |
|--------|-------------|-------|
| `ping` | Test connection | Returns 200 OK |
| `getLicense` | Get server license | Returns valid license |
| `getMusicFolders` | List configured music folders | Returns root folder |
| `getIndexes` | Artist index (A-Z) | Grouped by first letter |
| `getMusicDirectory` | Browse Artist/Album | Returns children of node |
| `getArtist` | Artist details | Includes albums |
| `getAlbum` | Album details | Includes tracks |
| `stream` | Stream audio | Direct file streaming |
| `getCoverArt` | Get image | Artist or Album cover |
| `scrobble` | Record play | Updates play count |
