# UI Component Inventory

Catalog of the main React components in the webapp (`webapp/src/`), organized by
directory. For the overall structure see [architecture-webapp.md](architecture-webapp.md).

## Layout (`components/layout/`)

- **`MainLayout.tsx`**: Main app shell (sidebar, player bar, content area).
- **`Sidebar.tsx`**: Primary navigation between sections.

## Music Player (`components/player/`)

- **`PlayerBar.tsx`**: Global player bar (controls, progress, volume, queue).
- **`PlayerCanvas.tsx`**: Expanded view / player visualization.
- **`QueuePanel.tsx`**: Playback queue display and management.
- **`LyricsPanel.tsx`**: Synced lyrics panel.
- **`Waveform.tsx`**: Track waveform visualization.

## Artist (`components/artist/`)

- **`ArtistFediversePanel.tsx`**: Fediverse (ActivityPub) interactions panel for the artist.
- **`ArtistEventsManager.tsx`**: Create/manage an artist's live events.
- **`ArtistStripeConnectCard.tsx`**: Stripe Connect onboarding/status card for artist payouts.

## Network (`components/network/`)

- **`PeerSessionCard.tsx`**: Card for a discovered federated peer/session.
- **`PeerTrackCard.tsx`**: Card for a track found on a remote peer.

## Administration (`components/admin/`)

- **Library lists**: `AdminArtistsList`, `AdminAlbumsList`, `AdminTracksList`,
  `AdminReleasesList`, `AdminAssetsList`, `AdminUsersList`.
- **Panels**: `AdminSettingsPanel`, `IntegrationsPanel` (renders one card per
  registered frontend plugin, see [architecture-webapp.md](architecture-webapp.md#3-frontend-plugin-system-coreplugins-plugins)),
  `StoragePanel`, `AdminFederationPanel`, `ActivityPubPanel`, `IdentityPanel`,
  `AdminMaintenancePanel`, `BackupPanel`, `AdminRadioPanel` (radio station
  controls), `AdminLabAppsPanel` (manage sandboxed Lab apps), `AdminReportsPanel`
  (release reports queue), `PeerSessionsPanel` (federated peer session
  monitoring), `SystemPanel` (live CPU/RAM/storage sparklines).
- **`SetupWizard.tsx`**: First-run instance setup flow.
- **`CurationQueue.tsx`**: Curation queue for promoting drafts to releases.

## Modals (`components/modals/`)

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

## Base UI (`components/ui/`)

- **`PageHeader.tsx`**: Standard page header.
- **`ReleaseCard.tsx`**: Card for a release/album.
- **`AlbumResultCard.tsx`**: Card for an album/release search result.
- **`ThemeSwitcher.tsx`**: Theme selector (`tunecamp` / `light` / `grey` / `nordic` / `nordic-dark`).
- **`LanguageSwitcher.tsx`**: i18n locale switcher.
- **`WalletPill.tsx`**: Wallet status indicator.
- **`ChangePasswordCard.tsx`**: Password change form.
- **`SecurityQuestionsCard.tsx`**: Security questions setup/verification (account recovery).
- **`LinksEditor.tsx`**: Editable list of external links (artist profile, etc.).

## Root Components (`components/`)

- **`Comments.tsx`**: Comments section for tracks/albums.
- **`RelatedTracks.tsx`**: Related track suggestions.
- **`GenreTags.tsx`**: Genre tag display/editor for a release or track.
- **`MetadataMatchModal.tsx`**: Metadata matching from external providers.
- **`AccountMigrationCard.tsx`**: Account migration status/actions card.
- **`UpdateBanner.tsx`**: Banner shown when a newer server version is available (see `hooks/useVersionCheck.ts`).

## Frontend Plugins (`core/plugins/`, `plugins/`)

Not components in the traditional sense, but part of the UI surface: each
folder under `plugins/` registers a `FrontendPlugin` (icon, description,
status check, optional config panel) consumed by `IntegrationsPanel` /
`AdminSettingsPanel`. Current folders: `plugins/builtins/` (Telegram,
OpenRouter), `plugins/metadata/` (iTunes, MusicBrainz, Deezer, Bandcamp,
Spotify, SoundCloud), `plugins/youtube/`. See
[architecture-webapp.md](architecture-webapp.md) for details.

## Pages (`pages/`)

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
`hideLive`, `hideStore`, `hideSocial`, `hideNetwork`, `hideDig`, `hideDj`
from `useSiteSettingsStore`).

## Development Notes

The components are written in **TypeScript** with **Functional Components** and **Hooks**.
Data fetching goes through TanStack Query (`hooks/queries.ts`, `lib/queryClient.ts`) layered on top of `services/api.ts`.
Styling uses standard CSS with variables for theme support.
