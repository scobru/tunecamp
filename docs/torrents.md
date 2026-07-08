# Torrent System

TuneCamp integrates **WebTorrent** to allow administrators to download music via magnet links and automatically import it into the library.

## 1. Architecture

The system is a self-contained plugin at `src/server/plugins/torrent/`, managed by `TorrentService` (`service.ts`, with a `DownloadProvider` wrapper in `provider.ts`), which wraps a WebTorrent client instance.

> **No in-app search.** Searching public trackers from the server was removed:
> it relied on reaching ThePirateBay/`apibay.org`, which is blocked at the ISP
> level in many regions (e.g. Italy/AGCOM), so it silently returned zero
> results. The Content Search → WebTorrent tab now links out to external torrent
> search engines; the user copies a magnet and pastes it into the "Add magnet"
> box, which downloads via WebTorrent independently of any blocked host.

> **Opt-in:** Like Soulseek, the torrent plugin is disabled by default for legal
> reasons and must be enabled explicitly from the Admin panel.

### Key Components
- **WebTorrent Client**: Handles the peer-to-peer download protocol.
- **SQLite Persistence**: Torrent metadata (infoHash, magnet URI, status) is stored in the database to allow resuming downloads after a server restart.
- **Auto-Scanner Integration**: Once a torrent finishes downloading, the service automatically triggers the `Scanner` to process any detected audio files and add them to the TuneCamp catalog.

## 2. Directory Structure

Torrents are downloaded into a dedicated subdirectory to prevent the main library scanner from picking up incomplete files:
- **Downloads**: `music/downloads/torrents/`
- **Seeds**: `music/.torrent-seeds/` — the store WebTorrent uses when *seeding* library files. It is dot-prefixed so the catalog scanner and file watcher skip it (they ignore hidden directories), and it lives under `musicDir` so it shares the persistent volume. Passing this explicit `path` is what stops WebTorrent from falling back to its `os.tmpdir()/webtorrent` default — the source of the historical runaway `/tmp/webtorrent` growth (see the 2.17.3 changelog entry). `TorrentService` reaps any leftover legacy `/tmp/webtorrent` store on startup.

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

## 5. Finding torrents

In-app search has been removed (see the note in §1). The WebTorrent tab in
Content Search instead lists external search engines (BTDigg, 1337x, Knaben,
Solid Torrents, and a ThePirateBay proxy list) that open in a new tab,
pre-filled with the typed query. Find a release there, copy its magnet link,
and paste it into the "Add magnet" box to start the download.

