# Guida allo Sviluppo

Questa guida illustra come configurare un ambiente di sviluppo locale per TuneCamp e iniziare a contribuire al progetto.

## Prerequisiti

- **Node.js**: versione 18 o superiore
- **FFmpeg**: Richiesto per l'elaborazione audio e la generazione delle forme d'onda
- **Toolchain di build nativa**: Richiesta per compilare i moduli nativi (`better-sqlite3`, `node-datachannel`/`webtorrent`, …) quando nessun binario precompilato corrisponde alla tua piattaforma. Installa **Python 3**, **make** e un **compilatore C/C++** (`gcc`/`g++` su Linux, gli Xcode Command Line Tools su macOS, o il workload "Desktop development with C++" su Windows). Serve anche **CMake** se `node-datachannel` deve compilare dai sorgenti. Su Debian/Ubuntu: `sudo apt install build-essential python3 cmake`. Sono gli stessi strumenti che il Dockerfile installa (`python3 make g++`) per la build dell'immagine, quindi la via Docker non li richiede sull'host.
- **SQLite3**: Opzionale — utile per l'ispezione manuale del database

## Configurazione Iniziale

1. **Clona il repository**:
   ```bash
   git clone https://github.com/scobru/tunecamp.git
   cd tunecamp
   ```

2. **Installa le dipendenze**:
   ```bash
   # Root + backend
   npm install

   # Frontend
   cd webapp && npm install && cd ..
   ```

3. **Configura le variabili d'ambiente**:
   Copia il file `.env.example` in `.env` e compila i valori richiesti (porta, segreto JWT, percorso della cartella musicale). Consulta la [sezione di configurazione del README](https://github.com/scobru/tunecamp/blob/main/README.md#configuration) per il riferimento completo a tutte le variabili.

## Esecuzione in Ambiente di Sviluppo

È necessario avere due (o tre) terminali in esecuzione in parallelo.

**Terminale 1 — backend (watch di TypeScript + ricompilazione CSS):**
```bash
npm run dev
```

**Terminale 2 — server backend:**
```bash
npm start
```

> `npm run dev` avvia solo `tsc --watch` e il monitor dei file CSS — **non** avvia il server. È necessario eseguire `npm start` (o `node dist/index.js`) per servire le richieste.

Il server è disponibile per impostazione predefinita all'indirizzo `http://localhost:1970` (configurabile tramite `TUNECAMP_PORT`).

**Terminale 3 — frontend (server di sviluppo Vite con HMR):**
```bash
cd webapp && npm run dev
```

Il server di sviluppo del frontend è attivo all'indirizzo `http://localhost:5173` e inoltra le richieste API al backend (tramite proxy).

## Esecuzione dei Test

Il progetto utilizza **Jest** per la suite di test esistente. I nuovi moduli dovrebbero utilizzare **Vitest**.

```bash
# Esegui tutti i test
npm test

# Esegui un file di test specifico
npm test src/server/auth.test.ts
```

Verifica che non vi siano errori di TypeScript prima di aprire una PR:
```bash
npm run build
cd webapp && npm run build
```

## Strumenti CLI (`src/tools/`)

Sotto la cartella `src/tools/` sono disponibili diversi script di manutenzione:

| Script | Comando | Scopo |
|---|---|---|
| `backup.ts` | `node dist/tools/backup.js ./backups` | Crea un backup del database con marcatura temporale |
| `restore.ts` | `node dist/tools/restore.js ./backups/tunecamp-<data>.db --force` | Ripristina da un backup |
| `generate-codes.ts` | — | Genera codici di sblocco per le release |
| `relink-tracks.ts` | — | Aggiorna i percorsi dei file audio dopo lo spostamento della libreria |
| `migrate-dedupe.js` | `npm run migrate:dedupe` | Rimuove i brani duplicati dal database |
| `migrate-visibility.js` | `npm run migrate:visibility` | Aggiorna in blocco la visibilità di album e tracce |

Consulta [backup-migration.md](./backup-migration.md) per maggiori dettagli sulla manutenzione dei dati.

## Convenzioni di Codifica

- Utilizza **TypeScript** per tutto il nuovo codice backend.
- Segui lo stile dei **componenti funzionali** esistente in React.
- Documenta i nuovi endpoint API in [api-contracts.md](./api-contracts.md).
- Ogni nuova tabella del database deve essere aggiunta a `src/server/core/database.ts` con gli indici appropriati.

## Contribuire

Vedi [CONTRIBUTING.md](./CONTRIBUTING.md) per il processo completo di contribuzione.
