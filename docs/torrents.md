# Torrent System

TuneCamp integrates **WebTorrent** to allow administrators to download music via magnet links and automatically import it into the library.

## 1. Architecture

The system is managed by the `TorrentService` (`src/server/modules/integrations/torrent.service.ts`), which wraps a WebTorrent client instance. Search uses `torrent-search.service.ts` in the same directory.

> **Opt-in:** Like Soulseek, the torrent plugin is disabled by default for legal
> reasons and must be enabled explicitly from the Admin panel.

### Key Components
- **WebTorrent Client**: Handles the peer-to-peer download protocol.
- **SQLite Persistence**: Torrent metadata (infoHash, magnet URI, status) is stored in the database to allow resuming downloads after a server restart.
- **Auto-Scanner Integration**: Once a torrent finishes downloading, the service automatically triggers the `Scanner` to process any detected audio files and add them to the TuneCamp catalog.

## 2. Directory Structure

Torrents are downloaded into a dedicated subdirectory to prevent the main library scanner from picking up incomplete files:
- **Path**: `music/downloads/torrents/`

## 3. API Routes

Admin-only routes are available under `/api/admin/torrents`:

- **`GET /`**: Returns a list of all torrents (active and stored in DB) with their current progress, speeds, and file list.
- **`POST /add`**: Adds a new magnet link to the download queue.
- **`DELETE /:infoHash`**: Removes a torrent. Optional query param `?deleteFiles=true` will also remove the downloaded data from disk.

## 4. Automation Flow

1. **Addition**: Admin submits a magnet URI.
2. **Metadata**: The client fetches torrent metadata (name, file list).
3. **Download**: Files are downloaded to the torrent directory.
4. **Completion**: When 100% reached, the `done` event is fired.
5. **Import**: The service iterates through files. Any file with a valid audio extension (`.mp3`, `.flac`, etc.) is passed to `scanner.processAudioFile`.
6. **Library Update**: The scanner moves/copies the file to the library and updates the database.

## 5. Configuration & Mirrors

TuneCamp uses the official Pirate Bay JSON API (`apibay.org`) as its primary search backend. Since Cloudflare protections on `apibay.org` may occasionally return `HTTP 403` to datacenter and VPS IPs:

- **Default API URL**: `https://apibay.org`
- **Custom Mirror/Proxy**: You can override the API URL by setting the `TORRENT_APIBAY_URL` environment variable (e.g., `TORRENT_APIBAY_URL=https://apibay.someproxy.com` or a local proxy) to bypass IP blocks.

