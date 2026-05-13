<div align="center">
  <img src="./logo.svg" alt="Tunecamp Logo" width="150" height="150">
  <h1>Tunecamp</h1>
  <p><strong>A self-hosted, federated music platform for independent artists and labels.</strong></p>
</div>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Exists

Streaming platforms take significant cuts from artists and lock their communities into walled gardens. Tunecamp allows you to host your own music with a beautiful web interface, fully compatible with existing Subsonic mobile apps. It connects you to the Fediverse (via ActivityPub) and uses a hybrid federation model—Zen for instance discovery and identity, direct HTTP for content sharing—giving artists ownership of their distribution without sacrificing reach.

## Quick Start

The fastest way to run Tunecamp is using Docker Compose.

```bash
# 1. Clone the repository
git clone https://github.com/scobru/shogun-tunecamp.git
cd shogun-tunecamp

# 2. Edit docker-compose.yml to set your music directory
#    Change /path/to/your/music to your actual music folder

# 3. Start the server in the background
docker-compose up -d --build

# 4. Access the dashboard
# Open http://localhost:1970 in your browser
```

> **First Run**: Tunecamp will create a default admin account (`admin`/`admin`). You will be prompted to change the password on first login.

## Features

### Core
- 🎵 **Audio-first**: Automatically reads metadata, generates waveforms, and processes cover art from your audio files (MP3, FLAC, WAV, etc.).
- 🖥️ **Streaming Server**: Personal streaming server with a modern, responsive web interface.
- 🎨 **Customizable**: Theming, background images, cover images, site branding, and per-artist profiles.
- 🔍 **Full-text Search**: Search across artists, albums, and tracks with fuzzy matching.
- 🔊 **Smart Streaming**: Multi-provider fallback (YouTube, Bandcamp, SoundCloud, HiFi) with advanced bot-detection bypass for YouTube.
- 📡 **HiFi Support**: Integration with community-hosted HiFi API instances for high-quality audio.

### Decentralization & Federation
- 🔐 **Zen Identity**: Cryptographic keypairs (SEA) for signing, identity roaming across instances, and decentralized comments/stats.
- 📡 **ActivityPub**: Connect with the Fediverse (Mastodon, Funkwhale, Pleroma). Artists are ActivityPub actors with followers, posts, and release broadcasts.
- 🌐 **Community Network**: Discover other Tunecamp instances via Zen signaling, then fetch catalogs directly via HTTP REST for always-fresh content.
- 🔗 **HTTP Federation**: Instances expose a public `/api/catalog` endpoint, enabling direct instance-to-instance content discovery without intermediary replication.

### Streaming & Clients
- 🔊 **Subsonic/OpenSubsonic API**: Full compatibility (v1.16.1) with mobile apps like DSub, Symfonium, Tempo, Substreamer, Amuse, and play:Sub.
- 🎧 **Built-in Player**: Waveform visualization, queue management, lyrics display, and keyboard shortcuts.
- 📋 **Playlists**: Create and share playlists (public/private).

### Web3 & Monetization
- 💰 **On-chain Payments**: NFT-based purchases (ERC-1155) with USDC and ETH on the Base Network.
- 🏭 **Factory Contract**: Self-hosters deploy their own NFT + Checkout contract instances via EIP-1167 minimal proxies.
- 🔑 **Unlock Codes**: Generate and distribute access codes for gated releases.
- 👛 **Wallet Integration**: Client-side wallet derived from Zen credentials (no private key leaves the browser).

### Administration
- 🛡️ **Role-Based Access (RBAC)**: Root Admin, Admin, and Artist/User roles with granular permissions. See [ROLES.md](ROLES.md).
- 📤 **Bulk Upload**: Multi-file upload with automatic metadata extraction and album assignment.
- ✏️ **Batch Editing**: Edit cover art, metadata, and pricing across multiple tracks at once.
- 📁 **File Browser**: Browse the server filesystem and attach files to the library.
- 🤖 **Telegram Bot**: Rapid ingestion of music files and remote management. See [TELEGRAM.md](docs/TELEGRAM.md).
- 💾 **Backup & Restore**: Full database backup/restore via the admin panel or CLI.
- 📊 **Statistics**: Play counts, listening time, top tracks/artists, and library stats.

### Content Acquisition
- 🔎 **Content Search**: Search Soulseek from the admin panel with one-click import.
- 🏷️ **Discogs Metadata**: Match tracks against the Discogs database for accurate tagging.

### Deployment
- 📦 **Docker Ready**: Multi-stage Dockerfile with health checks, optimized for production.
- 🚀 **CapRover Support**: One-click deploy with automatic cache busting.
- 📱 **PWA Support**: Installable as a Progressive Web App with offline service worker.

## Installation & Setup

### Using Docker Compose (Production)

**Prerequisites**: Docker 20+, Docker Compose

```bash
git clone https://github.com/scobru/shogun-tunecamp.git
cd shogun-tunecamp

# Edit docker-compose.yml to configure your music path and environment
docker-compose up -d --build
```

### Using Node.js (Development)

**Prerequisites**: Node.js 18+, npm 9+, FFmpeg installed

```bash
# Clone the repository
git clone https://github.com/scobru/shogun-tunecamp.git
cd shogun-tunecamp

# Install dependencies and build backend
npm install
npm run build

# Install frontend dependencies and build
cd webapp
npm install
cd ..

# Start the server (runs migrations automatically)
npm start
```

For development with hot-reload:
```bash
# Terminal 1: Watch backend TypeScript
npm run dev

# Terminal 2: Watch frontend (Vite dev server with HMR)
cd webapp && npm run dev
```

