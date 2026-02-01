# TuneCamp Server Mode

Personal music streaming server with web interface and REST API.

## Quick Start

```bash
# Start server with your music library
tunecamp server ./music --port 1970

# Open http://localhost:1970
```

## First Run

1. **Start the server** with your music directory
2. **Open the web interface** at `http://localhost:1970`
3. **Set admin password** (required on first run)
4. The server will **scan your library** automatically

## CLI Options

```bash
tunecamp server [music-dir] [options]

Arguments:
  music-dir         Music library directory (default: ./music)

Options:
  -p, --port <n>    Port number (default: 1970)
  -d, --db <path>   Database file path (default: ./tunecamp.db)
```

## Library Modes

### Release Mode
Curated structure with YAML metadata files:

```
music/
├── artist.yaml
└── releases/
    └── album-name/
        ├── release.yaml
        ├── cover.jpg
        └── tracks/
            └── *.mp3
```

### Library Mode
Loose folder structure for large collections:

```
music/
├── Artist Name/
│   └── Album Name/
│       └── *.mp3
└── loose-tracks/
    └── *.flac
```

Both modes can be mixed. Files with `release.yaml` are treated as releases.

## Web Interface Features

- **Library browser**: Browse albums, artists, tracks
- **Advanced Audio Player**: 
    - Full playback controls (play, pause, next, previous)
    - Progress bar with scrubbing (click or drag to seek)
    - Queue management (add tracks, view queue, remove tracks)
    - Lyrics display (if available for tracks)
    - Volume control with persistence
    - Time display (current time / total duration)
- **Playlists**: Create and manage custom playlists via web interface
- **Network Discovery**: Browse and play tracks from other TuneCamp instances
- **User Management**: Create multiple admins and link them to artists for restricted access
- **Library Statistics**: View listening stats, play history, top tracks/artists
- **Comments**: View and post comments on tracks (requires user authentication)
- **Admin panel**: Manage releases, upload files, browse file system
- **File Browser**: Navigate library directory structure (admin only)
- **Dark mode**: Toggle between light/dark themes

## Authentication

- **First run**: Set admin password via web interface
- **JWT tokens**: 7-day expiration
- **Protected actions**: Upload, delete, edit require admin login

## Database

SQLite database (`tunecamp.db`) stores:
- Track metadata (title, artist, duration, waveform data, etc.)
- Album/release information
- Playlists and playlist tracks
- Play history and listening statistics
- File paths (for streaming)
- Settings and configuration

Database is automatically created on first run.

## File Watching

The server watches for file changes using `chokidar`:
- **New files**: Automatically scanned and added
- **Deleted files**: Removed from database
- **Modified files**: Metadata re-read

## API

Full REST API available at `/api/*`. See [API.md](./API.md) for documentation.

### Subsonic API

TuneCamp supports the Subsonic API at `/rest`. Connect your favorite player (DSub, Symfonium, etc.):

-   **Server**: `http://your-server-ip:1970`
-   **Username**: `admin`
-   **Password**: Your admin password
-   **Legacy Auth**: Enabled (required for most clients)

### Key API Endpoints

- **Tracks**: `/api/tracks` - List, stream, update tracks
- **Albums**: `/api/albums` - Manage albums and releases
- **Artists**: `/api/artists` - Artist management
- **Playlists**: `/api/playlists` - Create and manage playlists
- **Library Stats**: `/api/stats/library` - Listening statistics
- **Network**: `/api/stats/network/sites` and `/api/stats/network/tracks` - Community discovery
- **Comments**: `/api/comments` - Track comments (GunDB-based)
- **Users**: `/api/users` - User registration and profiles (GunDB-based)
- **Browser**: `/api/browser` - File system browser (admin only)
- **Metadata**: `/api/metadata` - Metadata search and management (admin only)
- **Unlock Codes**: `/api/unlock` - Unlock code validation and redemption

## Ports

| Port | Description |
|------|-------------|
| 1970 | Default TuneCamp Server port |
| 3000 | Default `tunecamp serve` (static) port |
