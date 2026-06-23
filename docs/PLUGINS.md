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

> **Note:** ActivityPub federation is handled internally by the platform's core modules and is not exposed as an external plugin type.

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

    async searchRecording(query) {
        // Fetch from your API
        // Return an array of MetadataMatch objects
        return [
            {
                id: 'abc-123',
                title: 'Song Title',
                artist: 'Artist Name',
                source: this.id
            }
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

## How it Works

1.  **Detection**: At startup, TuneCamp scans the `plugins/` folder.
2.  **Registration**: It dynamically imports each file and checks which methods are implemented.
3.  **Injection**: The plugin is automatically registered into the appropriate singleton service (e.g., `MetadataService`).
4.  **Execution**: When a user performs an action (like searching or streaming), TuneCamp iterates through all registered providers in parallel or in order of registration.

## Advanced: Accessing Internal Services

While plugins are designed to be decoupled, you can occasionally access internal services via the singleton exports if needed (though not recommended for maximum portability).

```javascript
import { database } from '../dist/server/core/database.js'; // Use with caution
```

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

You can see all loaded providers, their versions and enabled status — and toggle
them on/off — in the **Admin Panel → Integrations** section of the TuneCamp web
interface (root admin only).

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
