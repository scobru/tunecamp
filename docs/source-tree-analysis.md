# Analisi dell'Albero dei Sorgenti

Questa sezione descrive la struttura del repository TuneCamp, evidenziando le directory critiche e il loro scopo.

## Struttura del Progetto

```
tunecamp/
├── contracts/          # Smart Contracts (Solidity)
│   ├── TuneCampCheckout.sol
│   ├── TuneCampFactory.sol
│   └── TuneCampNFT.sol
├── docs/               # Documentazione tecnica (Markdown, JSON)
├── src/                # Sorgenti del Backend e strumenti
│   ├── server/         # Logica core del Server Express
│   │   ├── common/     # Utilità ed errori condivisi
│   │   ├── core/       # Config, container DI, database, plugin-loader
│   │   ├── middleware/ # Middleware Express (Auth, Error handling, Rate limit)
│   │   ├── modules/    # Logica di business per dominio (ActivityPub, Catalog, AI, Live, Storage, ...)
│   │   ├── providers/  # Implementazioni dei provider plugin (metadata, streaming, storage, ...)
│   │   ├── repositories/ # Layer di accesso ai dati (Album, Artist, Track)
│   │   ├── routes/     # Endpoint API REST (admin, api, auth, library, network)
│   │   ├── server.ts   # Bootstrap del server Express
│   │   ├── types/      # Tipi condivisi del backend
│   │   └── utils/      # Funzioni di utilità del server
│   ├── tools/          # Script di manutenzione, backup e migrazione
│   └── utils/          # Funzioni di utilità generale
├── webapp/             # Applicazione Frontend React
│   ├── public/         # Asset statici e file WASM
│   └── src/            # Sorgenti React
│       ├── components/ # Componenti UI organizzati per dominio
│       ├── hooks/      # Custom React Hooks
│       ├── pages/      # Componenti Pagina (Route entry points)
│       ├── services/   # Client API e integrazione Zen
│       └── stores/     # Gestione dello stato (Zustand)
├── website/            # Sito web statico di presentazione
└── docker-compose.yml  # Configurazione per il deployment containerizzato
```

## Directory Critiche e Scopo

### `src/server/`
Contiene tutta la logica server-side. Utilizza un'architettura a layer:
- **Routes**: Definiscono l'interfaccia API.
- **Repositories**: Gestiscono le query SQLite.
- **Modules**: Incapsulano funzionalità complesse come la federazione ActivityPub o la gestione dei file audio.

### `webapp/src/`
Il cuore dell'interfaccia utente.
- **Pages**: Directory fondamentale che mappa le rotte del frontend.
- **Components**: Suddivisi in `ui/` (base), `layout/`, `modals/` e directory tematiche (`player/`, `artist/`, `admin/`).
- **Services**: `api.ts` è il gateway principale per la comunicazione col backend.

### `contracts/`
Definisce la logica on-chain per la monetizzazione e il controllo degli accessi.

### `src/tools/`
Essenziale per la gestione della libreria musicale (relink dei percorsi, migrazioni di database, generazione di codici di sblocco).

## Punti di Ingresso (Entry Points)

- **Backend**: `src/index.ts` — entry point: carica la config e chiama `startServer` da `src/server/server.ts`.
- **Webapp**: `webapp/src/main.tsx` — punto di mount dell'applicazione React.
- **CLI/Tools**: Vari script in `src/tools/` (backup, restore, generate-codes, relink-tracks, migrazioni).
