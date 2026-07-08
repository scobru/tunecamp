# TuneCamp Plugin System

TuneCamp uses a modular, provider-based architecture inspired by projects like **Nuclear**. This allows developers to extend the platform's functionality without modifying the core codebase.

## Overview

There are 8 provider types you can implement. All are auto-detected at load time by duck-typing the methods your class exposes:

1.  **MetadataProvider** — new sources for track/album info (e.g. MusicBrainz, Discogs). Detected by: `searchRelease`.
2.  **StreamingProvider** — external audio fallbacks (e.g. YouTube, Bandcamp). Detected by: `getStreamUrl`.
3.  **DownloadProvider** — new ways to acquire music (e.g. Soulseek, BitTorrent). Detected by: `search` + `download` + `isAvailable`.
4.  **ScannerProvider** — new library sources (e.g. IPFS, S3). Detected by: `scan`.
5.  **StorageProvider** — upload backends (e.g. Google Drive, Dropbox). Detected by: `upload` + `getUrl`.
6.  **PlaylistProvider** — external playlist import (e.g. Deezer, YouTube Music). Detected by: `canHandlePlaylist` + `fetchPlaylistByUrl`.
7.  **ScrobbleProvider** — listening history export (e.g. Last.fm, ListenBrainz). Detected by: `scrobble` + `isConfigured`.
8.  **AIProvider** — LLM backends for metadata enrichment (e.g. Ollama, OpenAI). Detected by: `enrichMetadata` + `complete`.

> **Note:** ActivityPub federation and P2P Peer Sharing are handled internally by the platform's core modules and are not exposed as external plugin types.

---

## Creating a Plugin

To create a plugin, simply create a `.js` (ESM) file in the `plugins/` directory of your TuneCamp installation.

### Example: Custom Metadata Provider

```javascript
// plugins/my-custom-metadata.js

export default class MyCustomMetadataProvider {
    constructor() {
        this.id = 'my-custom-source';
        this.name = 'My Custom Source';
        this.version = '1.0.0';
        this.description = 'Fetches metadata from my private API';
    }

    async isAvailable() {
        return true; 
    }

    // `searchRelease` is the method the loader duck-types on to register a
    // MetadataProvider — it MUST exist or the plugin is ignored.
    async searchRelease(query) {
        // Return an array of MetadataResult objects (album/release level)
        return [
            { id: 'rel-1', title: 'Album Title', artist: 'Artist Name', date: '2024-01-01', source: this.id }
        ];
    }

    async searchRecording(query) {
        // Return an array of MetadataResult objects (track level)
        return [
            { id: 'abc-123', title: 'Song Title', artist: 'Artist Name', date: '2024-01-01', source: this.id }
        ];
    }

    async getCoverUrl(id) {
        return 'https://example.com/cover.jpg';
    }
}
```

### Example: YouTube Streaming Provider (using external library)

If your plugin needs external dependencies, you can install them in the TuneCamp root or bundle your plugin.

```javascript
import play from 'play-dl';

export default class MyYouTubeProvider {
    constructor() {
        this.id = 'custom-youtube';
        this.name = 'Custom YouTube';
        this.version = '1.0.0';
    }

    async getStreamUrl(title, artist) {
        const results = await play.search(`${artist} - ${title}`, { limit: 1 });
        if (results.length > 0) {
            const info = await play.video_info(results[0].url);
            return info.format.find(f => f.mimeType.includes('audio')).url;
        }
        return null;
    }
}
```

---

## Provider Contracts

The loader duck-types on the methods listed under **Detected by** above — a
class is registered against *every* registry whose required methods it
implements (so one plugin can be, say, both a `DownloadProvider` and a
`StorageProvider`). Below are the full method contracts for each type. Plugins
are plain JS; the signatures are shown in TypeScript for clarity, taken from
[`src/server/core/provider.ts`](../src/server/core/provider.ts).

Every provider also carries the base fields: `id`, `name`, `version`,
`description?`, and optional `onEnable()` / `onDisable()` (see Lifecycle Hooks
below). Providers may also declare `configSchema` (see Declarative
Configuration below) and receive settings via `init()` at load time.

### 3. DownloadProvider

**Detected by:** `isAvailable` + `search` + `download`.

```typescript
interface DownloadResult {
    id: string;
    title: string;
    artist?: string;
    filename: string;
    sizeBytes: number;
    bitrate?: number;
    source: string;
    meta?: any;        // provider-specific data, passed back to download()
}

isAvailable(): Promise<boolean>;            // is the source connected/reachable?
search(query: string): Promise<DownloadResult[]>;   // e.g. "Artist - Title"
download(result: DownloadResult): Promise<string>;  // returns the LOCAL file path
```

```javascript
// plugins/my-download.js
export default class MyDownloadProvider {
    id = 'my-dl'; name = 'My Downloader'; version = '1.0.0';
    async isAvailable() { return true; }
    async search(query) {
        return [{ id: 'x1', title: query, filename: 'x1.flac', sizeBytes: 0, source: this.id, meta: {} }];
    }
    async download(result) {
        const dest = `/tmp/${result.filename}`;
        // ...fetch bytes to `dest`...
        return dest;
    }
}
```

