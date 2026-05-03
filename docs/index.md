# Project Documentation Index - TuneCamp

## Project Overview
- **Type:** Monorepo (Backend + WebApp + Contracts)
- **Primary Language:** TypeScript
- **Architecture:** Layered Backend / Component-driven Frontend

## Quick Reference

### Backend (Server)
- **Type:** Node.js Backend
- **Tech Stack:** Express, SQLite, Fedify, FFmpeg
- **Root:** `.`

### WebApp (Frontend)
- **Type:** React Web Application
- **Tech Stack:** React 19, Vite, Zustand, Tailwind
- **Root:** `./webapp`

## Generated Documentation
- [Project Overview](./project-overview.md)
- [Source Tree Analysis](./source-tree-analysis.md)
- [Backend Architecture](./architecture-backend.md)
- [WebApp Architecture](./architecture-webapp.md)
- [Component Inventory](./component-inventory.md)
- [API Contracts](./api-contracts.md)
- [Data Models](./data-models.md)
- [Development Guide](./development-guide.md)

## Existing Documentation
- [README.md](../../README.md) - Main project entry.
- [CONTRIBUTING.md](../../CONTRIBUTING.md) - How to contribute.
- [ROLES.md](../../ROLES.md) - System roles.
- [Federation (docs)](../../docs/FEDERATION.md) - ActivityPub details.
- [Subsonic (docs)](../../docs/SUBSONIC.md) - API details.

## Getting Started
To get the project running locally:
1. `npm install` in the root.
2. `npm run build` to compile the backend.
3. `cd webapp && npm install && npm run dev` to start the frontend.
4. Check the `README.md` for environment variable requirements.
