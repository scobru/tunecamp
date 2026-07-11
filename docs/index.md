---
layout: home

hero:
  name: "TuneCamp"
  text: "Federated Music Platform"
  tagline: Self-hosted streaming for indie artists, labels, and communities — with federation, Web3, and Subsonic support.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/scobru/tunecamp

features:
  - icon: 🎵
    title: Streaming & Clients
    details: Full Subsonic API, HLS live streaming, playlists, and cross-platform client support.
  - icon: 🌐
    title: Federated by Design
    details: ActivityPub-based federation lets instances discover and share content across the network.
  - icon: 💎
    title: Web3 & Monetization
    details: NFT minting, Stripe payments, factory contracts, and wallet integration on Base.
  - icon: 🔌
    title: Extensible via Plugins
    details: Custom streaming, metadata, and storage providers via a simple plugin system.
  - icon: 🤖
    title: AI-Powered Metadata
    details: Automatic metadata enrichment and recommendations via OpenRouter integrations.
  - icon: 🛡️
    title: RBAC & Security
    details: Role-based access control with Instance Owner, Manager, Curator, and Listener tiers.
---

## Documentation

### 🚀 Getting Started

**New here? Start with the [Getting Started guide](./getting-started.md).** It walks you from an empty machine to a running instance with music in it — install, first login, adding your library, and listening — in about 10 minutes.

Once you're up and running, the guides below go deeper.

| Doc | Description |
|-----|-------------|
| [Getting Started](./getting-started.md) | **Install → first login → add music → listen** (start here) |
| [Deploy on Railway](./railway.md) | One-click deploy on Railway — no VPS required, HTTPS included |
| [API & Services Setup](./api-setup-guide.md) | Step-by-step configuration for Stripe, Google Drive, AI, and other integrations |
| [Nginx Configuration](./NGINX.md) | Reverse proxy setup for SSL, WebSocket, and HLS |
| [Backup & Migration](./backup-migration.md) | Database backup, restore, and moving your instance |

---

### User Guide

For listeners and artists using a TuneCamp instance.

| Doc | Description |
|-----|-------------|
| [Roles & Permissions](./ROLES.md) | What each role (Owner, Manager, Curator, Listener) can do |
| [Radio](./radio.md) | Broadcasting an always-on station from your library (playlists + genre mixes) |
| [Subsonic Protocol](./subsonic.md) | Connecting external clients (DSub, Symfonium, Tempo, Substreamer) |
| [Social & Community Features](./social-features.md) | Posts, comments, and fan interactions |
| [Becoming an Artist & Selling](./community-mode.md) | Artist request flow and the `can_sell` sales gate |
| [Payments & Monetization](./payments.md) | Stripe checkout, crypto on-ramp, and on-chain purchases |

---

### Administrator Guide

For people running a TuneCamp instance.

| Doc | Description |
|-----|-------------|
| [Federation](./FEDERATION.md) | ActivityPub and HTTP gossip discovery — how instances find each other |
| [Sidecamp Desktop](./sidecamp.md) | Desktop application for Sidecamp, Soulseek, and Torrents |
| [Monitoring](./monitoring.md) | `/health` endpoint, the admin System Resources panel, Sentry crash reporting, and uptime checks |
| [Scaling](./scaling.md) | SQLite / single-process limits and mitigations |
| [MCP Setup](./mcp-setup-guide.md) | Exposing the TuneCamp catalog to AI clients via MCP |

---

### Developer Guide

For contributors and people building on TuneCamp.

| Doc | Description |
|-----|-------------|
| [Contributing](./CONTRIBUTING.md) | Code contribution guidelines and pull request process |
| [Development Guide](./development-guide.md) | Local dev environment setup, running, and testing |
| [Backend Architecture](./architecture-backend.md) | Express server, SQLite, ActivityPub, and federated discovery |
| [Webapp Architecture](./architecture-webapp.md) | React, Vite, Zustand, and instance discovery in the frontend |
| [UI Component Inventory](./component-inventory.md) | Catalog of the webapp's React components by directory |
| [Data Models](./data-models.md) | Database schema and entity relationships |
| [API Contracts](./api-contracts.md) | REST endpoints, authentication, and supported protocols |
| [Source Tree](./source-tree-analysis.md) | Directory layout and entry points |
| [Lab Apps](./LAB.md) | Creating and submitting experimental audio tools |
| [Lab App: Audiofabric](./audiofabric.md) | Real-time 3D WebGL music visualizer built-in Lab app |
| [Lab App: 4-Track Recorder](./4-track-recorder.md) | Browser-based 4-track cassette recorder companion package |

---

### Integrations

Optional third-party services you can connect to your instance.

| Doc | Description |
|-----|-------------|
| [AI Integrations](./ai-integrations.md) | Metadata automation and recommendations via OpenRouter |
| [Smart Contracts](./smart-contracts.md) | Solidity contracts (Factory, NFT, Checkout) on Base |
| [Google Drive](./google-drive.md) | Cloud storage backend for media files |
| [Sidecamp](./sidecamp.md) | P2P acquisition (Soulseek, BitTorrent, yt-dlp) via the desktop companion app |
| [Telegram Bot](./telegram.md) | Rapid file ingestion and remote management |

---

### Reference

| Doc | Description |
|-----|-------------|
| [Project Overview](./project-overview.md) | Goals, tech stack, and repository structure |
| [Status & Maturity](./STATUS.md) | Honest maturity level of each area and known limitations |
| [Comparison with Funkwhale](./comparison-funkwhale.md) | Differences in models and features |
| [Audio Fingerprinting](./audio-fingerprinting.md) | How TuneCamp deduplicates tracks in the library |
| [Payments Security Review](./security-review-payments.md) | Internal security review findings for the payments flow |

---

*Last updated: June 24, 2026*
