# Architettura Webapp

La webapp di TuneCamp è una single-page application (SPA) costruita con React e Vite, ottimizzata per l'esperienza d'ascolto musicale e l'interazione decentralizzata/federata.

## Stack Tecnologico

- **Framework UI**: React (TypeScript)
- **Strumento di Build**: Vite
- **Data fetching/caching**: TanStack Query (`@tanstack/react-query`), vedi `lib/queryClient.ts` e `hooks/queries.ts` per le chiavi di cache condivise
- **Stato client**: Zustand
- **Routing**: React Router (rotte dichiarate in `App.tsx`, protette da componenti wrapper per ruolo/modulo)
- **Instance Discovery**: API REST Gossip su HTTP
- **Wallet**: Ethers.js v6 (injected provider EIP-1193, es. MetaMask)
- **i18n**: `i18next` / `react-i18next`, file di locale in `i18n/locales/{en,it}/`

## Organizzazione del Codice (`webapp/src/`)

### 1. Componenti (`components/`)
Organizzati per dominio funzionale:
- **`player/`**: Player globale — `PlayerBar`, `PlayerCanvas`, `QueuePanel`, `LyricsPanel`, `Waveform`.
- **`admin/`**: Pannelli di amministrazione e liste di gestione libreria (utenti, release, tracce, federazione, storage, backup, radio, app Lab, segnalazioni, salute del sistema, …).
- **`artist/`**: Strumenti per gli artisti — pannello Fediverse, gestione eventi, card Stripe Connect.
- **`network/`**: Card per la rete federata (sessioni peer, tracce peer).
- **`layout/`**: `MainLayout` (shell) e `Sidebar` (navigazione principale).
- **`modals/`**: Tutte le finestre di dialogo (auth, setup, pubblicazione, acquisto/sblocco, playlist, import, segnalazioni, …).
- **`ui/`**: Elementi riutilizzabili di piccole dimensioni (card, header, switcher, pill, card di form). Non esiste una cartella `auth/` separata — le finestre di autenticazione vivono in `modals/`.
- Alcuni componenti risiedono direttamente in `components/` (senza sottocartella): `Comments.tsx`, `RelatedTracks.tsx`, `GenreTags.tsx`, `MetadataMatchModal.tsx`, `AccountMigrationCard.tsx`, `UpdateBanner.tsx`.

Per il catalogo completo, file per file, vedi [component-inventory.md](./component-inventory.md).

### 2. Pagine (`pages/`)
Ogni file è generalmente collegato a una rotta in `App.tsx`. Alcuni percorsi legacy (`/tracks`, `/favorites`, `/playlists`, `/my-playlists`) ora reindirizzano alla pagina unificata `Library` invece di renderizzare un componente dedicato — la vecchia pagina separata `ContentSearch` è stata rimossa e assorbita in `Search.tsx`. Le rotte sono avvolte da componenti guard (`AdminGuard`, `EditorGuard`, `RootAdminGuard`, `ManagerOrRootGuard`, `ModuleGuard`) che limitano l'accesso in base al ruolo o a un feature flag dell'istanza (`hideLive`, `hideStore`, `hideSocial`, `hideNetwork`, `hideDig`, `hideDj`).