### 4. ScannerProvider

**Detected by:** `scan`.

```typescript
scan(): Promise<string[]>;                       // list of paths/identifiers in the source
getMetadata(path: string): Promise<any>;         // tags for one entry
getFileStream(path: string): Promise<NodeJS.ReadableStream>;  // readable for ingest
```

```javascript
// plugins/s3-scanner.js
export default class S3Scanner {
    id = 's3'; name = 'S3 Scanner'; version = '1.0.0';
    async scan() { return ['bucket/track1.flac', 'bucket/track2.flac']; }
    async getMetadata(p) { return { title: p.split('/').pop() }; }
    async getFileStream(p) { /* return a Readable */ }
}
```

### 5. StorageProvider

**Detected by:** `upload` + `getUrl`.

```typescript
upload(localPath: string, remotePath: string): Promise<string>;   // returns remote ref/key
download(remotePath: string, localPath: string): Promise<void>;
getUrl(remotePath: string): Promise<string | null>;               // public/signed URL
exists(remotePath: string): Promise<boolean>;
delete(remotePath: string): Promise<void>;
```

```javascript
// plugins/dropbox-storage.js
export default class DropboxStorage {
    id = 'dropbox'; name = 'Dropbox'; version = '1.0.0';
    async upload(localPath, remotePath) { /* upload */ return remotePath; }
    async download(remotePath, localPath) { /* download */ }
    async getUrl(remotePath) { return `https://dropbox.example/${remotePath}`; }
    async exists(remotePath) { return true; }
    async delete(remotePath) { /* delete */ }
}
```

### 6. PlaylistProvider

**Detected by:** `canHandlePlaylist` + `fetchPlaylistByUrl`.

```typescript
interface PlaylistTrack { title: string; artist: string; album?: string; duration?: number; sourceId: string; provider: string; }
interface ExternalPlaylist { id: string; title: string; description?: string; thumbnail?: string; tracks: PlaylistTrack[]; }

canHandlePlaylist(url: string): boolean;                  // can this provider parse the URL?
fetchPlaylistByUrl(url: string): Promise<ExternalPlaylist>;
```

```javascript
// plugins/deezer-playlist.js
export default class DeezerPlaylist {
    id = 'deezer-pl'; name = 'Deezer Playlists'; version = '1.0.0';
    canHandlePlaylist(url) { return url.includes('deezer.com/playlist'); }
    async fetchPlaylistByUrl(url) {
        return { id: 'pl1', title: 'My Playlist', tracks: [
            { title: 'Song', artist: 'Artist', sourceId: 's1', provider: this.id }
        ]};
    }
}
```

### 7. ScrobbleProvider

**Detected by:** `scrobble` + `isConfigured`.

```typescript
scrobble(track: { artist: string; title: string; album?: string; duration?: number }): Promise<void>;
nowPlaying?(track: { artist: string; title: string; album?: string }): Promise<void>;
isConfigured(): Promise<boolean>;        // credentials present and ready?
```

```javascript
// plugins/maloja-scrobble.js
export default class MalojaScrobble {
    id = 'maloja'; name = 'Maloja'; version = '1.0.0';
    async isConfigured() { return !!process.env.MALOJA_KEY; }
    async scrobble(track) { /* POST to Maloja */ }
    async nowPlaying(track) { /* optional */ }
}
```

### 8. AIProvider

**Detected by:** `enrichMetadata` + `complete`.

```typescript
enrichMetadata(context: { title: string; artist?: string; album?: string; genre?: string }):
    Promise<Partial<{ description: string; genre: string; tags: string[]; mood: string }>>;
complete(prompt: string): Promise<string | null>;
isAvailable(): Promise<boolean>;
```

```javascript
// plugins/ollama-ai.js
export default class OllamaAI {
    id = 'ollama'; name = 'Ollama (local)'; version = '1.0.0';
    async isAvailable() { return true; }
    async complete(prompt) { /* call local Ollama */ return 'response'; }
    async enrichMetadata(ctx) {
        return { description: `A track by ${ctx.artist}`, tags: ['demo'] };
    }
}
```

---

## How it Works

1.  **Detection**: At startup, TuneCamp scans the `plugins/` folder.
2.  **Registration**: It dynamically imports each file and checks which methods are implemented.
3.  **Injection**: The plugin is automatically registered into the appropriate singleton service (e.g., `MetadataService`).
4.  **Execution**: When a user performs an action (like searching or streaming), TuneCamp iterates through all registered providers in parallel or in order of registration.

## Declarative Configuration (`configSchema` + `init()`)

Plugins can declare a `configSchema` array to get a settings form rendered
automatically in the admin panel — no React code needed:

```javascript
export default class MyProvider {
    id = 'my-dl'; name = 'My DL'; version = '1.0.0';

