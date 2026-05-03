# Backend Architecture - TuneCamp

## Overview
The Backend is a Node.js Express application that serves as the central hub for music metadata, streaming, and decentralized federation. It follows a layered approach, separating routing, business logic, and data persistence.

## Core Components

### 1. Data Layer (Repositories)
Located in `src/server/repositories/`, this layer uses `better-sqlite3` for synchronous, high-performance database operations.
- **TrackRepository:** Handles file paths, metadata, and visibility.
- **SocialRepository:** Manages follows, posts, and Fediverse interactions.
- **RemoteActorRepository:** Caches information about actors from other instances.

### 2. Integration Layer
- **ActivityPub (Fedify):** Implements the decentralized social protocol.
- **Subsonic API:** Provides a legacy interface for external music players.
- **Soulseek:** Integrated for automated music discovery/downloading.
- **Blockchain:** Interfaces with Shogun contracts for licensing and payments.

### 3. Media Processing
- **FFmpeg:** Used for transcoding and metadata extraction.
- **Waveform:** Generates visual data for the frontend player.

## Security & Middleware
- **Auth:** JWT-based authentication for the webapp and Subsonic-specific tokens.
- **Rate Limiting:** Protects sensitive endpoints.
- **Validators:** Strict input validation for all API routes.

## Deployment
- **Docker:** Provided `Dockerfile` for containerized environments.
- **Database:** Local SQLite file (`tunecamp.db`).
