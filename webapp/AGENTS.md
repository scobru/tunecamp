# TuneCamp Webapp

## Purpose

React/Vite SPA — music listening UI plus admin, artist, and federated-network tooling. See `../docs/architecture-webapp.md` for the full component/store/hook map.

## Ownership

- `components/` — by domain: `player/`, `admin/`, `artist/`, `network/`, `layout/`, `modals/`, `ui/`
- `pages/` — route targets wired in `App.tsx`, gated by `AdminGuard`/`EditorGuard`/`RootAdminGuard`/`ManagerOrRootGuard`/`ModuleGuard`
- `core/plugins/`, `plugins/` — `FrontendPlugin` registry for optional integrations (Telegram, OpenRouter, metadata providers, YouTube)
- `stores/` — Zustand, one store per concern (auth, config, site settings, player, wallet, UI, dig, …)
- `hooks/`, `lib/` — TanStack Query client + query-key constants, feature-specific data hooks
- `services/` — `api.ts` (all REST calls), `wallet.ts` (ethers.js wallet)
- `utils/` — formatting, sanitization, permissions/roles, theme helpers

## Local Contracts

Inherits root [../AGENTS.md](../AGENTS.md). Webapp-specific:

- Plugin folders under `plugins/*/index.{ts,tsx}` are auto-loaded via `import.meta.glob` — a white-label build drops a provider by deleting its directory, no other file changes.
- Plugin registry (`core/plugins/registry.tsx`) is presentation-only (status badges, config forms); search/download logic lives in the backend, not here.
- Route/module visibility flags (`hideLive`, `hideStore`, `hideSocial`, `hideNetwork`, `hideDig`, `hideSamples`, `hideCollab`) come from `useSiteSettingsStore` and are enforced by `ModuleGuard` — don't hardcode visibility checks elsewhere.
- Playlists are members-only; don't gate them above the `user` role.

## Work Guidance

(none beyond root)

## Verification

From `webapp/`: `npm test` (Vitest) · `npm run test:run` (CI mode) · `npm run lint`.

## Child DOX Index

None.
