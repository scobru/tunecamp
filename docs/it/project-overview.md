# Panoramica del Progetto TuneCamp

TuneCamp è una piattaforma musicale federata e self-hosted che combina un server musicale personale con i protocolli social del Fediverso (ActivityPub), la scoperta di istanze basata su gossip HTTP e la monetizzazione web3 (pagamenti on-chain su rete Base).

## Obiettivi del Progetto

- **Proprietà dei Dati**: Consentire agli utenti di ospitare e controllare la propria libreria musicale.
- **Federazione**: Abilitare l'interazione tra diversi server TuneCamp tramite il protocollo ActivityPub (Fediverso).
- **Scoperta Decentralizzata**: Utilizzare un protocollo di gossip HTTP per scoprire altre istanze TuneCamp; lo scambio dei cataloghi avviene poi direttamente tramite HTTP.
- **Supporto agli Artisti**: Facilitare la pubblicazione diretta, il crowdfunding e la gestione dei diritti tramite smart contract e sistemi di sblocco (unlock code).
- **Arricchimento dei Metadati**: Integrazione con molteplici provider (MusicBrainz, Discogs, iTunes, TheAudioDB, Spotify, Bandcamp, SoundCloud) e Lyrics.ovh per copertine e testi ad alta risoluzione.

## Caratteristiche Principali

- **Radio**: una stazione HLS sempre attiva trasmessa a partire dalla libreria dell'istanza — gli amministratori possono combinare playlist personalizzate e mix dinamici per genere. Vedi [radio.md](./radio.md).
- **Accesso tramite IA (MCP)**: un server basato su Model Context Protocol che consente ai client IA (es. Claude Desktop) di effettuare ricerche nel catalogo e avviare azioni tramite un canale sicuro protetto da token. Vedi [mcp-setup-guide.md](./mcp-setup-guide.md).
- **Lab**: incorpora strumenti audio sperimentali basati su browser in iFrame sandbox isolati, senza toccare la base di codice principale. Vedi [LAB.md](./LAB.md).
- **Pannello di Sistema Amministratore**: metriche in tempo reale di CPU/RAM/archiviazione/attività in background per rilevare eventuali perdite di memoria (memory leak). Vedi [monitoring.md](./monitoring.md).
- **Estensibilità**: provider backend integrati (metadati, streaming, archiviazione, …) dietro registry per-provider. L'acquisizione (ricerca/download da sorgenti esterne) vive in Sidecamp, l'app desktop companion.

## Stack Tecnologico

### Backend

