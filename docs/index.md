# Project Documentation Index

Welcome to the **TuneCamp** technical documentation. This index serves as the main entry point to understand the architecture, technologies, and inner workings of the system.

### Project Overview

- [**Project Status**](./STATUS.md): Honest maturity level of each area (stable/beta/opt-in) and known limitations.
- [**Project Overview**](./project-overview.md): Goals, tech stack, and general structure.
- [**Source Tree Analysis**](./source-tree-analysis.md): Detailed description of directories and entry points.

### Technical Architecture

- [**Backend Architecture**](./architecture-backend.md): Details on the Express server, SQLite, ActivityPub, and federated discovery.
- [**Webapp Architecture**](./architecture-webapp.md): Details on the React application, state management, and instance discovery.
- [**Data Models**](./data-models.md): Database schema and relationships between entities.

### API References and Components

- [**API Contracts**](./api-contracts.md): Documentation of REST endpoints, authentication, and supported protocols.
- [**UI Component Inventory**](./component-inventory.md): Catalog of the webapp's React components.

### Developer's Guide

- [**Development Guide**](./development-guide.md): Prerequisites, installation, execution, and testing.
- [**API Configuration**](./api-setup-guide.md): Step-by-step guide for Stripe, Google Drive, AI, and more.
- [**CONTRIBUTING.md**](./CONTRIBUTING.md): Code contribution guidelines.

---

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
- [Roles & Permissions](./ROLES.md): RBAC — Instance Owner, Manager, Curator, Listener.
- [Becoming an Artist & Sales](./community-mode.md): Artist request flow and the `can_sell` sales gate.
- [Comparison with Funkwhale](./comparison-funkwhale.md): Differences in models and features.

---

*Last updated: June 14, 2026*
