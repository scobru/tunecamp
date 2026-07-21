# Source Tree Analysis

This section describes the structure of the TuneCamp repository, highlighting critical directories and their purpose.

## Project Structure

```
tunecamp/
├── contracts/          # Smart Contracts (Solidity)
│   ├── TuneCampCheckout.sol
│   ├── TuneCampFactory.sol
│   └── TuneCampNFT.sol
├── docs/               # Technical documentation (Markdown, JSON)
├── src/                # Backend sources and tools
│   ├── server/         # Express Server core logic
│   │   ├── common/     # Shared utilities and errors
│   │   ├── core/       # Config, DI container, database, plugin-loader
│   │   ├── middleware/ # Express Middleware (Auth, Error handling, Rate limit)
│   │   ├── modules/    # Domain-specific business logic (ActivityPub, Catalog, AI, Live, Radio, Storage, Workers, ...)
│   │   ├── providers/  # Plugin provider implementations (metadata, streaming, storage, ...)
│   │   ├── repositories/ # Data access layer (Album, Artist, Track)
│   │   ├── routes/     # REST API Endpoints (admin, api [incl. radio, mcp], auth, library, network)
│   │   ├── server.ts   # Express server bootstrap
│   │   ├── types/      # Shared backend types
│   │   └── utils/      # Server utility functions
│   ├── tools/          # Maintenance, backup, and migration scripts
│   └── utils/          # General utility functions
├── webapp/             # React Frontend Application
│   ├── public/         # Static assets and WASM files
│   └── src/            # React sources
│       ├── components/ # UI Components organized by domain
│       ├── data/       # Static client config (labApps.ts holds only category labels/colors — apps are DB-backed, see LAB.md)
│       ├── hooks/      # Custom React Hooks
│       ├── pages/      # Page Components (Route entry points, incl. Radio, Lab)
│       ├── services/   # Client API and webapp services
│       └── stores/     # State management (Zustand)
└── docker-compose.yml  # Configuration for containerized deployment
```

## Critical Directories and Purpose

### `src/server/`
Contains all server-side logic. It uses a layered architecture:
- **Routes**: Define the API interface.
- **Repositories**: Handle SQLite queries.
- **Modules**: Encapsulate complex features such as ActivityPub federation or audio file management.

### `webapp/src/`
The heart of the user interface.
- **Pages**: Fundamental directory mapping the frontend routes.
- **Components**: Divided into `ui/` (base), `layout/`, `modals/`, and thematic directories (`player/`, `artist/`, `admin/`).
- **Services**: `api.ts` is the main gateway for communicating with the backend.

### `contracts/`
Defines the on-chain logic for monetization and access control.

### `src/tools/`
Essential for music library management (relinking paths, database migrations, generating unlock codes).

## Entry Points

- **Backend**: `src/index.ts` — entry point: loads config and calls `startServer` from `src/server/server.ts`.
- **Webapp**: `webapp/src/main.tsx` — mount point of the React application.
- **CLI/Tools**: Various scripts in `src/tools/` (backup, restore, generate-codes, relink-tracks, migrations).