- **Linguaggio**: TypeScript
- **Runtime**: Node.js (Express)
- **Database**: SQLite (tramite `better-sqlite3`)
- **Federazione**: Fedify (ActivityPub)
- **Multimedia**: FFmpeg (per la transcodifica e la generazione delle forme d'onda)

### Webapp (Frontend)

- **Framework**: React
- **Strumento di Build**: Vite
- **Stile**: CSS (con supporto per i temi)
- **Gestione dello Stato**: Zustand
- **Scoperta**: Gossip HTTP (esclusivamente per scoprire altre istanze; nessuna distribuzione P2P dei file audio)

### Blockchain e Smart Contract

- **Linguaggio**: Solidity
- **Contratti**: Checkout, Factory, NFT per la vendita e la gestione della proprietà delle tracce.

## Struttura del Repository

Il progetto è organizzato come un monorepo composto dalle seguenti cartelle principali:

```text
tunecamp/
├── contracts/          # Smart Contract (Solidity)
│   ├── TuneCampCheckout.sol
│   ├── TuneCampFactory.sol
│   └── TuneCampNFT.sol
├── docs/               # Documentazione tecnica (Markdown, JSON)
├── src/                # Sorgenti e strumenti del backend
│   ├── server/         # Logica principale del server Express
│   │   ├── common/     # Utilità condivise ed errori
│   │   ├── core/       # Configurazione, container DI, database, caricatore plugin
│   │   ├── middleware/ # Middleware Express (Autenticazione, gestione errori, limitatore di frequenza)
│   │   ├── modules/    # Logica di business specifica del dominio (ActivityPub, Catalogo, AI, Live, Radio, Archiviazione, Worker, ...)
│   │   ├── providers/  # Implementazioni dei provider di plugin (metadati, streaming, archiviazione, ...)
│   │   ├── repositories/ # Livello di accesso ai dati (Album, Artista, Traccia)
│   │   ├── routes/     # Endpoint delle API REST (admin, api [incluso radio, mcp], auth, libreria, rete)
│   │   ├── server.ts   # Bootstrap del server Express
│   │   ├── types/      # Tipi condivisi del backend
│   │   └── utils/      # Funzioni di utilità per il server
│   ├── tools/          # Script di manutenzione, backup e migrazione
│   └── utils/          # Funzioni di utilità generale
├── webapp/             # Applicazione frontend React
│   ├── public/         # Asset statici e file WASM
│   └── src/            # Sorgenti React
│       ├── components/ # Componenti UI organizzati per dominio
│       ├── data/       # Configurazione statica del client (labApps.ts contiene solo etichette/colori delle categorie — le app sono su DB, vedi LAB.md)
│       ├── hooks/      # Hook React personalizzati
│       ├── pages/      # Componenti pagina (punti di ingresso delle rotte, inclusi Radio e Lab)
│       ├── services/   # Servizi API client e webapp
│       └── stores/     # Gestione dello stato (Zustand)
└── docker-compose.yml  # Configurazione per la distribuzione containerizzata
```

## Directory Critiche e loro Scopo

### `src/server/`

Contiene tutta la logica del server. Utilizza un'architettura a livelli:

- **Rotte (Routes)**: Definiscono l'interfaccia delle API.
- **Repository**: Gestiscono le query SQLite.
- **Moduli (Modules)**: Racchiudono funzionalità complesse come la federazione ActivityPub o la gestione dei file audio.

### `webapp/src/`

Il cuore dell'interfaccia utente.

- **Pagine (Pages)**: Directory fondamentale che mappa le rotte del frontend.
- **Componenti (Components)**: Divisi in `ui/` (base), `layout/`, `modals/` e directory tematiche (`player/`, `artist/`, `admin/`).
- **Servizi (Services)**: `api.ts` è il punto di accesso principale per comunicare con il backend.

### `contracts/`

Definisce la logica on-chain per la monetizzazione e il controllo degli accessi.

### `src/tools/`

Essenziale per la gestione della libreria musicale (ricollegamento dei percorsi, migrazioni del database, generazione di codici di sblocco).

## Punti di Ingresso

- **Backend**: `src/index.ts` — punto di ingresso: carica la configurazione e chiama `startServer` da `src/server/server.ts`.
- **Webapp**: `webapp/src/main.tsx` — punto di montaggio dell'applicazione React.
- **CLI/Strumenti**: Vari script in `src/tools/` (backup, restore, generate-codes, relink-tracks, migrazioni).

## Catalogo dei Componenti Webapp

Catalogo dei principali componenti React dell'applicazione web (`webapp/src/`), organizzati per directory. Per il design complessivo del frontend vedi [architecture-webapp.md](./architecture-webapp.md).

### Layout (`components/layout/`)

- **`MainLayout.tsx`**: Struttura principale dell'app (barra laterale, barra di riproduzione, area dei contenuti).
- **`Sidebar.tsx`**: Navigazione principale tra le varie sezioni.

### Music Player (`components/player/`)

- **`PlayerBar.tsx`**: Barra del riproduttore globale (controlli, avanzamento, volume, coda).
- **`PlayerCanvas.tsx`**: Vista estesa / visualizzazione grafica del riproduttore.
- **`QueuePanel.tsx`**: Visualizzazione e gestione della coda di riproduzione.
- **`LyricsPanel.tsx`**: Pannello per i testi sincronizzati delle canzoni.
- **`Waveform.tsx`**: Visualizzazione grafica della forma d'onda del brano.

### Artista (`components/artist/`)

- **`ArtistFediversePanel.tsx`**: Pannello dedicato alle interazioni nel Fediverso per l'artista.
- **`ArtistEventsManager.tsx`**: Creazione e gestione degli eventi live di un artista.
- **`ArtistStripeConnectCard.tsx`**: Card di onboarding/stato Stripe Connect per i pagamenti agli artisti.

### Network (`components/network/`)

- **`PeerSessionCard.tsx`**: Card per un peer/sessione federata scoperta sulla rete.
- **`PeerTrackCard.tsx`**: Card per una traccia trovata su un peer remoto.

### Amministrazione (`components/admin/`)

- **Elenchi di libreria**: `AdminArtistsList`, `AdminAlbumsList`, `AdminTracksList`, `AdminReleasesList`, `AdminAssetsList`, `AdminUsersList`.
- **Pannelli**: `AdminSettingsPanel`, `IntegrationsPanel` (mostra una card per ogni plugin frontend registrato, vedi [architecture-webapp.md](architecture-webapp.md#3-sistema-di-plugin-frontend-coreplugins-plugins)), `StoragePanel`, `AdminFederationPanel`, `ActivityPubPanel`, `IdentityPanel`, `AdminMaintenancePanel`, `BackupPanel`, `AdminRadioPanel` (controlli della stazione radio), `AdminLabAppsPanel` (gestione delle app Lab sandboxed), `AdminReportsPanel` (coda segnalazioni release), `PeerSessionsPanel` (monitoraggio sessioni peer federate), `SystemPanel` (sparkline live di CPU/RAM/storage).
- **`SetupWizard.tsx`**: Flusso di configurazione iniziale dell'istanza.
- **`CurationQueue.tsx`**: Coda di curatela per promuovere le bozze a pubblicazioni ufficiali.

### Modali (`components/modals/`)

Qui sono raccolte le finestre di dialogo dell'applicazione. Le principali:

- **Autenticazione e configurazione**: `AuthModal`, `SetupWizardModal`.
- **Pubblicazione e import**: `UploadTracksModal`, `AdminReleaseModal`, `AdminTrackModal`, `AdminArtistModal`, `AdminAssetModal`, `BatchTrackEditModal`, `ArtistMetadataPickerModal`, `CreatePostModal`, `ImportBandcampReleaseModal`, `AddYouTubeTrackModal`.
- **Acquisto/Sblocco**: `CheckoutModal`, `UnlockModal`, `UnlockCodeManager`, `SubscriptionModal`.
- **Playlist e tracce**: `CreateUserPlaylistModal`, `PlaylistModal`, `AddTrackToUserPlaylistModal`, `TrackPickerModal`.
- **Moderazione**: `ReportReleaseModal` (segnala una release), `AdminUserModal`.
- **Generico**: `ConfirmModal` (usato da `useConfirmStore`).

### Interfaccia Base (`components/ui/`)

- **`PageHeader.tsx`**: Intestazione standard per le pagine.
- **`ReleaseCard.tsx`**: Scheda descrittiva di un album o di una pubblicazione.
- **`AlbumResultCard.tsx`**: Scheda per un risultato di ricerca album/release.
- **`ThemeSwitcher.tsx`**: Selettore tema (`tunecamp` / `light` / `grey` / `nordic` / `nordic-dark`).
- **`LanguageSwitcher.tsx`**: Selettore della lingua (i18n).
- **`WalletPill.tsx`**: Indicatore dello stato del wallet Web3.
- **`ChangePasswordCard.tsx`**: Modulo per la modifica della password.
- **`SecurityQuestionsCard.tsx`**: Configurazione/verifica delle domande di sicurezza (recupero account).
- **`LinksEditor.tsx`**: Elenco modificabile di link esterni (profilo artista, ecc.).

### Componenti Root (`components/`)

- **`Comments.tsx`**: Sezione dedicata ai commenti per tracce e album.
- **`RelatedTracks.tsx`**: Suggerimenti per tracce correlate.
- **`GenreTags.tsx`**: Visualizzazione/editor dei tag di genere per una release o traccia.
- **`MetadataMatchModal.tsx`**: Corrispondenza dei metadati da provider esterni.
- **`AccountMigrationCard.tsx`**: Card di stato/azioni per la migrazione dell'account.
- **`UpdateBanner.tsx`**: Banner mostrato quando è disponibile una nuova versione del server (vedi `hooks/useVersionCheck.ts`).

### Plugin Frontend (`core/plugins/`, `plugins/`)

Non sono componenti in senso tradizionale, ma fanno parte della superficie UI: ogni cartella sotto `plugins/` registra un `FrontendPlugin` (icona, descrizione, status check, configPanel opzionale) consumato da `IntegrationsPanel` / `AdminSettingsPanel`. Cartelle attuali: `plugins/builtins/` (Telegram, OpenRouter), `plugins/metadata/` (iTunes, MusicBrainz, Deezer, Bandcamp, Spotify, SoundCloud), `plugins/youtube/`. Vedi [architecture-webapp.md](architecture-webapp.md) per i dettagli.

### Pagine (`pages/`)

Ogni file è generalmente collegato a una rotta in `App.tsx`. Pagine principali: `Home`, `Library` (navigazione unificata di tracce/preferiti/playlist — `/tracks`, `/favorites`, `/playlists` e `/my-playlists` reindirizzano qui), `Releases` (serve anche `/albums`), `AlbumDetails`, `Artists`, `ArtistDetails`, `Store`, `PlaylistDetails`, `MyMusic`, `Search` (copre anche ciò che prima era la pagina separata `ContentSearch`), `Network`, `Social`, `Post`, `Board`, `Dig` (crate digging), `Live` (streaming live HLS), `Radio`, `NowListening`, `Stats`, `Profile`, `UserProfile`, `Wallet`, `Support`, `Tools`, `About`, `Legal`, `Changelog`, `Guide`, `SharePage`, `Files` (file browser riservato al root-admin), `Archive` (riservata a manager/root), `Publish`, `Admin`, `AdminReleaseEditor`, `Lab` / `LabApp` (strumenti audio sandboxed nel browser), `ResetPassword` / `ResetPasswordSecurity`.

Diverse rotte sono protette da componenti wrapper piuttosto che da logica interna alla pagina: `AdminGuard`, `EditorGuard`, `RootAdminGuard`, `ManagerOrRootGuard` (basati sul ruolo) e `ModuleGuard` (feature flag dell'istanza `hideLive`, `hideStore`, `hideSocial`, `hideNetwork`, `hideDig`, `hideSamples`, `hideCollab`, `hideLab` da `useSiteSettingsStore`).

### Note sullo Sviluppo

I componenti sono scritti in **TypeScript** utilizzando **Componenti Funzionali** e **HOOKS**.
Il data fetching passa attraverso TanStack Query (`hooks/queries.ts`, `lib/queryClient.ts`) sopra a `services/api.ts`.
Lo stile grafico fa uso di fogli di stile CSS standard con variabili per il tema.

## Repository Correlati

| Repo | Descrizione |
| ------ | ------------- |
| [tunecamp](https://github.com/scobru/tunecamp) | Server principale + webapp |
| [sidecamp](https://github.com/scobru/sidecamp) | App Desktop autonoma per Condivisione Peer, Soulseek e Torrents |
| [tunecamp-4-track-recorder](https://github.com/scobru/tunecamp-4-track-recorder) | Registratore a 4 tracce basato su browser (componente Svelte 5) |
| [tunecamp-website](https://github.com/scobru/tunecamp-website) | Landing page e directory della community |

## Documentazione Correlata

- [Architettura Backend](./architecture-backend.md) (include il modello dati / schema del database)
- [Architettura Webapp](./architecture-webapp.md)
- [Contratti API](./api-contracts.md)
- [Guida allo Sviluppo](./development-guide.md)
