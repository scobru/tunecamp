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
- **`ArtistEventsManager.tsx`**: Creazione e gestione degli eventi live di un artista.
- **`ArtistStripeConnectCard.tsx`**: Card di onboarding/stato Stripe Connect per i pagamenti agli artisti.

## Network (`components/network/`)

- **`PeerSessionCard.tsx`**: Card per un peer/sessione federata scoperta sulla rete.
- **`PeerTrackCard.tsx`**: Card per una traccia trovata su un peer remoto.

## Amministrazione (`components/admin/`)

- **Elenchi di libreria**: `AdminArtistsList`, `AdminAlbumsList`, `AdminTracksList`, `AdminReleasesList`, `AdminAssetsList`, `AdminUsersList`.
- **Pannelli**: `AdminSettingsPanel`, `IntegrationsPanel` (mostra una card per ogni plugin frontend registrato, vedi [architecture-webapp.md](architecture-webapp.md#3-sistema-di-plugin-frontend-coreplugins-plugins)), `StoragePanel`, `AdminFederationPanel`, `ActivityPubPanel`, `IdentityPanel`, `AdminMaintenancePanel`, `BackupPanel`, `AdminRadioPanel` (controlli della stazione radio), `AdminLabAppsPanel` (gestione delle app Lab sandboxed), `AdminReportsPanel` (coda segnalazioni release), `PeerSessionsPanel` (monitoraggio sessioni peer federate), `SystemPanel` (sparkline live di CPU/RAM/storage).
- **`SetupWizard.tsx`**: Flusso di configurazione iniziale dell'istanza.
- **`CurationQueue.tsx`**: Coda di curatela per promuovere le bozze a pubblicazioni ufficiali.

## Modali (`components/modals/`)

Qui sono raccolte le finestre di dialogo dell'applicazione. Le principali:
- **Autenticazione e configurazione**: `AuthModal`, `SetupWizardModal`.
- **Pubblicazione e import**: `UploadTracksModal`, `AdminReleaseModal`, `AdminTrackModal`, `AdminArtistModal`, `AdminAssetModal`, `BatchTrackEditModal`, `ArtistMetadataPickerModal`, `CreatePostModal`, `ImportBandcampReleaseModal`, `AddYouTubeTrackModal`.
- **Acquisto/Sblocco**: `CheckoutModal`, `UnlockModal`, `UnlockCodeManager`, `SubscriptionModal`.
- **Playlist e tracce**: `CreateUserPlaylistModal`, `PlaylistModal`, `AddTrackToUserPlaylistModal`, `TrackPickerModal`.
- **Moderazione**: `ReportReleaseModal` (segnala una release), `AdminUserModal`.
- **Generico**: `ConfirmModal` (usato da `useConfirmStore`).

## Interfaccia Base (`components/ui/`)

- **`PageHeader.tsx`**: Intestazione standard per le pagine.
- **`ReleaseCard.tsx`**: Scheda descrittiva di un album o di una pubblicazione.
- **`AlbumResultCard.tsx`**: Scheda per un risultato di ricerca album/release.
- **`ThemeSwitcher.tsx`**: Selettore tema (`tunecamp` / `light` / `grey` / `nordic` / `nordic-dark`).
- **`LanguageSwitcher.tsx`**: Selettore della lingua (i18n).
- **`WalletPill.tsx`**: Indicatore dello stato del wallet Web3.
- **`ChangePasswordCard.tsx`**: Modulo per la modifica della password.
- **`SecurityQuestionsCard.tsx`**: Configurazione/verifica delle domande di sicurezza (recupero account).
- **`LinksEditor.tsx`**: Elenco modificabile di link esterni (profilo artista, ecc.).

## Componenti Root (`components/`)

- **`Comments.tsx`**: Sezione dedicata ai commenti per tracce e album.
- **`RelatedTracks.tsx`**: Suggerimenti per tracce correlate.
- **`GenreTags.tsx`**: Visualizzazione/editor dei tag di genere per una release o traccia.
- **`MetadataMatchModal.tsx`**: Corrispondenza dei metadati da provider esterni.
- **`AccountMigrationCard.tsx`**: Card di stato/azioni per la migrazione dell'account.
- **`UpdateBanner.tsx`**: Banner mostrato quando è disponibile una nuova versione del server (vedi `hooks/useVersionCheck.ts`).

## Plugin Frontend (`core/plugins/`, `plugins/`)

Non sono componenti in senso tradizionale, ma fanno parte della superficie UI: ogni cartella sotto `plugins/` registra un `FrontendPlugin` (icona, descrizione, status check, configPanel opzionale) consumato da `IntegrationsPanel` / `AdminSettingsPanel`. Cartelle attuali: `plugins/builtins/` (Telegram, OpenRouter), `plugins/metadata/` (iTunes, MusicBrainz, Deezer, Bandcamp, Spotify, SoundCloud), `plugins/youtube/`. Vedi [architecture-webapp.md](architecture-webapp.md) per i dettagli.

## Pagine (`pages/`)

Ogni file è generalmente collegato a una rotta in `App.tsx`. Pagine principali: `Home`, `Library` (navigazione unificata di tracce/preferiti/playlist — `/tracks`, `/favorites`, `/playlists` e `/my-playlists` reindirizzano qui), `Releases` (serve anche `/albums`), `AlbumDetails`, `Artists`, `ArtistDetails`, `Store`, `PlaylistDetails`, `MyMusic`, `Search` (copre anche ciò che prima era la pagina separata `ContentSearch`), `Network`, `Social`, `Post`, `Board`, `Dig` (crate digging), `Live` (streaming live HLS), `Radio`, `NowListening`, `Stats`, `Profile`, `UserProfile`, `Wallet`, `Support`, `Tools`, `About`, `Legal`, `Changelog`, `Guide`, `SharePage`, `Files` (file browser riservato al root-admin), `Archive` (riservata a manager/root), `Publish`, `Admin`, `AdminReleaseEditor`, `Lab` / `LabApp` (strumenti audio sandboxed nel browser), `ResetPassword` / `ResetPasswordSecurity`.

Diverse rotte sono protette da componenti wrapper piuttosto che da logica interna alla pagina: `AdminGuard`, `EditorGuard`, `RootAdminGuard`, `ManagerOrRootGuard` (basati sul ruolo) e `ModuleGuard` (feature flag dell'istanza `hideLive`, `hideStore`, `hideSocial`, `hideNetwork`, `hideDig`, `hideDj` da `useSiteSettingsStore`).

## Note sullo Sviluppo

I componenti sono scritti in **TypeScript** utilizzando **Componenti Funzionali** e **Hooks**.
Il data fetching passa attraverso TanStack Query (`hooks/queries.ts`, `lib/queryClient.ts`) sopra a `services/api.ts`.
Lo stile grafico fa uso di fogli di stile CSS standard con variabili per il tema.
