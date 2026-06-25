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
- **Password**: Your account password

> [!NOTE]
> **Roaming Users**: To use Subsonic on a new instance, you must first log in to that instance via the web interface at least once. This triggers the **Lazy Account Creation** (roaming) which sets up your local profile and credentials required for Subsonic authentication.

## Supported Endpoints

### System

| Endpoint                         | Description                  |
| :------------------------------- | :--------------------------- |
| `ping.view`                      | Check server connectivity    |
| `getLicense.view`                | Returns valid license        |
| `getOpenSubsonicExtensions.view` | OpenSubsonic extensions list |

### Browsing

| Endpoint                                         | Description                                 |
| :----------------------------------------------- | :------------------------------------------ |
| `getMusicFolders.view`                           | List music folders                          |
| `getIndexes.view`                                | List artists alphabetically indexed         |
| `getMusicDirectory.view`                         | Browse directory (artist → albums → tracks) |
| `getArtists.view`                                | List all artists (ID3)                      |
| `getArtist.view`                                 | Get artist details with albums              |
| `getAlbum.view`                                  | Get album details with tracks               |
| `getSong.view`                                   | Get single track details                    |
| `getGenres.view`                                 | List all genres                             |
| `getArtistInfo.view` / `getArtistInfo2.view`     | Artist biography and images                 |
| `getAlbumInfo.view` / `getAlbumInfo2.view`       | Album notes and images                      |
| `getSimilarSongs.view` / `getSimilarSongs2.view` | Discover similar songs                      |
| `getTopSongs.view`                               | Top/popular songs                           |

### Album/Song Lists

| Endpoint                                   | Description                                                                            |
| :----------------------------------------- | :------------------------------------------------------------------------------------- |
| `getAlbumList.view` / `getAlbumList2.view` | Album lists (random, newest, alphabetical, frequent, recent, starred, byGenre, byYear) |
| `getRandomSongs.view`                      | Random track selection                                                                 |
| `getSongsByGenre.view`                     | Filter songs by genre                                                                  |
| `getStarred.view` / `getStarred2.view`     | Get starred (favorited) items                                                          |

### Media

| Endpoint           | Description          |
| :----------------- | :------------------- |
| `stream.view`      | Stream audio files   |
| `download.view`    | Download audio files |
| `getCoverArt.view` | Get cover art images |
| `getLyrics.view`   | Get track lyrics     |

### Search

| Endpoint                                        | Description                                     |
| :---------------------------------------------- | :---------------------------------------------- |
| `search.view` / `search2.view` / `search3.view` | Full-text search across artists, albums, tracks |

### Playlists

| Endpoint              | Description                 |
| :-------------------- | :-------------------------- |
| `getPlaylists.view`   | List all playlists          |
| `getPlaylist.view`    | Get playlist with tracks    |
| `createPlaylist.view` | Create or update a playlist |
| `updatePlaylist.view` | Add/remove songs, rename    |
| `deletePlaylist.view` | Delete a playlist           |

### Stars & Favorites

| Endpoint      | Description                            |
| :------------ | :------------------------------------- |
| `star.view`   | Star (favorite) artists, albums, songs |
| `unstar.view` | Remove star from items                 |

### User & Scrobbling

| Endpoint             | Description                          |
| :------------------- | :----------------------------------- |
| `getUser.view`       | Get user details and permissions     |
| `getUsers.view`      | List all users                       |
| `scrobble.view`      | Record track plays (local SQLite)    |
| `getNowPlaying.view` | Currently playing tracks             |

### Play Queue & Bookmarks

| Endpoint              | Description           |
| :-------------------- | :-------------------- |
| `getPlayQueue.view`   | Get saved play queue  |
| `savePlayQueue.view`  | Save play queue state |
| `getBookmarks.view`   | Get bookmarks         |
| `createBookmark.view` | Create a bookmark     |
| `deleteBookmark.view` | Delete a bookmark     |

### System & Misc

| Endpoint                        | Description               |
| :------------------------------ | :------------------------ |
| `getScanStatus.view`            | Media library scan status |
| `startScan.view`                | Trigger library scan      |
| `getAvatar.view`                | Get user avatar           |
| `getPodcasts.view`              | Podcast channels (stub)   |
| `getInternetRadioStations.view` | Radio stations (stub)     |
| `getShares.view`                | Shared items (stub)       |
| `jukeboxControl.view`           | Jukebox control (stub)    |
