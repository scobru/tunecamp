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
- **Built-in player**: Stream music directly in browser
- **Playlists**: Create and manage custom playlists
- **Admin panel**: Manage releases, upload files
- **Dark mode**: Toggle between light/dark themes

## Authentication

- **First run**: Set admin password via web interface
- **JWT tokens**: 7-day expiration
- **Protected actions**: Upload, delete, edit require admin login

## Database

SQLite database (`tunecamp.db`) stores:
- Track metadata (title, artist, duration, etc.)
- Album/release information
- Playlists and playlist tracks
- File paths (for streaming)

Database is automatically created on first run.

## File Watching

The server watches for file changes using `chokidar`:
- **New files**: Automatically scanned and added
- **Deleted files**: Removed from database
- **Modified files**: Metadata re-read

## API

Full REST API available at `/api/*`. See [API.md](./API.md) for documentation.

## Ports

| Port | Description |
|------|-------------|
| 1970 | Default TuneCamp Server port |
| 3000 | Default `tunecamp serve` (static) port |
