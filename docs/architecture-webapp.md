# Architettura Webapp

La webapp di TuneCamp è una Single Page Application (SPA) moderna costruita con React e Vite, ottimizzata per l'esperienza utente musicale e l'interazione decentralizzata.

## Stack Tecnologico

- **Framework UI**: React (TypeScript)
- **Build Tool**: Vite
- **Gestione Stato**: Zustand
- **Routing**: React Router
- **Integrazione P2P**: Zen.js (WebAssembly/JS)
- **Wallet**: Ethers.js / Wagmi (per interazioni blockchain)

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
- `usePlayerStore`: Stato della riproduzione corrente.
- `useAuthStore`: Stato dell'utente loggato.
- `useZenStore`: Stato della connessione alla rete P2P.

### 4. Servizi (`services/`)
- `api.ts`: Wrapper per le chiamate REST al backend TuneCamp.
- `zen.ts`: Interfaccia con il protocollo Zen per la distribuzione decentralizzata dei contenuti.

## Integrazione Zen.js

La webapp integra `zen.js` per permettere la distribuzione dei file tramite P2P. Utilizza file WebAssembly (`pen.wasm`, `crypto.wasm`) caricati all'avvio per operazioni crittografiche e di rete efficienti direttamente nel browser.

## Flusso di Navigazione e Riproduzione

1. **Navigazione**: L'utente clicca su un album -> `AlbumDetails.tsx` richiede dati a `api.ts` -> Dati visualizzati tramite componenti `artist/`.
2. **Riproduzione**: Clic su "Play" -> Traccia aggiunta a `usePlayerStore` -> Componente `player/` avvia lo streaming dal backend o tramite Zen P2P.
3. **Interazione Web3**: Connessione wallet -> `wallet.ts` gestisce l'account -> Possibilità di acquistare release o sbloccare contenuti.
