# Integrazione con Google Drive

TuneCamp consente agli amministratori di collegare un account Google Drive per riprodurre in streaming, importare e localizzare file musicali direttamente dal cloud.

## 1. Flusso di Autenticazione OAuth2

L'integrazione utilizza il protocollo Google OAuth2 per accedere in modo sicuro ai file dell'utente.
- **Servizio**: `src/server/modules/storage/google-drive.service.ts`
- **Ambito dei Permessi (Scopes)**:
  - `drive.readonly`: Per elencare e scaricare i file.
  - `drive.file`: Per caricare i file (se necessario).
  - `userinfo.email`: Per identificare l'account collegato.

### Passaggi per l'Autenticazione:
1. L'amministratore fa clic su "Connetti Google Drive" nella scheda Archiviazione (Storage).
2. Viene reindirizzato alla schermata di consenso di Google tramite la richiesta `GET /api/storage/gdrive/auth`.
3. Dopo l'approvazione, Google reindirizza l'utente a `/api/storage/gdrive/callback?code=...`.
4. Il backend scambia il codice con un token di accesso (`access_token`) e un token di aggiornamento (`refresh_token`).
5. I token vengono crittografati e memorizzati nella tabella `storage_accounts`.

## 2. Streaming dal Cloud

TuneCamp supporta la riproduzione in streaming direttamente da Google Drive senza dover scaricare preventivamente il file sul server locale.
- **Protocollo**: Le tracce il cui percorso (`file_path`) inizia con `gdrive://` vengono trattate come tracce cloud.
- **Meccanismo**:
  1. Quando viene richiesto lo streaming, viene richiamato il metodo `GoogleDriveService.getFileStream`.
  2. Questo utilizza il parametro `alt=media` dell'API di Google Drive.
  3. Supporta le **Richieste di Intervallo (Range Requests / seek)** inoltrando l'intestazione HTTP Range direttamente all'API di Google.

## 3. Importazione e Localizzazione

### Importazione
- Gli amministratori possono sfogliare le cartelle del proprio Drive (`GET /api/storage/gdrive/files`).
- Selezionando un file si crea un record di traccia nel database con `file_path: gdrive://{fileId}`.
- I metadati (Titolo/Artista) vengono provvisoriamente dedotti dal nome del file.

### Localizzazione
- **Scopo**: Converte una traccia cloud (`gdrive://`) in un file locale memorizzato sul server di TuneCamp.
- **Meccanismo**: Il backend scarica il file da Drive, lo salva nella cartella locale `music/tracks/` e aggiorna il record del database facendolo puntare al percorso locale.

## 4. Configurazione

Le credenziali possono essere impostate tramite variabili d'ambiente o direttamente nell'interfaccia di amministrazione (scheda Storage → impostazioni `google_drive_client_id` / `google_drive_client_secret`, che hanno la priorità sulle variabili d'ambiente).

Variabili d'ambiente:
- `TUNECAMP_GDRIVE_CLIENT_ID`: Ottenuta dalla console di Google Cloud.
- `TUNECAMP_GDRIVE_CLIENT_SECRET`: Ottenuta dalla console di Google Cloud.

L'URI di reindirizzamento OAuth (Redirect URI) viene derivato dall'URL pubblico dell'istanza:
`https://tuo-dominio.com/api/storage/gdrive/callback`.
