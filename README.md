[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/Docs-GitHub%20Pages-blue)](https://scobru.github.io/tunecamp/)
[![Website](https://img.shields.io/badge/Website-Tunecamp-blue)](https://tunecamp.vercel.app)

## Why This Exists

Streaming platforms take significant cuts from artists and lock their communities into walled gardens. Tunecamp allows you to host your own music with a beautiful web interface, fully compatible with existing Subsonic mobile apps. It connects you to the Fediverse (via ActivityPub) as a broadcaster and uses federated HTTP gossip for instance discovery, giving artists ownership of their distribution without sacrificing reach.

## Quick Start

The fastest way to run Tunecamp is using Docker Compose.

```bash
# 1. Clone the repository
git clone https://github.com/scobru/tunecamp.git
cd tunecamp

# 2. Edit docker-compose.yml to set your music directory
#    Change /path/to/your/music to your actual music folder

# 3. Start the server in the background
docker-compose up -d --build

# 4. Access the dashboard
# Open http://localhost:1970 in your browser
```

> **First Run**: Tunecamp creates a default admin account (`admin`/`admin`, configurable via `TUNECAMP_ADMIN_USER` / `TUNECAMP_ADMIN_PASS`). Change the password right after logging in, from the admin settings.
>
> The forced "change your password" setup wizard triggers for any account still using a built-in default password — the temporary sentinel `tunecamp` (set after an admin resets a user's password, see [docs/ROLES.md](docs/ROLES.md)) or the initial `admin` password. The server also logs a security warning at startup while the admin account, open CORS, or an auto-generated JWT secret are left at their defaults.

## Features

### Core

- 🎵 **Audio-first**: Automatically reads metadata, generates waveforms, and processes cover art from your audio files (MP3, FLAC, WAV, etc.).
- 🖥️ **Streaming Server**: Personal streaming server with a modern, responsive web interface.
- 🎨 **Customizable**: Theming, background images, cover images, site branding, and per-artist profiles.
- 🔍 **Full-text Search**: Search across artists, albums, and tracks with fuzzy matching.
- 📈 **Scrobbling**: Optional Last.fm and ListenBrainz scrobbling (configured per-user in settings).
- 🧩 **Metadata Providers**: Discogs, MusicBrainz, iTunes, TheAudioDB, Spotify, Bandcamp, and SoundCloud for tagging and enrichment.
- 🔊 **Smart Streaming**: Provider fallback for missing local files via SoundCloud and Bandcamp, with caching and automatic retries.

### Decentralization & Federation

- 🔐 **Instance Identity**: Each server holds a cryptographic keypair used to sign its entry in the community registry.
- 📡 **ActivityPub**: Connect with the Fediverse (Mastodon, Funkwhale, Pleroma) as a broadcaster. Artists are ActivityPub actors with followers, posts, and release broadcasts.
- 🌐 **Community Network**: Discover other Tunecamp instances via federated HTTP gossip, then fetch catalogs directly via HTTP REST for always-fresh content.
- 🔗 **HTTP Federation**: Instances expose a public `/api/catalog` endpoint, enabling direct instance-to-instance content discovery without intermediary replication.

### Streaming & Clients

- 🔊 **Subsonic/OpenSubsonic API**: Full compatibility (v1.16.1) with mobile apps like DSub, Symfonium, Tempo, Substreamer, Amuse, and play:Sub.
- 📻 **Radio Station**: Broadcast an always-on radio station transcoded from your playlists and dynamic genre mixes. Delivers a rolling HLS stream, M3U playlist, and podcast-style RSS feed. See [radio.md](docs/radio.md).
- 🧪 **TuneCamp Lab**: Embedded playground that sandboxes experimental browser-based audio tools (like the 4-track cassette recorder or the regl 3D visualizer) via secure, sandboxed iFrames. See [LAB.md](docs/LAB.md).
- 🎧 **Built-in Player**: Waveform visualization, queue management, lyrics display, and keyboard shortcuts.
- 📋 **Playlists**: Create and share playlists (public/private).
- 🎙️ **Live Streaming (HLS)**: Artists broadcast live audio from the browser; the server transcodes it to HLS (AAC segments) with FFmpeg and serves a rolling playlist to all listeners.
- 💬 **Social Interactions**: Add comments to tracks, write artist posts, and broadcast to the federated network via ActivityPub. See [social-features.md](docs/social-features.md).

### Web3 & Monetization

- 💰 **On-chain Payments**: NFT-based purchases (ERC-1155) with USDC and ETH on the Base Network.
- 💳 **Fiat Payments**: Optional Stripe checkout for non-crypto purchases.
- 🏭 **Factory Contract**: Self-hosters deploy their own NFT + Checkout contract instances via EIP-1167 minimal proxies.
- 🔑 **Unlock Codes**: Generate and distribute access codes for gated releases.
- 👛 **Wallet Integration**: Connect a browser wallet (MetaMask or any injected EIP-1193 provider) for on-chain purchases.

### Administration

- 🛡️ **Role-Based Access (RBAC)**: Root Admin, Admin, and Artist/User roles with granular permissions. See [ROLES.md](docs/ROLES.md).
- 🤖 **Model Context Protocol (MCP)**: Built-in MCP server that allows AI assistants (like Claude Desktop) to connect securely and inspect or manage the instance catalog. See [mcp-setup-guide.md](docs/mcp-setup-guide.md).
- 🧠 **AI Assistant**: Optional OpenRouter-powered assistant for library tasks. See [ai-integrations.md](docs/ai-integrations.md).
- 📤 **Bulk Upload**: Multi-file upload with automatic metadata extraction and album assignment.
- ✏️ **Batch Editing**: Edit cover art, metadata, and pricing across multiple tracks at once.
- 📁 **File Browser**: Browse the server filesystem and attach files to the library.
- 🤖 **Telegram Bot**: Rapid ingestion of music files and remote management. See [telegram.md](docs/telegram.md).
- 💾 **Backup & Restore**: Full database backup/restore via the admin panel or CLI.
- 📊 **Statistics**: Play counts, listening time, top tracks/artists, and library stats.
- 📟 **Monitoring & System Diagnostics**: Live CPU, memory, storage, and background task metrics via the admin System panel, plus `/health` endpoints and Sentry reporting. See [monitoring.md](docs/monitoring.md).

### Content Acquisition

- 🏷️ **Discogs Metadata**: Match tracks against the Discogs database for accurate tagging.
- ☁️ **Google Drive Storage**: Optional Google Drive backend for media storage. See [google-drive.md](docs/google-drive.md).
- 🔌 **Sidecamp Acquisition**: Music acquisition (Soulseek, BitTorrent, yt-dlp, Internet Archive) lives in [Sidecamp](#tunecamp-ecosystem), the desktop companion app — the server stays a pure host.

### Deployment

- 📦 **Docker Ready**: Multi-stage Dockerfile with health checks, optimized for production.
- 🚀 **CapRover Support**: One-click deploy with automatic cache busting.
- 📱 **PWA Support**: Installable as a Progressive Web App with offline service worker.

## TuneCamp Ecosystem

In addition to the core server, the TuneCamp ecosystem includes several companion projects:

- [**sidecamp**](https://github.com/scobru/sidecamp): A standalone Electron desktop app that handles all P2P content acquisition — Soulseek search & download, BitTorrent, and yt-dlp audio ripping — plus peer file-sharing with any TuneCamp instance via a reverse WebSocket tunnel. Keeps the core server clean and compliant.
- [**tunecamp-website**](https://github.com/scobru/tunecamp-website): The landing page, global community directory, and web-based community audio player.
- [**tunecamp-peer**](https://github.com/scobru/tunecamp-peer): A lightweight CLI daemon that shares your local music folders with any TuneCamp instance over a secure, reverse WebSocket tunnel.
- [**tunecamp-4-track-recorder**](https://github.com/scobru/tunecamp-4-track-recorder): A browser-based 4-track cassette recorder built with the Web Audio API and Svelte 5, featuring low-latency overdubbing and mixer capabilities.
- [**tunecamp-audiofabric**](https://github.com/scobru/tunecamp-audiofabric): An interactive, real-time 3D WebGL music visualizer built with `regl` and the Web Audio API.

## Installation & Setup

### Using Docker Compose (Production)

**Prerequisites**: Docker 20+, Docker Compose

```bash
git clone https://github.com/scobru/tunecamp.git
cd tunecamp

# Edit docker-compose.yml to configure your music path and environment
docker-compose up -d --build
```

### Using Node.js (Development)

**Prerequisites**: Node.js 18+, npm 9+, FFmpeg installed

```bash
# Clone the repository
git clone https://github.com/scobru/tunecamp.git
cd tunecamp

# Install all dependencies (both root and webapp workspace)
npm install

# Build backend and frontend
npm run build
npm run build -w webapp

# Start the server (runs migrations automatically)
npm start
```

For development with hot-reload:

```bash
# Terminal 1: Watch backend TypeScript and CSS
npm run dev

# Terminal 2: Start the backend server
npm start

# Terminal 3: Start frontend (Vite dev server with HMR)
cd webapp && npm run dev
```

### CLI Usage

After building (`npm run build`), the server and maintenance tools run via Node. Paths and ports are configured through environment variables (see [Configuration](#configuration)), not flags.

```bash
# Start the server
npm start

# Backup the database (writes tunecamp-<timestamp>.db into the target dir)
node dist/tools/backup.js ./backups

# Restore from a backup (use --force to overwrite an existing database)
node dist/tools/restore.js ./backups/tunecamp-2026-01-01.db --force
```

See [backup-migration.md](docs/backup-migration.md) for more maintenance scripts.

### Configuration

Configuration is managed via environment variables (or an `.env` file).

**Core**

| Variable                | Description                                            | Default                                                  |
| :---------------------- | :----------------------------------------------------- | :------------------------------------------------------- |
| `TUNECAMP_PORT`         | Server listen port                                     | `1970`                                                   |
| `TUNECAMP_MUSIC_DIR`    | Path to the music library                              | `./music`                                                |
| `TUNECAMP_DB_PATH`      | Path to the SQLite database                            | `./tunecamp.db`                                          |
| `TUNECAMP_JWT_SECRET`   | JWT signing secret (auto-generated if not set)         | _auto_                                                   |
| `TUNECAMP_ADMIN_USER`   | Default admin username                                 | `admin`                                                  |
| `TUNECAMP_ADMIN_PASS`   | Default admin password                                 | `admin`                                                  |
| `TUNECAMP_PUBLIC_URL`   | Public HTTPS URL (required for ActivityPub federation) | —                                                        |
| `TUNECAMP_SITE_NAME`    | Human-readable instance name                           | `My TuneCamp Server`                                     |
| `TUNECAMP_CORS_ORIGINS` | Comma-separated allowed CORS origins                   | _all_                                                    |
| `TUNECAMP_DOWNLOAD_DIR` | Directory for download-provider plugins (e.g. Sidecamp) | `./music/downloads` (local) / `/data/downloads` (Docker) |

**Federation & Network**

| Variable                    | Description                                                                 | Default |
| :-------------------------- | :-------------------------------------------------------------------------- | :------ |
| `TUNECAMP_FEDERATION_SEEDS` | Comma/space-separated seed instance URLs to bootstrap HTTP gossip discovery | —       |

> ActivityPub relay broadcasting is configured at runtime via the admin panel (`relayUrl` setting), not an environment variable.

**Integrations**

| Variable                        | Description                                                      | Default           |
| :------------------------------ | :--------------------------------------------------------------- | :---------------- |
| `TUNECAMP_TELEGRAM_BOT_TOKEN`   | Telegram Bot API token for ingestion                             | —                 |
| `TUNECAMP_TELEGRAM_MASTER_ID`   | Telegram User ID of the master administrator                     | —                 |
| `OPENROUTER_API_KEY`            | OpenRouter API key for the Linda AI assistant                    | —                 |
| `OPENROUTER_MODEL`              | OpenRouter model id                                              | `openrouter/free` |
| `DISCOGS_TOKEN`                 | Discogs API token for metadata matching (also settable in admin) | —                 |
| `TUNECAMP_GDRIVE_CLIENT_ID`     | Google Drive OAuth client ID for storage backend                 | —                 |
| `TUNECAMP_GDRIVE_CLIENT_SECRET` | Google Drive OAuth client secret                                 | —                 |

> Last.fm and ListenBrainz scrobbling are configured per-user in the app settings (no environment variable needed).

**Payments (Web3 & Fiat)**

| Variable                   | Description                                                       | Default |
| :------------------------- | :---------------------------------------------------------------- | :------ |
| `TUNECAMP_RPC_URL`         | Base Network RPC endpoint (backend)                               | —       |
| `TUNECAMP_OWNER_ADDRESS`   | Instance owner wallet address for payouts                         | —       |
| `STRIPE_SECRET_KEY`        | Stripe secret key for fiat checkout                               | —       |
| `STRIPE_WEBHOOK_SECRET`    | Stripe webhook signing secret                                     | —       |
| `STRIPE_ONRAMP_SECRET_KEY` | Stripe key for crypto on-ramp (falls back to `STRIPE_SECRET_KEY`) | —       |

**Frontend build (Vite — `VITE_*`)**

| Variable                          | Description                                     | Default                                      |
| :-------------------------------- | :---------------------------------------------- | :------------------------------------------- |
| `VITE_TUNECAMP_RPC_URL`           | Base RPC endpoint used by the in-browser wallet | `https://mainnet.base.org`                   |
| `VITE_TUNECAMP_CURRENCY_CONTRACT` | ERC-20 token contract (USDC on Base)            | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

## API & Integrations

### Subsonic API

Tunecamp exposes a full Subsonic API (version 1.16.1) at `/rest`. This allows you to use your Tunecamp library with major mobile clients like DSub, Symfonium, Tempo, and Substreamer.

**Connection settings for your app:**

- **Server URL**: `https://your-server.com`
- **Username/Password**: Your Tunecamp credentials

See the [Subsonic API Reference →](./docs/subsonic.md)

### REST API

The platform is driven by a REST JSON API under `/api/`.

See the [OpenAPI Reference →](./docs/openapi.yml)

### Nginx Reverse Proxy

For production deployments, using Nginx as a reverse proxy is recommended for SSL and WebSocket support.

See the [Nginx Configuration Guide →](./docs/NGINX.md)

### Federation & Network Architecture

Tunecamp uses a **hybrid federation model**:

| Layer         | Protocol    | Purpose                                                      |
| :------------ | :---------- | :----------------------------------------------------------- |
| **Discovery** | HTTP Gossip | NodeInfo-based discovery — announces presence to the network |
| **Content**   | HTTP REST   | Direct catalog fetching between instances (`/api/catalog`)   |
| **Social**    | ActivityPub | Artist federation, followers, release broadcasts, posts      |

Instances discover each other via HTTP gossip crawling. The Network page then fetches catalogs directly from each discovered instance via HTTP, ensuring content is always fresh and eliminating stale CRDT data. ActivityPub handles artist-level social features and is compatible with Mastodon and Funkwhale via a lightweight Broadcaster model.

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

See the [Roles & Permissions Guide →](docs/ROLES.md)

## Contributing

Contributions are welcome! Please open an issue or pull request on GitHub.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.