### 3. Sistema di Plugin Frontend (`core/plugins/`, `plugins/`)
Le integrazioni opzionali (Telegram, OpenRouter/AI, provider di metadati, YouTube/yt-dlp, …) si registrano come oggetti `FrontendPlugin` presso un piccolo `PluginRegistry` (`core/plugins/registry.tsx`) invece di essere cablate a mano nell'UI di amministrazione:
- `core/plugins/index.ts` inizializza il registry, poi usa `import.meta.glob` per caricare eagerly ogni cartella `plugins/*/index.{ts,tsx}`. Una build white-label può rimuovere un provider semplicemente eliminando la sua cartella — nessun altro file va modificato.
- Ogni plugin può dichiarare un'icona, una descrizione, uno `statusCheck` (mappa lo stato/salute del backend su online/offline), un `configPanel` (renderizzato dentro `AdminSettingsPanel`/`IntegrationsPanel`) e una `customAction` (es. "Upload Cookies" per YouTube).
- Cartelle plugin attuali: `plugins/builtins/` (Telegram, OpenRouter), `plugins/metadata/` (iTunes, MusicBrainz, Deezer, Bandcamp, Spotify, SoundCloud), `plugins/youtube/`.
- Questo registry è solo di presentazione (badge di stato, form di configurazione nell'UI admin); non esegue esso stesso le ricerche/i download — quella logica vive nel backend.

### 4. State Store (`stores/`)
Store Zustand, uno per ciascuna area:
- `useAuthStore`: utente connesso, stato sessione/JWT, ruolo.
- `useConfigStore`: salute delle integrazioni backend (Soulseek, iTunes, MusicBrainz, Discogs, Telegram, OpenRouter, Stripe, MoonPay, Google Drive, YouTube, Spotify, …) usata per i badge di stato dei plugin.
- `useSiteSettingsStore`: impostazioni pubbliche dell'istanza e flag di visibilità per modulo (`hideLive`, `hideStore`, `hideSocial`, `hideNetwork`, `hideDig`, `hideDj`) consumati da `ModuleGuard`.
- `usePlayerStore`: stato di riproduzione — traccia corrente, coda, coda originale/shuffle, volume, avanzamento (persistito).
- `useNowPlayingStore`: preferenza opt-in "now listening" dell'utente, sincronizzata con l'heartbeat del player.
- `useWalletStore`: wallet connesso (provider, signer, indirizzo, saldi ETH/USDC).
- `useUIStore`: tema e stato apertura/collasso sidebar (persistito).
- `useConfirmStore`: dialogo di conferma basato su promise (sostituisce `window.confirm`).
- `useDigStore`: stato del flusso "Dig" di crate digging / scoperta musicale (ricerca, strategia, risultati, sessione).

### 5. Data fetching (`hooks/`, `lib/`)
- `lib/queryClient.ts` + `hooks/queries.ts`: client TanStack Query condiviso e costanti per le chiavi di query delle liste di catalogo, in modo che letture e invalidazioni della cache dopo le mutazioni restino allineate.
- `hooks/useBoard.ts`, `hooks/useNowPlayingHeartbeat.ts`, `hooks/useOwnedNFTs.ts`, `hooks/usePurchases.ts`, `hooks/useVersionCheck.ts`: hook di dati specifici per feature.

### 6. Servizi (`services/`)
- `api.ts`: singolo oggetto `API` che avvolge tutte le chiamate REST al backend di TuneCamp (auth, catalogo, upload, pagamenti, admin, radio, dig, …).
- `wallet.ts`: gestione del wallet nel browser (connessione, firma dei messaggi, transazioni on-chain tramite ethers).

### 7. Utility (`utils/`)
Formattazione, sanitizzazione, rendering markdown, controlli sui permessi (`permissions.ts`, `roles.ts`), helper per URL, tema/font e fallback immagini usati in tutti i componenti.

## Flusso di Navigazione e Riproduzione

1. **Navigazione**: l'utente clicca su una card album → `AlbumDetails.tsx` recupera i dati tramite `api.ts` (attraverso un hook TanStack Query) → i dati vengono visualizzati con i componenti `artist/` e `ui/`.
2. **Riproduzione**: clic su "Play" → la traccia viene aggiunta alla coda di `usePlayerStore` → `player/PlayerBar.tsx` avvia lo streaming dal backend (`/api/tracks/:id/stream`), con fallback all'URL della sorgente esterna se non esiste un file locale.
3. **Now Listening**: mentre una traccia è in riproduzione e l'utente ha attivato l'opt-in (`useNowPlayingStore`), `hooks/useNowPlayingHeartbeat.ts` segnala periodicamente la traccia corrente all'endpoint di presenza.
4. **Interazione Web3**: connessione del wallet → `wallet.ts`/`useWalletStore` gestiscono l'account → possibilità di acquistare release o sbloccare contenuti gated on-chain.
5. **Integrazioni admin**: `AdminSettingsPanel`/`IntegrationsPanel` renderizzano una card per ogni `FrontendPlugin` registrato, leggendo lo stato live da `useConfigStore` e mostrando il `configPanel` di ciascun plugin.
