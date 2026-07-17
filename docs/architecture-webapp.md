# Webapp Architecture

The TuneCamp webapp is a single-page application (SPA) built with React and Vite, optimized for the music listening experience and decentralized/federated interaction.

## Tech Stack

- **UI Framework**: React (TypeScript)
- **Build Tool**: Vite
- **Data fetching/caching**: TanStack Query (`@tanstack/react-query`), see `lib/queryClient.ts` and `hooks/queries.ts` for shared cache keys
- **Client State**: Zustand
- **Routing**: React Router (routes declared in `App.tsx`, guarded by role/module wrapper components)
- **Instance Discovery**: HTTP Gossip REST API
- **Wallet**: Ethers.js v6 (EIP-1193 injected provider, e.g. MetaMask)
- **i18n**: `i18next` / `react-i18next`, locale files under `i18n/locales/{en,it}/`

## Code Organization (`webapp/src/`)

### 1. Components (`components/`)
Organized by functional domain:
- **`player/`**: Global player — `PlayerBar`, `PlayerCanvas`, `QueuePanel`, `LyricsPanel`, `Waveform`.
- **`admin/`**: Admin panels and library management lists (users, releases, tracks, federation, storage, backups, radio, Lab apps, reports, system health, …).
- **`artist/`**: Artist-facing tools — Fediverse panel, events manager, Stripe Connect card.
- **`network/`**: Federated-network cards (peer sessions, peer tracks).
- **`layout/`**: `MainLayout` (shell) and `Sidebar` (primary nav).
- **`modals/`**: All dialog windows (auth, setup, publishing, purchase/unlock, playlists, imports, reports, …).
- **`ui/`**: Small reusable pieces (cards, headers, switchers, pills, form cards). There is no separate `auth/` component directory — auth-related dialogs live in `modals/`.
- A few components live directly under `components/` (not in a subfolder): `Comments.tsx`, `RelatedTracks.tsx`, `GenreTags.tsx`, `MetadataMatchModal.tsx`, `AccountMigrationCard.tsx`, `UpdateBanner.tsx`.

See [component-inventory.md](./component-inventory.md) for the full, per-file catalog.

### 2. Pages (`pages/`)
Each file is generally a route target wired up in `App.tsx`. Some legacy paths (`/tracks`, `/favorites`, `/playlists`, `/my-playlists`) now redirect into the merged `Library` page rather than rendering a dedicated component — the standalone `ContentSearch` page has been removed and folded into `Search.tsx`. Routes are wrapped with guard components (`AdminGuard`, `EditorGuard`, `RootAdminGuard`, `ManagerOrRootGuard`, `ModuleGuard`) that gate access by role or by instance feature flag (`hideLive`, `hideStore`, `hideSocial`, `hideNetwork`, `hideDig`, `hideDj`).

### 3. Frontend Plugin System (`core/plugins/`, `plugins/`)
Optional integrations (Telegram, OpenRouter/AI, metadata providers, YouTube/yt-dlp, …) register themselves as `FrontendPlugin` objects with a small `PluginRegistry` (`core/plugins/registry.tsx`) instead of being hardcoded into the admin UI:
- `core/plugins/index.ts` initializes the registry, then uses `import.meta.glob` to eagerly load every `plugins/*/index.{ts,tsx}` folder. A white-label build can drop a provider by deleting its directory — no other file needs to change.
- Each plugin can declare an icon, description, a `statusCheck` (maps backend health/plugin status to online/offline), a `configPanel` (rendered inside `AdminSettingsPanel`/`IntegrationsPanel`), and a `customAction` (e.g. "Upload Cookies" for YouTube).
- Current plugin folders: `plugins/builtins/` (Telegram, OpenRouter), `plugins/metadata/` (iTunes, MusicBrainz, Deezer, Bandcamp, Spotify, SoundCloud), `plugins/youtube/`.
- This registry is presentation-only (status badges, config forms in the admin UI); it does not perform the searches/downloads itself — that logic lives in the backend.

### 4. State Stores (`stores/`)
Zustand stores, one per concern:
- `useAuthStore`: logged-in user, JWT/session state, role.
- `useConfigStore`: backend integration health (Soulseek, iTunes, MusicBrainz, Discogs, Telegram, OpenRouter, Stripe, MoonPay, Google Drive, YouTube, Spotify, …) used to drive plugin status badges.
- `useSiteSettingsStore`: public site settings and per-module visibility flags (`hideLive`, `hideStore`, `hideSocial`, `hideNetwork`, `hideDig`, `hideDj`) consumed by `ModuleGuard`.
- `usePlayerStore`: playback state — current track, queue, shuffle/original queue, volume, progress (persisted).
- `useNowPlayingStore`: the user's "now listening" presence opt-in, kept in sync with the player heartbeat.
- `useWalletStore`: connected wallet (provider, signer, address, ETH/USDC balances).
- `useUIStore`: theme and sidebar open/collapsed state (persisted).
- `useConfirmStore`: promise-based confirmation dialog (replaces `window.confirm`).
- `useDigStore`: state for the "Dig" crate-digging/discovery flow (search, strategy, results, session).

### 5. Data fetching (`hooks/`, `lib/`)
- `lib/queryClient.ts` + `hooks/queries.ts`: shared TanStack Query client and query-key constants for catalog lists, so reads and cache invalidation after mutations stay in sync.
- `hooks/useBoard.ts`, `hooks/useNowPlayingHeartbeat.ts`, `hooks/useOwnedNFTs.ts`, `hooks/usePurchases.ts`, `hooks/useVersionCheck.ts`: feature-specific data hooks.

### 6. Services (`services/`)
- `api.ts`: single `API` object wrapping every REST call to the TuneCamp backend (auth, catalog, uploads, payments, admin, radio, dig, …).
- `wallet.ts`: browser wallet management (connection, signing, on-chain transactions via ethers).

### 7. Utilities (`utils/`)
Formatting, sanitization, markdown rendering, permission checks (`permissions.ts`, `roles.ts`), URL helpers, theme/font helpers, and image-fallback logic used across components.

## Navigation & Playback Flow

1. **Navigation**: User clicks an album card → `AlbumDetails.tsx` fetches data via `api.ts` (through a TanStack Query hook) → data rendered with `artist/` and `ui/` components.
2. **Playback**: Click "Play" → track pushed onto `usePlayerStore`'s queue → `player/PlayerBar.tsx` streams from the backend (`/api/tracks/:id/stream`), falling back to the external source URL when no local file exists.
3. **Now Listening**: While a track plays and the user has opted in (`useNowPlayingStore`), `hooks/useNowPlayingHeartbeat.ts` periodically reports the current track to the presence endpoint.
4. **Web3 Interaction**: Connect wallet → `wallet.ts`/`useWalletStore` manage the account → purchase releases or unlock gated content on-chain.
5. **Admin integrations**: `AdminSettingsPanel`/`IntegrationsPanel` render one card per registered `FrontendPlugin`, pulling live status from `useConfigStore` and rendering each plugin's own `configPanel`.