    // Declarative — the admin UI renders text/password/boolean fields
    configSchema = [
        { key: 'apiKey',   label: 'API Key',      type: 'password', placeholder: 'sk-…' },
        { key: 'endpoint', label: 'Base URL',      type: 'text',     placeholder: 'https://…' },
        { key: 'verbose',  label: 'Verbose logs',  type: 'boolean' },
    ];

    // Called once at load time with scoped helpers
    init({ getSetting, setSetting }) {
        this.apiKey = getSetting('apiKey');
        // setSetting('lastSeen', Date.now().toString());
    }

    async isAvailable() { return !!this.apiKey; }
    async search(query) { /* … */ }
    async download(result) { /* … */ }
}
```

Settings are stored in the TuneCamp database, scoped with the prefix
`plugin_<id>_` (e.g. `plugin_my-dl_apiKey`). The `getSetting`/`setSetting`
helpers passed to `init()` handle the prefix automatically.

> **Replaces the old pattern**: You no longer need to
> `import { database } from '../dist/server/core/database.js'` — the
> scoped context is safer and survives refactors.

## Generic Search Routes (DownloadProvider UI for free)

Any registered `DownloadProvider` (built-in or community) automatically gets
HTTP endpoints and a search tab in the Content Search page:

- `GET  /api/search/content/provider/:id?q=…` — calls `provider.search(q)`
- `POST /api/search/content/provider/:id/download` — calls `provider.download(result)` in background + auto-indexes into the library

Both require admin/manager role and the provider to be enabled. The webapp
renders a generic results table (title, artist, filename, size, bitrate) with
a download button — the plugin author writes zero frontend code.

## Lifecycle Hooks

A provider may optionally implement `onEnable()` and `onDisable()`:

```javascript
async onEnable()  { /* open connections, warm caches, etc. */ }
async onDisable() { /* clean up */ }
```

These run when the plugin is enabled/disabled — at load time (honoring the
last persisted state) and whenever an admin flips the toggle in the Admin Panel.
A plugin disabled by an admin stays disabled across restarts.

## Admin Panel

In the **Admin Panel → Integrations** section (root admin only), you can:

- See all loaded providers, their versions and enabled status
- Toggle providers on/off
- See **real availability status** for external plugins (green dot = `isAvailable()` returned true, red = false/timeout, grey = disabled)
- **Configure plugin settings** via a declarative form (when the plugin declares `configSchema`)
- External download plugins also appear as **search tabs** in Content Search

---

## Docker / Production deployment

### How plugins are included in the image

The `plugins/` directory is copied into the production Docker image at `/app/plugins`. The env variable `TUNECAMP_PLUGINS_DIR=/app/plugins` is set automatically.

Built-in plugins (e.g. `demo-provider.js`) are always present. Custom plugins survive image rebuilds via a named Docker volume.

### Adding a custom plugin with docker-compose

The default `docker-compose.yml` mounts a named volume at `/app/plugins`:

```yaml
volumes:
  - tunecamp_plugins:/app/plugins
```

On first run, Docker copies the image's `plugins/` content into the volume. After that, add your plugin:

```bash
# Copy your plugin file into the running container
docker cp my-plugin.js tunecamp:/app/plugins/

# Restart to load it
docker compose restart tunecamp
```

### Using a local folder instead

To manage plugins as files on the host (easier for development):

```yaml
# docker-compose.yml
volumes:
  - /path/to/your/music:/music
  - tunecamp_data:/data
  - ./plugins:/app/plugins   # ← bind mount to host folder
```

Place your `.js` files in `./plugins/` and restart the container.

### Verifying plugins are loaded

```bash
docker compose logs tunecamp | grep -i plugin
```

You should see lines like:
```
[PluginLoader] Loaded plugin: My Custom Source v1.0.0
```

---

## Known Gaps & Design Notes

1. **`isAvailable` not on all provider types**: Only `DownloadProvider`,
   `StreamingProvider`, and `AIProvider` define `isAvailable()` in the
   contract. `MetadataProvider` and others lack it. The admin panel probes
   whatever method exists (`isAvailable` → `isConfigured` → assume true).

2. **External plugins default-enabled on first load**: When a new plugin file
   is dropped in `plugins/`, it is enabled by default the first time TuneCamp
   loads it (no persisted state yet). An admin must explicitly disable it if
   needed. This matches the built-in behavior but may surprise operators.

3. **No runtime frontend loading**: The webapp does not `import()` arbitrary
   plugin JS at runtime. External plugins get UI via the generic search tab
   and declarative config form. If a plugin genuinely needs bespoke UI (like
   Soulseek's Transfers tab), an iframe-sandboxed approach with `postMessage`
   is recommended over direct `import()` (XSS vector).

4. **`init()` is fire-once**: The `init({ getSetting, setSetting })` hook
   runs once at load time. If an admin changes plugin settings at runtime,
   the plugin won't pick up the new values until the next restart (or until
   the plugin's own code re-reads them via `getSetting`).
