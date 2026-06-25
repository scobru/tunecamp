# Architettura Webapp

La webapp di TuneCamp è una moderna Single Page Application (SPA) costruita con React e Vite, ottimizzata per l'esperienza d'uso musicale e l'interazione decentralizzata.

## Stack Tecnologico

- **Framework UI**: React (TypeScript)
- **Strumento di Build**: Vite
- **Gestione dello Stato**: Zustand
- **Routing**: React Router
- **Instance Discovery**: API REST Gossip su HTTP
- **Wallet**: Ethers.js v6 (injected provider EIP-1193, es. MetaMask)

## Organizzazione del Codice

### 1. Componenti (`components/`)
Organizzati per dominio funzionale:
- **`player/`**: Il riproduttore musicale globale, gestisce lo stato di riproduzione, la coda e la visualizzazione della forma d'onda.
- **`artist/`**, **`auth/`**, **`admin/`**: Componenti specifici per le diverse aree dell'applicazione.
- **`ui/`**: Componenti atomici e riutilizzabili (pulsanti, input, indicatori di caricamento).

### 2. Pagine (`pages/`)
Ogni file rappresenta una rotta principale:
- `Home.tsx`: Dashboard principale.
- `Albums.tsx` / `Artists.tsx`: Navigazione della libreria.
- `Admin.tsx`: Pannello di gestione per l'amministratore del server.
- `Network.tsx`: Visualizzazione della rete federata.

### 3. State Store (`stores/`)
Utilizziamo Zustand per una gestione dello stato leggera e ad alte prestazioni:
- `usePlayerStore`: Stato di riproduzione corrente (coda di riproduzione, traccia attiva).
- `useAuthStore`: Stato dell'utente connesso e token JWT.
- `useWalletStore`: Stato del wallet connesso (account, rete).
- `useConfigStore`: Configurazione dell'istanza (branding, feature flag).
- `useUIStore`: Stato dell'interfaccia (finestre modali, pannelli).
- `useDigStore`: Stato della modalità "Dig" (scoperta musicale / crate digging).

### 4. Servizi (`services/`)
- `api.ts`: Wrapper per le chiamate REST al backend di TuneCamp.
- `wallet.ts`: Gestione del wallet nel browser (connessione, firma dei messaggi, transazioni on-chain tramite ethers).

## Flusso di Navigazione e Riproduzione

1. **Navigazione**: L'utente clicca su un album -> `AlbumDetails.tsx` richiede i dati tramite `api.ts` -> I dati vengono visualizzati utilizzando i componenti in `components/artist/`.
2. **Riproduzione**: Clic su "Riproduci" -> La traccia viene aggiunta a `usePlayerStore` -> Il componente `player/` avvia lo streaming dal backend (`/api/tracks/:id/stream`), con fallback ai provider esterni se il file locale non è presente.
3. **Interazione Web3**: Connessione del wallet -> `wallet.ts` gestisce l'account -> Possibilità di acquistare pubblicazioni o sbloccare contenuti.
