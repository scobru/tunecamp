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

## Admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/admin/scan` | ✅ | Trigger library scan |
| `POST` | `/admin/rescan` | ✅ | Full library rescan |
| `GET` | `/admin/config` | ✅ | Get server config |

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
