# Subsonic API Reference

Tunecamp exposes a full **Subsonic API** at `/rest`, compatible with Subsonic API version **1.16.1**. This makes it compatible with all major Subsonic clients.

## Tested Clients

| Client      | Platform | Status |
| :---------- | :------- | :----- |
| DSub        | Android  | ✅     |
| Symfonium   | Android  | ✅     |
| Tempo       | iOS      | ✅     |
| Substreamer | Multi    | ✅     |
| Amuse       | Android  | ✅     |
| play:Sub    | iOS      | ✅     |

## Connection Settings

- **Server URL**: `https://your-server.com/rest`
- **Username**: Your Tunecamp username (administrator or artist)
- **Password**: Your **Subsonic password** — not your account password

Generate the Subsonic password under **Profile → Settings → Subsonic Password**. It is shown once, at creation; if you lose it, generate a new one. Removing it signs out every Subsonic app using it, and leaves the rest of your account untouched.

> [!NOTE]
> The Subsonic protocol authenticates as `md5(password + salt)`, so the server must be able to read the secret back — it cannot store a one-way hash. That is why Subsonic gets its own random password instead of your account password: a database leak exposes only revocable, streaming-scoped credentials.

> [!NOTE]
> **Roaming Users**: To use Subsonic on a new instance, log in to that instance via the web interface first. This triggers the **Lazy Account Creation** (roaming) which sets up your local profile; then generate a Subsonic password there.

## Supported Endpoints

TuneCamp implements the core Subsonic specification (v1.16.1) required by mobile clients:

### System & Connectivity

| Endpoint | Description | Status |
| :--- | :--- | :--- |
| `ping.view` | Check server connectivity and authenticate | ✅ Supported |
| `getLicense.view` | Returns valid server license | ✅ Supported |
| `getScanStatus.view` | Media library scan status | ✅ Supported |

### Browsing & Catalog

| Endpoint | Description | Status |
| :--- | :--- | :--- |
| `getMusicFolders.view` | List root music folders | ✅ Supported |
| `getIndexes.view` | List artists alphabetically indexed | ✅ Supported |
| `getArtists.view` | List all artists (ID3 indexed) | ✅ Supported |
| `getMusicDirectory.view` | Browse directory structure (artist → albums → tracks) | ✅ Supported |
| `getArtist.view` | Get artist details and discography | ✅ Supported |
| `getAlbum.view` | Get album details with tracklist | ✅ Supported |
| `getArtistInfo.view` / `getArtistInfo2.view` | Artist biography and images | ✅ Supported |
| `getAlbumInfo.view` / `getAlbumInfo2.view` | Album description and cover art | ✅ Supported |
| `getGenres.view` | List all musical genres | ✅ Supported |

### Album / Song Lists & Search

| Endpoint | Description | Status |
| :--- | :--- | :--- |
| `getAlbumList.view` / `getAlbumList2.view` | Album lists (`newest`, `random`, `frequent`, `recent`, `starred`, `alphabeticalByName`, `byGenre`, `byYear`) | ✅ Supported |
| `getRandomSongs.view` | Random track selection from library | ✅ Supported |
| `getStarred.view` / `getStarred2.view` | Get favorited/starred items | ✅ Supported |
| `search.view` / `search2.view` / `search3.view` | Full-text search across artists, albums, and tracks | ✅ Supported |

### Media Streaming & Playback

| Endpoint | Description | Status |
| :--- | :--- | :--- |
| `stream.view` | Stream audio files (supports transcode bitrates & format conversion) | ✅ Supported |
| `getCoverArt.view` | Serve artwork images for artists, albums, and tracks | ✅ Supported |
| `scrobble.view` | Record track plays in database and external scrobblers | ✅ Supported |
| `getNowPlaying.view` | List currently playing tracks across active sessions | ✅ Supported |

### Playlists & Podcasts

| Endpoint | Description | Status |
| :--- | :--- | :--- |
| `getPlaylists.view` | List all accessible playlists | ✅ Supported |
| `getPlaylist.view` | Get playlist details with song list | ✅ Supported |
| `createPlaylist.view` | Create a new user playlist | ✅ Supported |
| `updatePlaylist.view` | Add/remove songs, update visibility | ✅ Supported |
| `deletePlaylist.view` | Delete a playlist | ✅ Supported |
| `getPodcasts.view` | List podcast channels / episodes | ✅ Supported |
| `getNewestPodcasts.view` | List newest podcast episodes | ✅ Supported |

### User Profile

| Endpoint | Description | Status |
| :--- | :--- | :--- |
| `getUser.view` | Get user details and streaming permissions | ✅ Supported |

---

## Planned / Non-Implemented Endpoints

The following Subsonic endpoints are not currently needed for core playback in DSub/Symfonium/Tempo and return an unsupported endpoint code if queried:

- `download.view` (handled via `stream.view` or TuneCamp native REST API)
- `getSong.view`, `getTopSongs.view`, `getSimilarSongs.view`
- `getLyrics.view`, `getAvatar.view`
- `star.view`, `unstar.view` (favorites managed via Web UI)
- `getPlayQueue.view`, `savePlayQueue.view`, `getBookmarks.view`
- `getInternetRadioStations.view`, `getShares.view`, `jukeboxControl.view`
