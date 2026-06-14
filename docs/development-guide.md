# Guida allo Sviluppo

Questa guida fornisce le istruzioni necessarie per configurare l'ambiente di sviluppo di TuneCamp e iniziare a contribuire al progetto.

## Prerequisiti

- **Node.js**: Versione 18 o superiore.
- **FFmpeg**: Necessario per la gestione dei file audio e la generazione delle waveform.
- **SQLite3**: Opzionale (per ispezione manuale del database).

## Configurazione Iniziale

1. **Clona il repository**:
   ```bash
   git clone <repository-url>
   cd tunecamp
   ```

2. **Installa le dipendenze**:
   ```bash
   npm install
   cd webapp && npm install
   ```

3. **Configura le variabili d'ambiente**:
   Copia il file `.env.example` in `.env` e configura i parametri necessari (porte, secret JWT, percorsi cartelle musicali).

## Esecuzione in Sviluppo

### Backend
Dalla root del progetto, in due terminali separati:
```bash
# Terminale 1 — compila TypeScript in watch + ricostruisce la CSS
npm run dev

# Terminale 2 — avvia il server (esegue le migrazioni automaticamente)
npm start
```
> Nota: `npm run dev` esegue solo `tsc --watch` + il watcher CSS, **non** avvia il server. Serve `npm start` (oppure `node dist/index.js`) per eseguirlo.

Il server sarà disponibile di default su `http://localhost:1970` (configurabile via `TUNECAMP_PORT`).

### Webapp
Dalla directory `webapp/`:
```bash
npm run dev
```
L'interfaccia utente sarà disponibile su `http://localhost:5173`.

## Test

Il progetto utilizza **Jest** per i test esistenti, ma la direzione strategica (mandato AI) prevede la transizione a **Vitest** per i nuovi moduli.
```bash
# Esegui tutti i test (Jest)
npm test

# Esegui test specifici
npm test src/server/auth.test.ts
```

## Strumenti Utili (`src/tools/`)

Sono disponibili diversi script per compiti comuni:
- `backup.ts`: Crea un backup del database e dei dati.
- `generate-codes.ts`: Genera codici di sblocco per le release.
- `relink-tracks.ts`: Aggiorna i percorsi dei file audio se la libreria viene spostata.
- `migrate-dedupe.js`: Rimuove tracce duplicate nel database (`npm run migrate:dedupe`).
- `migrate-visibility.js`: Aggiorna la visibilità di massa per album e tracce (`npm run migrate:visibility`).

## Convenzioni di Codifica

- Utilizzare **TypeScript** per tutto il nuovo codice.
- Seguire lo stile esistente basato su **Functional Components** in React.
- Documentare le nuove API in `docs/api-contracts.md`.
- Assicurarsi che ogni nuova tabella database sia aggiunta a `src/server/core/database.ts` con i relativi indici.

## Contribuire

Per maggiori dettagli sul processo di contribuzione, consulta il file [`docs/CONTRIBUTING.md`](./CONTRIBUTING.md).
