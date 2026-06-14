# Architettura Webapp

La webapp di TuneCamp è una Single Page Application (SPA) moderna costruita con React e Vite, ottimizzata per l'esperienza utente musicale e l'interazione decentralizzata.

## Stack Tecnologico

- **Framework UI**: React (TypeScript)
- **Build Tool**: Vite
- **Gestione Stato**: Zustand
- **Routing**: React Router
- **Discovery istanze**: Zen.js (WebAssembly/JS) — solo per scoprire altre istanze TuneCamp
- **Wallet**: Ethers.js v6 (provider iniettato EIP-1193, es. MetaMask)

## Organizzazione del Codice

### 1. Componenti (`components/`)
Organizzati per dominio funzionale:
- **`player/`**: Il lettore musicale globale, gestisce lo stato di riproduzione, la coda e la visualizzazione delle waveform.
- **`artist/`**, **`auth/`**, **`admin/`**: Componenti specifici per le diverse aree dell'applicazione.
- **`ui/`**: Componenti atomici e riutilizzabili (pulsanti, input, caricatori).

### 2. Pagine (`pages/`)
Ogni file rappresenta una rotta principale:
- `Home.tsx`: Dashboard principale.
- `Albums.tsx` / `Artists.tsx`: Esplorazione della libreria.
- `Admin.tsx`: Pannello di gestione per l'amministratore del server.
- `Network.tsx`: Visualizzazione della rete federata.

### 3. Store di Stato (`stores/`)
Utilizziamo Zustand per uno stato leggero e performante:
- `usePlayerStore`: Stato della riproduzione corrente (coda, traccia attiva).
- `useAuthStore`: Stato dell'utente loggato e del token JWT.
- `useWalletStore`: Stato del wallet connesso (account, rete).
- `useConfigStore`: Configurazione dell'istanza (branding, feature flag).
- `useUIStore`: Stato dell'interfaccia (modali, pannelli).
- `useDigStore`: Stato della modalità "Dig" (crate digging).

### 4. Servizi (`services/`)
- `api.ts`: Wrapper per le chiamate REST al backend TuneCamp.
- `wallet.ts`: Gestione del wallet del browser (connessione, firma, transazioni on-chain via ethers).
- `zen.ts`: Interfaccia con la rete Zen, usata **solo per la discovery delle istanze** della community (pagina Network).

## Integrazione Zen.js

La webapp integra `zen.js` esclusivamente per leggere il registry decentralizzato delle istanze TuneCamp (signaling/discovery): i cataloghi vengono poi recuperati direttamente via HTTP. Carica i file WebAssembly (`pen.wasm`, `crypto.wasm`) all'avvio per le operazioni crittografiche. **I contenuti audio non transitano su Zen**: lo streaming avviene sempre dal backend (o dai provider di fallback configurati).

## Flusso di Navigazione e Riproduzione

1. **Navigazione**: L'utente clicca su un album -> `AlbumDetails.tsx` richiede dati a `api.ts` -> Dati visualizzati tramite componenti `artist/`.
2. **Riproduzione**: Clic su "Play" -> Traccia aggiunta a `usePlayerStore` -> Componente `player/` avvia lo streaming dal backend (`/api/tracks/:id/stream`), con eventuale fallback ai provider esterni se il file locale manca.
3. **Interazione Web3**: Connessione wallet -> `wallet.ts` gestisce l'account -> Possibilità di acquistare release o sbloccare contenuti.
