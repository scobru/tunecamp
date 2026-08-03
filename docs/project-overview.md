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

```text
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

## Webapp Component Catalog

Catalog of the main React components in the webapp (`webapp/src/`), organized by
directory. For the overall frontend design see [architecture-webapp.md](./architecture-webapp.md).

### Layout (`components/layout/`)

- **`MainLayout.tsx`**: Main app shell (sidebar, player bar, content area).
- **`Sidebar.tsx`**: Primary navigation between sections.

### Music Player (`components/player/`)

- **`PlayerBar.tsx`**: Global player bar (controls, progress, volume, queue).
- **`PlayerCanvas.tsx`**: Expanded view / player visualization.
- **`QueuePanel.tsx`**: Playback queue display and management.
- **`LyricsPanel.tsx`**: Synced lyrics panel.
- **`Waveform.tsx`**: Track waveform visualization.

### Artist (`components/artist/`)

- **`ArtistFediversePanel.tsx`**: Fediverse (ActivityPub) interactions panel for the artist.
- **`ArtistEventsManager.tsx`**: Create/manage an artist's live events.
- **`ArtistStripeConnectCard.tsx`**: Stripe Connect onboarding/status card for artist payouts.

### Network (`components/network/`)

- **`PeerSessionCard.tsx`**: Card for a discovered federated peer/session.
- **`PeerTrackCard.tsx`**: Card for a track found on a remote peer.

### Administration (`components/admin/`)

- **Library lists**: `AdminArtistsList`, `AdminAlbumsList`, `AdminTracksList`,
  `AdminReleasesList`, `AdminAssetsList`, `AdminUsersList`.
- **Panels**: `AdminSettingsPanel`, `IntegrationsPanel` (renders one card per
  registered frontend plugin, see [architecture-webapp.md](./architecture-webapp.md#3-frontend-plugin-system-coreplugins-plugins)),
  `StoragePanel`, `AdminFederationPanel`, `ActivityPubPanel`, `IdentityPanel`,
  `AdminMaintenancePanel`, `BackupPanel`, `AdminRadioPanel` (radio station
  controls), `AdminLabAppsPanel` (manage sandboxed Lab apps), `AdminReportsPanel`
  (release reports queue), `PeerSessionsPanel` (federated peer session
  monitoring), `SystemPanel` (live CPU/RAM/storage sparklines).
- **`SetupWizard.tsx`**: First-run instance setup flow.
- **`CurationQueue.tsx`**: Curation queue for promoting drafts to releases.

### Modals (`components/modals/`)

The dialog windows are collected here. The main ones:

- **Auth & setup**: `AuthModal`, `SetupWizardModal`.
- **Publishing & import**: `UploadTracksModal`, `AdminReleaseModal`, `AdminTrackModal`,
  `AdminArtistModal`, `AdminAssetModal`, `BatchTrackEditModal`, `ArtistMetadataPickerModal`,
  `CreatePostModal`, `ImportBandcampReleaseModal`, `AddYouTubeTrackModal`.
- **Purchase/unlock**: `CheckoutModal`, `UnlockModal`, `UnlockCodeManager`, `SubscriptionModal`.
- **Playlists & tracks**: `CreateUserPlaylistModal`, `PlaylistModal`,
  `AddTrackToUserPlaylistModal`, `TrackPickerModal`.
- **Moderation**: `ReportReleaseModal` (report a release), `AdminUserModal`.
- **Generic**: `ConfirmModal` (backs `useConfirmStore`).

### Base UI (`components/ui/`)

- **`PageHeader.tsx`**: Standard page header.
- **`ReleaseCard.tsx`**: Card for a release/album.
- **`AlbumResultCard.tsx`**: Card for an album/release search result.
- **`ThemeSwitcher.tsx`**: Theme selector (`tunecamp` / `light` / `grey` / `nordic` / `nordic-dark`).
- **`LanguageSwitcher.tsx`**: i18n locale switcher.
- **`WalletPill.tsx`**: Wallet status indicator.
- **`ChangePasswordCard.tsx`**: Password change form.
- **`SecurityQuestionsCard.tsx`**: Security questions setup/verification (account recovery).
- **`LinksEditor.tsx`**: Editable list of external links (artist profile, etc.).

### Root Components (`components/`)

- **`Comments.tsx`**: Comments section for tracks/albums.
- **`RelatedTracks.tsx`**: Related track suggestions.
- **`GenreTags.tsx`**: Genre tag display/editor for a release or track.
- **`MetadataMatchModal.tsx`**: Metadata matching from external providers.
- **`AccountMigrationCard.tsx`**: Account migration status/actions card.
- **`UpdateBanner.tsx`**: Banner shown when a newer server version is available (see `hooks/useVersionCheck.ts`).

### Frontend Plugins (`core/plugins/`, `plugins/`)

Not components in the traditional sense, but part of the UI surface: each
folder under `plugins/` registers a `FrontendPlugin` (icon, description,
status check, optional config panel) consumed by `IntegrationsPanel` /
`AdminSettingsPanel`. Current folders: `plugins/builtins/` (Telegram,
OpenRouter), `plugins/metadata/` (iTunes, MusicBrainz, Deezer, Bandcamp,
Spotify, SoundCloud), `plugins/youtube/`. See
[architecture-webapp.md](./architecture-webapp.md) for details.

### Pages (`pages/`)

Each file is generally wired to a route in `App.tsx`. Main ones: `Home`,
`Library` (merged tracks/favorites/playlists browsing — `/tracks`,
`/favorites`, `/playlists` and `/my-playlists` redirect here), `Releases`
(also serves `/albums`), `AlbumDetails`, `Artists`, `ArtistDetails`, `Store`,
`PlaylistDetails`, `MyMusic`, `Search` (also covers what used to be the
separate `ContentSearch` page), `Network`, `Social`, `Post`, `Board`, `Dig`
(crate digging), `Live` (live streaming HLS), `Radio`, `NowListening`,
`Stats`, `Profile`, `UserProfile`, `Wallet`, `Support`, `Tools`, `About`,
`Legal`, `Changelog`, `Guide`, `SharePage`, `Files` (root-admin file
browser), `Archive` (manager/root-only), `Publish`, `Admin`,
`AdminReleaseEditor`, `Lab` / `LabApp` (sandboxed browser audio tools),
`ResetPassword` / `ResetPasswordSecurity`.

Several routes are gated by wrapper components rather than logic inside the
page itself: `AdminGuard`, `EditorGuard`, `RootAdminGuard`,
`ManagerOrRootGuard` (role-based), and `ModuleGuard` (instance feature flags
`hideLive`, `hideStore`, `hideSocial`, `hideNetwork`, `hideDig`,
`hideSamples`, `hideCollab`, `hideLab` from `useSiteSettingsStore`).

### Development Notes

The components are written in **TypeScript** with **Functional Components** and **Hooks**.
Data fetching goes through TanStack Query (`hooks/queries.ts`, `lib/queryClient.ts`) layered on top of `services/api.ts`.
Styling uses standard CSS with variables for theme support.

## Related Repositories

| Repo | Description |
| ------ | ------------- |
| [tunecamp](https://github.com/scobru/tunecamp) | Main server + webapp |
| [sidecamp](https://github.com/scobru/sidecamp) | Standalone Desktop App for Peer Sharing, Soulseek, and Torrents |
| [tunecamp-4-track-recorder](https://github.com/scobru/tunecamp-4-track-recorder) | Browser-based 4-track recorder (Svelte 5 component) |
| [tunecamp-website](https://github.com/scobru/tunecamp-website) | Landing page and community directory |

## Related Documentation

- [Backend Architecture](./architecture-backend.md) (includes the data model / database schema)
- [Webapp Architecture](./architecture-webapp.md)
- [API Contracts](./api-contracts.md)
- [Development Guide](./development-guide.md)
