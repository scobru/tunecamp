# Analisi dell'Albero dei Sorgenti

Questa sezione descrive la struttura del repository di TuneCamp, evidenziando le directory critiche e la loro funzione.

## Struttura del Progetto

```
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
