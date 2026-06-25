# Guida al Backup e alla Migrazione

Questa guida descrive come eseguire il backup della tua istanza TuneCamp e migrarla su un nuovo server preservando tutti i dati, le impostazioni e le sessioni degli utenti.

## 1. Contenuto del Backup

Un backup completo di TuneCamp è un archivio TAR compresso (`.tar.gz`) che contiene:
- **`tunecamp.db`**: Il database SQLite (tutte le tracce, gli artisti, gli utenti e le impostazioni).
- **`.jwt-secret`**: La chiave segreta del server (richiesta per mantenere valide le sessioni utente esistenti).
- **Configurazione**: Il file di configurazione, incluso come riferimento (la logica di ripristino si affida principalmente al database).

> L'endpoint di ripristino accetta anche archivi `.zip` standard per compatibilità con le versioni precedenti.

## 2. Backup Automatico

Gli amministratori possono avviare un backup tramite l'interfaccia utente (UI) o l'API:
- **Rotta**: `GET /api/admin/backup/full`
- **Output**: Un archivio `.tar.gz` scaricabile (`Content-Type: application/gzip`).
- **Altre rotte**: `GET /api/admin/backup/audio` (solo file audio), `POST /api/admin/backup/gdrive` (backup su Google Drive).

## 3. Flusso di Migrazione (Ripristino)

Per spostare TuneCamp su un nuovo server:

1. **Installa TuneCamp**: Configura il nuovo server seguendo la [Guida allo Sviluppo](./development-guide.md).
2. **Trasferisci la Musica**: Copia manualmente la cartella della musica (`music/`) sul nuovo server.
3. **Ripristina i Dati**:
   - Usa l'interfaccia amministratore per caricare l'archivio di backup, oppure
   - Invia una richiesta `POST /api/admin/backup/restore` con l'archivio nel campo `backup` del modulo (i file di grandi dimensioni possono essere caricati in blocchi tramite `/chunk` + `/restore-chunked`).
4. **Verifica**:
   - Il sistema estrae il database e il file `.jwt-secret`.
   - Si riconnette al database e ne verifica l'integrità.
   - **Importante**: Riavvia il server dopo un ripristino per applicare il nuovo segreto JWT e il database.

## 4. Backup Manuale del Database (CLI)

Se l'interfaccia utente non è disponibile, puoi copiare direttamente il database. Questi strumenti operano esclusivamente sul file SQLite grezzo (non generano né utilizzano l'archivio completo `.tar.gz`). Compila prima il progetto con `npm run build`:

```bash
# Backup: copia il database in <dir>/tunecamp-<timestamp>.db (di default ./backups)
node dist/tools/backup.js ./backups

# Ripristino: copia un file .db sovrascrivendo il database attivo (--force per sovrascrivere)
node dist/tools/restore.js ./backups/tunecamp-2026-01-01.db --force
```

## 5. Persistenza e Sicurezza

- **Blocco dei File**: Lo strumento di ripristino gestisce il blocco dei file di SQLite riprovando l'operazione di sostituzione in caso di errore.
- **Migrazione del Segreto**: A differenza di molte altre piattaforme, TuneCamp migra esplicitamente il segreto JWT per garantire che gli utenti non debbano effettuare nuovamente l'accesso dopo una migrazione.
