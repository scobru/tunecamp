# Source Tree Analysis - TuneCamp

## Directory Structure Overview

```text
tunecamp/
├── contracts/          # Solidity Smart Contracts (TuneCampNFT, Factory, etc.)
├── docs/               # Technical docs (Federation, Subsonic, Nginx)
├── src/
│   ├── index.ts        # Server Entry Point
│   └── server/         # Backend Core
│       ├── routes/     # REST & ActivityPub Endpoints
│       ├── repositories/ # Data Access Layer (SQL queries)
│       ├── middleware/ # Auth, Error Handling, Rate Limiting
│       ├── modules/    # Specialized logic (ActivityPub, Storage, Waveform)
│       ├── services/   # Business logic
│       └── zendb.ts    # Database initialization
├── webapp/             # React Frontend (Workspace)
│   ├── src/
│   │   ├── components/ # UI Components (Admin, Player, Modals)
│   │   ├── stores/     # Zustand state management
│   │   ├── services/   # API client services
│   │   └── App.tsx     # Main App Component
├── website/            # Static Landing Page
├── deps/               # Local dependencies (zen)
├── tools/              # Maintenance and migration scripts
├── Dockerfile          # Container configuration
└── package.json        # Project manifest & workspaces
```

## Critical Folders & Files

### Backend
- `src/index.ts`: The bootstrap file for the Express server.
- `src/server/routes/`: Defines the API surface including Subsonic and ActivityPub.
- `src/server/repositories/`: Direct interactions with the SQLite database.
- `src/server/fedify.ts`: ActivityPub configuration and actor logic.

### Frontend
- `webapp/src/main.tsx`: React application entry point.
- `webapp/src/stores/`: Global state for player, auth, and wallet.
- `webapp/src/components/player/`: Core music playback UI logic.

### Infrastructure
- `docker-compose.yml`: Orchestration for the server and potentially other services.
- `nginx.md`: Reference for production proxy setup.
