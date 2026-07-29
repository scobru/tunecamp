# TuneCamp — Decisioni di Architettura & Regole IA

## Workflow & Linee Guida Git

- **`dev` è il ramo di integrazione — non committare mai direttamente su `main` e non creare mai rami a partire da `main`.** Tutto il lavoro parte da `dev`: prima `git checkout dev && git pull`, poi `git checkout -b feat/<nome>` o `fix/<nome>`.
- **Mantiati `dev` sincronizzato con `main`.** Prima di iniziare un nuovo lavoro (e prima di effettuare il merge su `dev`), esegui un fast-forward di `dev` dall'ultimo `main` in modo che non vada mai in deriva: `git checkout dev && git fetch origin && git merge --ff-only origin/main`.
- I rami di funzionalità/fix effettuano il merge su `dev`; `dev` è il ramo che viene promosso su `main` per i rilasci.
- **Prima di ogni push:** aggiorna `CHANGELOG.md` e incrementa la versione in `package.json` (semver):
  - `patch` (x.x.X) — fix di bug, refactoring minori, nessuna nuova funzionalità
  - `minor` (x.X.0) — nuova funzionalità retrocompatibile
  - `major` (X.0.0) — modifiche breaking, API rimosse, cambi di architettura
- Apri la PR con `gh pr create` puntando a `dev` (non a `main`).

## Decisioni di Architettura

### Database
- **Rimani su SQLite (better-sqlite3, modalità WAL).** Nessun Postgres/Redis in configurazione a macchina singola.
- Il collo di bottiglia è CPU/concorrenza/IO sul singolo processo, non il database.
- Migrare solo in caso di: scalabilità orizzontale (multi-macchina) O contesa di scrittura prolungata (`SQLITE_BUSY`).

### Filesystem
- **I file non vengono mai spostati o rinominati.** Il filesystem costituisce la verità di *dove* si trova un file; il DB contiene i metadati.
- `consolidateFiles()` è stato rimosso — non reintrodurlo né reintrodurre logiche che spostano/rinominano file.
- `sync-tags` (riscrittura tag ID3 da DB) è mantenuto solo come azione manuale su richiesta.
- La dedup via `file_path` tramite `mergeTracks` è corretta; la riorganizzazione del filesystem no.

### ZEN / Gun.js
- **ZEN DB / Gun.js è stato completamente rimosso** (PR #370, 15-06-2026). Non re-importare `zen`, `zendb.service`, `zen.worker` o `gun`.
- La scoperta delle istanze ora utilizza **HTTP federato** (NodeInfo `/.well-known/nodeinfo`, endpoint `/peers`, gossip crawler).
- Le firme **Zen SEA & FID SSO** (`/api/auth/zen/*`) rimangono attive per i passaporti di identità decentralizzata e i collegamenti tra istanze.

### Federazione & Autenticazione
- L'autenticazione è **username + password + JWT, per-istanza**. Nessun SSO cross-istanza, nessuna identità crittografica portabile.
- ActivityPub federati le interazioni, non i login (modello Mastodon/Funkwhale).
- Le transazioni (acquisti/collezioni) sono locali all'istanza dell'artista.
- I feed RSS/Atom possono essere seguiti: salvati come `remote_actors` con `type='rss'`; elementi salvati come `remote_content`.

### Pubblicazione & Ruoli
- **Gli ascoltatori (ruolo `user`) non possono pubblicare.** Nessun caricamento, pubblicazione, vendita o post social.
- Gate: `VisibilityGuardian.canPublishContent()` — root_admin/admin sempre; super_user (curatore) **o** `user` (ascoltatore) solo quando hanno un profilo artista collegato (`artistId`); chiunque sia sprovvisto di profilo artista non può mai pubblicare.
- Il flusso "Diventa un Artista" mantiene il ruolo `user` dell'account dopo l'approvazione dell'admin — collega un profilo artista che concede i permessi di pubblicazione tramite `canPublishContent`.
- Ogni nuovo endpoint di pubblicazione/vendita deve utilizzare `canPublishContent` e non controlli grezzi su `artistId`.

### Playlist
- Le playlist sono **riservate ai membri** (401 per anonimi). Tutti gli utenti autenticati (inclusi gli Ascoltatori) possono crearne.
- **Modello stage pubblico:** un brano privato aggiunto a una playlist pubblica viene deliberatamente pubblicato. Questo rappresenta il canale di curatela, non una fuga di dati.
- Non rendere le playlist visibili agli utenti anonimi né limitarle a ruoli superiori a `user`.
