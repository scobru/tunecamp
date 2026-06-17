# TuneCamp Project Overview

TuneCamp is a federated, self-hosted music platform that combines a personal music server with Fediverse social protocols (ActivityPub), HTTP gossip-based instance discovery, and web3 monetization (on-chain payments on Base).

## Project Goals

- **Data Ownership**: Allow users to host and control their own music library.
- **Federation**: Enable interaction between different TuneCamp servers via the ActivityPub (Fediverse) protocol.
- **Decentralized Discovery**: Use an HTTP gossip protocol to discover other TuneCamp instances; catalogs are then exchanged directly over HTTP.
- **Artist Support**: Facilitate direct publishing, crowdfunding, and rights management via smart contracts and unlock systems.
- **Metadata Enrichment**: Integration with multiple providers (MusicBrainz, Discogs, iTunes, TheAudioDB, Spotify, Bandcamp, SoundCloud) and Lyrics.ovh for high-resolution covers and lyrics.

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
- `website/`: Static presentation website.
- `docs/`: Technical project documentation.

## Related Documentation

- [Source Tree Analysis](./source-tree-analysis.md)
- [Backend Architecture](./architecture-backend.md)
- [Webapp Architecture](./architecture-webapp.md)
- [UI Component Inventory](./component-inventory.md)
- [API Contracts](./api-contracts.md)
- [Data Models](./data-models.md)
- [Development Guide](./development-guide.md)
