# TuneCamp Plugin System

TuneCamp uses a modular, provider-based architecture inspired by projects like **Nuclear**. This allows developers to extend the platform's functionality without modifying the core codebase.

## Overview

There are 8 main types of providers you can implement:

1.  **MetadataProvider**: Adds new sources for track/album information (e.g., MusicBrainz, Discogs).
2.  **StreamingProvider**: Provides external audio sources (e.g., YouTube, Bandcamp, SoundCloud) used as fallbacks when a local file is missing.
3.  **DownloadProvider**: Adds new ways to acquire music (e.g., Soulseek, BitTorrent).
4.  **ScannerProvider**: Adds support for new library sources (e.g., IPFS, S3, remote servers).
5.  **StorageProvider**: Adds backends for user uploads (e.g., Google Drive, Dropbox).
6.  **PlaylistProvider**: Imports playlists from external services (e.g., Deezer, YouTube Music).
7.  **ScrobbleProvider**: Sends listening history to scrobbling services (e.g., Last.fm, ListenBrainz).
8.  **AIProvider**: Adds support for different LLMs for metadata enrichment (e.g., Ollama, OpenAI).

> **Note:** ActivityPub/Zen federation is handled internally by the platform's core modules and is not exposed as an external plugin type.

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
import { database } from '../dist/server/database.js'; // Use with caution
```

## Admin Panel

You can see all active providers and their versions in the **Admin Panel > Plugins** section of the TuneCamp web interface.
