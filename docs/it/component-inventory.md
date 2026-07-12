# Inventario dei Componenti UI

Catalogo dei principali componenti React dell'applicazione web (`webapp/src/`), organizzati per directory. Per la struttura generale, vedi [architecture-webapp.md](./architecture-webapp.md).

## Layout (`components/layout/`)

- **`MainLayout.tsx`**: Struttura principale dell'app (barra laterale, barra di riproduzione, area dei contenuti).
- **`Sidebar.tsx`**: Navigazione principale tra le varie sezioni.

## Music Player (`components/player/`)

- **`PlayerBar.tsx`**: Barra del riproduttore globale (controlli, avanzamento, volume, coda).
- **`PlayerCanvas.tsx`**: Vista estesa / visualizzazione grafica del riproduttore.
- **`QueuePanel.tsx`**: Visualizzazione e gestione della coda di riproduzione.
- **`LyricsPanel.tsx`**: Pannello per i testi sincronizzati delle canzoni.
- **`Waveform.tsx`**: Visualizzazione grafica della forma d'onda del brano.

## Artista (`components/artist/`)

- **`ArtistFediversePanel.tsx`**: Pannello dedicato alle interazioni nel Fediverso per l'artista.

## Amministrazione (`components/admin/`)

- **Elenchi di libreria**: `AdminArtistsList`, `AdminAlbumsList`, `AdminTracksList`, `AdminReleasesList`, `AdminAssetsList`, `AdminUsersList`.
- **Pannelli**: `AdminSettingsPanel`, `IntegrationsPanel`, `StoragePanel`, `AdminFederationPanel`, `ActivityPubPanel`, `IdentityPanel`, `AdminMaintenancePanel`, `BackupPanel`.
- **`CurationQueue.tsx`**: Coda di curatela per promuovere le bozze a pubblicazioni ufficiali.

## Modali (`components/modals/`)

Qui sono raccolte le finestre di dialogo dell'applicazione. Le principali:
- **Autenticazione e configurazione**: `AuthModal`, `SetupWizardModal`, `ChangePasswordCard` (in `ui/`), `ArtistKeysModal`.
- **Pubblicazione**: `UploadTracksModal`, `AdminReleaseModal`, `AdminTrackModal`, `AdminArtistModal`, `AdminAssetModal`, `BatchTrackEditModal`, `ArtistMetadataPickerModal`, `CreatePostModal`.
- **Acquisto/Sblocco**: `CheckoutModal`, `UnlockModal`, `UnlockCodeManager`, `SubscriptionModal`.
- **Playlist e tracce**: `CreateUserPlaylistModal`, `PlaylistModal`, `AddTrackToUserPlaylistModal`, `TrackPickerModal`, `AddBandcampTrackModal`, `AddYouTubeTrackModal`.

## Interfaccia Base (`components/ui/`)

- **`PageHeader.tsx`**: Intestazione standard per le pagine.
- **`ReleaseCard.tsx`**: Scheda descrittiva di un album o di una pubblicazione.
- **`ThemeSwitcher.tsx`**: Selettore per il tema chiaro/scuro.
- **`WalletPill.tsx`**: Indicatore dello stato del wallet Web3.
- **`ChangePasswordCard.tsx`**: Modulo per la modifica della password.

## Componenti Root (`components/`)

- **`Comments.tsx`**: Sezione dedicata ai commenti per tracce e album.
- **`RelatedTracks.tsx`**: Suggerimenti per tracce correlate.
- **`MetadataMatchModal.tsx`**: Corrispondenza dei metadati da provider esterni.

## Pagine (`pages/`)

Ogni file rappresenta una rotta. Pagine principali: `Home`, `Library`, `Artists`, `ArtistDetails`, `AlbumDetails`, `Tracks`, `Releases`, `Store`, `Playlists`, `PlaylistDetails`, `MyPlaylistDetails`, `MyMusic`, `Favorites`, `Search`, `ContentSearch`, `Network`, `Social`, `Post`, `Board`, `Dig` (crate digging), `Live` (streaming live HLS), `Stats`, `Profile`, `Wallet`, `Support`, `About`, `SharePage`, `Files`, `Tools`, `Publish`, `Admin`, `AdminReleaseEditor`.

## Note sullo Sviluppo

I componenti sono scritti in **TypeScript** utilizzando **Componenti Funzionali** e **Hooks**.
Lo stile grafico fa uso di fogli di stile CSS standard con variabili per il tema chiaro/scuro.
