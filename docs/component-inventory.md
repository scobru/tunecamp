# Inventario Componenti UI

Catalogo dei principali componenti React della webapp (`webapp/src/`), organizzati per
directory. Per la struttura generale vedi [architecture-webapp.md](architecture-webapp.md).

## Layout (`components/layout/`)

- **`MainLayout.tsx`**: Struttura principale dell'app (sidebar, player bar, area contenuti).
- **`Sidebar.tsx`**: Navigazione principale tra le sezioni.

## Player Musicale (`components/player/`)

- **`PlayerBar.tsx`**: Barra del player globale (controlli, progresso, volume, coda).
- **`PlayerCanvas.tsx`**: Vista espansa / visualizzazione del player.
- **`QueuePanel.tsx`**: Visualizzazione e gestione della coda di riproduzione.
- **`LyricsPanel.tsx`**: Pannello dei testi sincronizzati.
- **`Waveform.tsx`**: Visualizzazione della forma d'onda della traccia.

## Artista (`components/artist/`)

- **`ArtistFediversePanel.tsx`**: Pannello delle interazioni Fediverso per l'artista.

## Amministrazione (`components/admin/`)

- **Liste libreria**: `AdminArtistsList`, `AdminAlbumsList`, `AdminTracksList`,
  `AdminReleasesList`, `AdminAssetsList`, `AdminUsersList`.
- **Pannelli**: `AdminSettingsPanel`, `IntegrationsPanel`, `StoragePanel`,
  `AdminFederationPanel`, `ActivityPubPanel`, `IdentityPanel`, `AdminMaintenancePanel`,
  `BackupPanel`.
- **`CurationQueue.tsx`**: Coda di curation per promuovere i draft a release.

## Modali (`components/modals/`)

Le finestre di dialogo sono raccolte qui. Le principali:
- **Auth & setup**: `AuthModal`, `SetupWizardModal`, `ChangePasswordCard` (in `ui/`), `ArtistKeysModal`.
- **Pubblicazione**: `UploadTracksModal`, `AdminReleaseModal`, `AdminTrackModal`,
  `AdminArtistModal`, `AdminAssetModal`, `BatchTrackEditModal`, `ArtistMetadataPickerModal`,
  `CreatePostModal`.
- **Acquisto/sblocco**: `CheckoutModal`, `UnlockModal`, `UnlockCodeManager`, `SubscriptionModal`.
- **Playlist & tracce**: `CreateUserPlaylistModal`, `PlaylistModal`,
  `AddTrackToUserPlaylistModal`, `TrackPickerModal`, `AddBandcampTrackModal`, `AddYouTubeTrackModal`.
- **`CommandPalette.tsx`**: Palette comandi rapida (ricerca/azioni).

## UI Base (`components/ui/`)

- **`PageHeader.tsx`**: Intestazione standard delle pagine.
- **`ReleaseCard.tsx`**: Card di una release/album.
- **`ThemeSwitcher.tsx`**: Selettore tema chiaro/scuro.
- **`WalletPill.tsx`**: Indicatore dello stato del wallet.
- **`ChangePasswordCard.tsx`**: Form di cambio password.

## Componenti radice (`components/`)

- **`Comments.tsx`**: Sezione commenti per tracce/album.
- **`RelatedTracks.tsx`**: Suggerimenti di tracce correlate.
- **`MetadataMatchModal.tsx`**: Abbinamento metadati da provider esterni.

## Pagine (`pages/`)

Ogni file è una route. Principali: `Home`, `Library`, `Artists`, `ArtistDetails`,
`AlbumDetails`, `Tracks`, `Releases`, `Store`, `Playlists`, `PlaylistDetails`,
`MyPlaylistDetails`, `MyMusic`, `Favorites`, `Search`, `ContentSearch`, `Network`,
`Social`, `Post`, `Board`, `Dig` (crate digging), `Live` (live streaming HLS),
`Stats`, `Profile`, `Wallet`, `Support`, `About`, `SharePage`, `Files`, `Tools`,
`Publish`, `Admin`, `AdminReleaseEditor`.

## Note sullo Sviluppo

I componenti sono scritti in **TypeScript** con **Functional Components** e **Hooks**.
Lo styling usa CSS standard con variabili per il tema chiaro/scuro.
