# UI Component Inventory

Catalog of the main React components in the webapp (`webapp/src/`), organized by
directory. For the overall structure see [architecture-webapp.md](architecture-webapp.md).

## Layout (`components/layout/`)

- **`MainLayout.tsx`**: Main app structure (sidebar, player bar, content area).
- **`Sidebar.tsx`**: Primary navigation between sections.

## Music Player (`components/player/`)

- **`PlayerBar.tsx`**: Global player bar (controls, progress, volume, queue).
- **`PlayerCanvas.tsx`**: Expanded view / player visualization.
- **`QueuePanel.tsx`**: Playback queue display and management.
- **`LyricsPanel.tsx`**: Synced lyrics panel.
- **`Waveform.tsx`**: Track waveform visualization.

## Artist (`components/artist/`)

- **`ArtistFediversePanel.tsx`**: Fediverse interactions panel for the artist.

## Administration (`components/admin/`)

- **Library lists**: `AdminArtistsList`, `AdminAlbumsList`, `AdminTracksList`,
  `AdminReleasesList`, `AdminAssetsList`, `AdminUsersList`.
- **Panels**: `AdminSettingsPanel`, `IntegrationsPanel`, `StoragePanel`,
  `AdminFederationPanel`, `ActivityPubPanel`, `IdentityPanel`, `AdminMaintenancePanel`,
  `BackupPanel`.
- **`CurationQueue.tsx`**: Curation queue for promoting drafts to releases.

## Modals (`components/modals/`)

The dialog windows are collected here. The main ones:
- **Auth & setup**: `AuthModal`, `SetupWizardModal`, `ChangePasswordCard` (in `ui/`), `ArtistKeysModal`.
- **Publishing**: `UploadTracksModal`, `AdminReleaseModal`, `AdminTrackModal`,
  `AdminArtistModal`, `AdminAssetModal`, `BatchTrackEditModal`, `ArtistMetadataPickerModal`,
  `CreatePostModal`.
- **Purchase/unlock**: `CheckoutModal`, `UnlockModal`, `UnlockCodeManager`, `SubscriptionModal`.
- **Playlists & tracks**: `CreateUserPlaylistModal`, `PlaylistModal`,
  `AddTrackToUserPlaylistModal`, `TrackPickerModal`, `AddBandcampTrackModal`, `AddYouTubeTrackModal`.

## Base UI (`components/ui/`)

- **`PageHeader.tsx`**: Standard page header.
- **`ReleaseCard.tsx`**: Card for a release/album.
- **`ThemeSwitcher.tsx`**: Light/dark theme selector.
- **`WalletPill.tsx`**: Wallet status indicator.
- **`ChangePasswordCard.tsx`**: Password change form.

## Root Components (`components/`)

- **`Comments.tsx`**: Comments section for tracks/albums.
- **`RelatedTracks.tsx`**: Related track suggestions.
- **`MetadataMatchModal.tsx`**: Metadata matching from external providers.

## Pages (`pages/`)

Each file is a route. Main ones: `Home`, `Library`, `Artists`, `ArtistDetails`,
`AlbumDetails`, `Tracks`, `Releases`, `Store`, `Playlists`, `PlaylistDetails`,
`MyPlaylistDetails`, `MyMusic`, `Favorites`, `Search`, `ContentSearch`, `Network`,
`Social`, `Post`, `Board`, `Dig` (crate digging), `Live` (live streaming HLS),
`Stats`, `Profile`, `Wallet`, `Support`, `About`, `SharePage`, `Files`, `Tools`,
`Publish`, `Admin`, `AdminReleaseEditor`.

## Development Notes

The components are written in **TypeScript** with **Functional Components** and **Hooks**.
Styling uses standard CSS with variables for the light/dark theme.