### CLI Usage

After building, the CLI is available:

```bash
# Start the server
npx tunecamp server ./music --port 1970 --db ./tunecamp.db

# Backup the database
npx tunecamp backup ./backups --db ./tunecamp.db

# Restore from a backup
npx tunecamp restore ./backups/tunecamp-2026-01-01.db --db ./tunecamp.db --force
```

### Configuration

Configuration is managed via environment variables (or an `.env` file).

| Variable | Description | Default |
|:---------|:------------|:--------|
| `TUNECAMP_PORT` | Server listen port | `1970` |
| `TUNECAMP_MUSIC_DIR` | Path to the music library | `./music` |
| `TUNECAMP_DB_PATH` | Path to the SQLite database | `./tunecamp.db` |
| `TUNECAMP_JWT_SECRET` | JWT signing secret (auto-generated if not set) | *auto* |
| `TUNECAMP_ADMIN_USER` | Default admin username | `admin` |
| `TUNECAMP_ADMIN_PASS` | Default admin password | `admin` |
| `TUNECAMP_PUBLIC_URL` | Public HTTPS URL (required for ActivityPub federation) | — |
| `TUNECAMP_TELEGRAM_BOT_TOKEN` | Telegram Bot API token for ingestion | — |
| `TUNECAMP_TELEGRAM_MASTER_ID` | Telegram User ID of the master administrator | — |
| `TUNECAMP_SITE_NAME` | Human-readable instance name | `My TuneCamp Server` |
| `TUNECAMP_ZEN_PEERS` | Comma-separated Zen relay peer URLs | — |
| `VITE_ZEN_PEERS` | Same as above, for the frontend build | — |
| `TUNECAMP_RELAY_URL` | ActivityPub relay URL for broadcasting | — |
| `TUNECAMP_CORS_ORIGINS` | Comma-separated allowed CORS origins | *all* |
| `TUNECAMP_RPC_URL` | Base Network RPC endpoint (Web3) | `https://mainnet.base.org` |
| `TUNECAMP_CURRENCY_CONTRACT` | ERC-20 token contract (USDC on Base) | `0x833589...02913` |
| `TUNECAMP_DOWNLOAD_DIR` | Directory for soulseek downloads | `/data/downloads` |
| `DISCOGS_TOKEN` | Discogs API token for metadata matching | — |
| `SPOTIFY_CLIENT_ID` | Spotify API client ID for metadata/playlist import | — |
| `SPOTIFY_CLIENT_SECRET` | Spotify API client secret | — |
| `YOUTUBE_COOKIES_PATH` | Path to JSON cookies file for YouTube bot bypass | — |
| `LASTFM_API_KEY` | Last.fm API key for scrobbling | — |
| `LISTENBRAINZ_TOKEN` | ListenBrainz token for scrobbling | — |

## API & Integrations

### Subsonic API

Tunecamp exposes a full Subsonic API (version 1.16.1) at `/rest`. This allows you to use your Tunecamp library with major mobile clients like DSub, Symfonium, Tempo, and Substreamer.

**Connection settings for your app:**
- **Server URL**: `https://your-server.com`
- **Username/Password**: Your Tunecamp credentials

> **Roaming Users**: To use Subsonic on a new instance, first log in via the web interface to trigger lazy account creation.

See the [Subsonic API Reference →](./docs/SUBSONIC.md)

### REST API

The platform is driven by a REST JSON API under `/api/`.

See the [OpenAPI Reference →](./docs/openapi.yml)

### Nginx Reverse Proxy

For production deployments, using Nginx as a reverse proxy is recommended for SSL and WebSocket support.

See the [Nginx Configuration Guide →](./docs/NGINX.md)

### Federation & Network Architecture

Tunecamp uses a **hybrid federation model**:

| Layer | Protocol | Purpose |
|:------|:---------|:--------|
| **Discovery** | Zen | Instance URL signaling — announces presence to the network |
| **Identity** | Zen SEA | Cryptographic keypairs, wallet derivation, comments, play/like stats |
| **Content** | HTTP REST | Direct catalog fetching between instances (`/api/catalog`) |
| **Social** | ActivityPub | Artist federation, followers, release broadcasts, posts |

Instances register their URL on the Zen network. The Network page then fetches catalogs directly from each discovered instance via HTTP, ensuring content is always fresh and eliminating stale CRDT data. ActivityPub handles artist-level social features and is compatible with Mastodon and Funkwhale.

See the [Federation Guide →](./docs/FEDERATION.md)

### Smart Contracts

The Web3 payment system uses three Solidity contracts deployed on the Base Network:
- **TuneCampFactory**: Deploys per-instance NFT + Checkout contracts via EIP-1167 minimal proxies.
- **TuneCampNFT**: ERC-1155 multi-role tokens (License, Ownership, Collectible) for music tracks.
- **TuneCampCheckout**: Handles purchases with ETH or USDC with a configurable artist/platform revenue split (85/15 default, 100% for Pro artists).

See the [contracts/](./contracts/) directory.

## Roles & Permissions

Tunecamp uses a role-based access control (RBAC) system with tiered permissions:
- **Instance Owner (Root Admin)**: Full system control, server identity, and global configuration.
- **Manager (Full Admin)**: User monitoring, federation management, and cross-artist content control.
- **Curator (Super User)**: Advanced library management, metadata correction, and global content visibility.
- **Listener (Standard User)**: Content upload, discography management, and personal profile interaction.

See the [Roles & Permissions Guide →](ROLES.md)

## Contributing

Contributions are welcome! Please open an issue or pull request on GitHub.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.
