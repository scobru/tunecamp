# Project Overview - TuneCamp

## Description
TuneCamp is a decentralized music platform designed for artists and labels. It combines traditional music streaming capabilities with modern federation via ActivityPub, decentralized storage/identity concepts, and support for the legacy Subsonic API.

## Key Features
- **Streaming & Catalog:** Manage artists, albums, and tracks with rich metadata.
- **Federation:** Built-in ActivityPub support via Fedify for decentralized social interactions.
- **Subsonic API:** Compatibility with a wide range of legacy music clients.
- **Web3 Integration:** Blockchain-based features using Shogun contracts for ownership and payments.
- **Admin Tools:** Maintenance, backup, and metadata management panels.

## Technology Stack Summary

### Backend
- **Runtime:** Node.js (ESM)
- **Framework:** Express
- **Database:** SQLite (via `better-sqlite3`)
- **Federation:** Fedify
- **Audio:** FFmpeg, music-metadata, waveform-data
- **Blockchain:** Ethers.js, Shogun Contracts SDK

### Frontend (WebApp)
- **Framework:** React 19
- **Build Tool:** Vite
- **State:** Zustand
- **Styling:** Tailwind CSS, DaisyUI
- **Routing:** React-Router-Dom

## Repository Structure
The project is organized as a **Monorepo** using npm workspaces:
- `.` (Root): Backend server, contracts, and shared tools.
- `webapp/`: React-based frontend application.
- `website/`: Static landing page/marketing site.
- `contracts/`: Solidity smart contracts.
- `docs/`: Specialized technical documentation.

## Architecture Type
- **Type:** Multi-part (Client-Server)
- **Pattern:** Repository-based Backend / Component-driven Frontend
