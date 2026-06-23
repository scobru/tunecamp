---
layout: home

hero:
  name: "TuneCamp"
  text: "Federated Music Platform"
  tagline: Self-hosted streaming for indie artists, labels, and communities — with federation, Web3, and Subsonic support.
  actions:
    - theme: brand
      text: Get Started
      link: /development-guide
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

## Documentation Index

### Project

| Doc | Description |
|-----|-------------|
| [Project Overview](./project-overview.md) | Goals, tech stack, and general structure |
| [Status & Maturity](./STATUS.md) | Honest maturity level of each area and known limitations |
| [Source Tree](./source-tree-analysis.md) | Detailed description of directories and entry points |
| [vs Funkwhale](./comparison-funkwhale.md) | Differences in models and features |

### Architecture

| Doc | Description |
|-----|-------------|
| [Backend Architecture](./architecture-backend.md) | Express server, SQLite, ActivityPub, federated discovery |
| [Webapp Architecture](./architecture-webapp.md) | React, state management, instance discovery |
| [Data Models](./data-models.md) | Database schema and entity relationships |

### API & Developer Guide

| Doc | Description |
|-----|-------------|
| [API Contracts](./api-contracts.md) | REST endpoints, authentication, supported protocols |
| [API Configuration](./api-setup-guide.md) | Step-by-step: Stripe, Google Drive, AI, and more |
| [Development Guide](./development-guide.md) | Prerequisites, installation, execution, testing |
| [Contributing](./CONTRIBUTING.md) | Code contribution guidelines |

### Integrations

| Doc | Description |
|-----|-------------|
| [Payments & Monetization](./payments.md) | Stripe Checkout, Onramp, on-chain verification |
| [AI Integrations](./ai-integrations.md) | Metadata automation and recommendations |
| [Google Drive](./google-drive.md) | Cloud storage streaming and import |
| [Soulseek](./soulseek.md) | P2P search and download |
| [Torrents](./torrents.md) | WebTorrent integration |
| [Telegram Bot](./telegram.md) | Rapid ingestion and remote management |
| [Smart Contracts](./smart-contracts.md) | Solidity contracts on Base |

### Features & Operations

| Doc | Description |
|-----|-------------|
| [Federation](./FEDERATION.md) | ActivityPub protocol details |
| [Subsonic Protocol](./SUBSONIC.md) | External client support |
| [Plugins](./PLUGINS.md) | Custom providers from a plugins directory |
| [Roles & Permissions](./ROLES.md) | RBAC — Owner, Manager, Curator, Listener |
| [Social & Community](./social-features.md) | Posts, comments, fan interactions |
| [Artist & Sales](./community-mode.md) | Artist request flow and `can_sell` gate |
| [Nginx](./NGINX.md) | Reverse proxy configuration examples |
| [Monitoring](./monitoring.md) | Health endpoint, Sentry, uptime checks |
| [Scaling](./scaling.md) | SQLite/single-process limits and mitigations |
| [Backup & Migration](./backup-migration.md) | Safeguarding and moving your instance |

### Additional Documentation (Specifics)

- [Payments & Monetization](./payments.md): Stripe Checkout, Onramp, and on-chain verification.
- [AI Integrations](./ai-integrations.md): Metadata automation and recommendations via OpenRouter.
- [Google Drive Integration](./google-drive.md): Cloud storage streaming and import.
- [Torrent System](./torrents.md): WebTorrent integration for downloading music.
- [Soulseek Integration](./soulseek.md): P2P search and download.
- [Social & Community](./social-features.md): Posts, comments, and fan interactions.
- [Smart Contracts](./smart-contracts.md): Technical guide to Solidity contracts on Base.
- [Backup & Migration](./backup-migration.md): How to safeguard and move your instance.
- [Scaling & Concurrency Limits](./scaling.md): Practical limits of SQLite/single-process and how to mitigate them.
- [Payments Security Review](./security-review-payments.md): Findings and review of the payments flow.
- [Federation](./FEDERATION.md): Details on the ActivityPub protocol in TuneCamp.
- [Subsonic](./subsonic.md): Support for the Subsonic protocol for external clients.
- [Nginx](./NGINX.md): Configuration examples for reverse proxy.
- [Audio Fingerprinting](./audio-fingerprinting.md): Internal audio fingerprint used for library deduplication.
- [Monitoring & Alerting](./monitoring.md): Health endpoint, Sentry crash reporting, and external uptime checks.
- [Telegram Bot](./telegram.md): Rapid ingestion of music files and remote management.
- [Plugins](./PLUGINS.md): Custom providers (streaming, metadata, storage) from a plugins directory.
- [Lab Apps](./LAB.md): Experimental audio tools embedded in the Lab section — how to create and submit a Lab app.
- [Roles & Permissions](./ROLES.md): RBAC — Instance Owner, Manager, Curator, Listener.
- [Becoming an Artist & Sales](./community-mode.md): Artist request flow and the `can_sell` sales gate.
- [Comparison with Funkwhale](./comparison-funkwhale.md): Differences in models and features.

*Last updated: June 23, 2026*
