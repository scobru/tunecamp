# TuneCamp Project Overview

TuneCamp is a federated, self-hosted music platform that combines a personal music server with Fediverse social protocols (ActivityPub), HTTP gossip-based instance discovery, and web3 monetization (on-chain payments on Base).

## Project Goals

- **Data Ownership**: Allow users to host and control their own music library.
- **Federation**: Enable interaction between different TuneCamp servers via the ActivityPub (Fediverse) protocol.
- **Decentralized Discovery**: Use an HTTP gossip protocol to discover other TuneCamp instances; catalogs are then exchanged directly over HTTP.
- **Artist Support**: Facilitate direct publishing, crowdfunding, and rights management via smart contracts and unlock systems.
- **Metadata Enrichment**: Integration with multiple providers (MusicBrainz, Discogs, iTunes, TheAudioDB, Spotify, Bandcamp, SoundCloud) and Lyrics.ovh for high-resolution covers and lyrics.

## Notable Features

- **Radio**: an always-on HLS station broadcast from the instance's library — admins mix custom playlists and dynamic per-genre playlists. See [radio.md](./radio.md).
- **AI access (MCP)**: a Model Context Protocol server lets AI clients (e.g. Claude Desktop) search the catalog and run actions over a token-gated channel. See [mcp-setup-guide.md](./mcp-setup-guide.md).
- **Lab**: embed experimental browser-based audio tools in sandboxed iFrames without touching core. See [LAB.md](./LAB.md).
- **Admin System panel**: live CPU/RAM/storage/background-task metrics for spotting memory leaks. See [monitoring.md](./monitoring.md).
- **Extensibility**: built-in backend providers (metadata, streaming, storage, …) behind per-provider registries. Acquisition (search/download from external sources) lives in Sidecamp, the desktop companion app.

## Tech Stack

### Backend
- **Language**: TypeScript
- **Runtime**: Node.js (Express)
- **Database**: SQLite (via `better-sqlite3`)
- **Federation**: Fedify (ActivityPub)
- **Multimedia**: FFmpeg (for transcoding and waveform generation)

### Webapp (Frontend)
- **Framework**: React
- **Build Tool**: Vite
- **Styling**: CSS (with theme support)
- **State Management**: Zustand
- **Discovery**: HTTP Gossip (only to discover other instances; no P2P distribution of audio content)

### Blockchain & Smart Contracts
- **Language**: Solidity
- **Contracts**: Checkout, Factory, NFT for sales and ownership management.

## Repository Structure

The project is organized as a monorepo with the following main directories:

- `src/server/`: Core backend logic, database, routes, and protocols.
- `webapp/`: React frontend application.
- `contracts/`: Smart contracts for web3 functionality.
- `docs/`: Technical project documentation.

## Related Repositories

| Repo | Description |
|------|-------------|
| [tunecamp](https://github.com/scobru/tunecamp) | Main server + webapp |
| [sidecamp](https://github.com/scobru/sidecamp) | Standalone Desktop App for Peer Sharing, Soulseek, and Torrents |
| [tunecamp-4-track-recorder](https://github.com/scobru/tunecamp-4-track-recorder) | Browser-based 4-track recorder (Svelte 5 component) |
| [tunecamp-website](https://github.com/scobru/tunecamp-website) | Landing page and community directory |

## Related Documentation

- [Source Tree Analysis](./source-tree-analysis.md)
- [Backend Architecture](./architecture-backend.md)
- [Webapp Architecture](./architecture-webapp.md)
- [UI Component Inventory](./component-inventory.md)
- [API Contracts](./api-contracts.md)
- [Data Models](./data-models.md)
- [Development Guide](./development-guide.md)
