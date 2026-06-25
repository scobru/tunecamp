# Architettura Backend

Il backend di TuneCamp è un'applicazione Node.js costruita con Express, progettata per essere federata, decentralizzata e orientata ai contenuti musicali.

## Stack Tecnologico

- **Framework**: Express.js (TypeScript)
- **Database**: SQLite3 (`better-sqlite3`)
- **Protocollo Sociale**: ActivityPub (tramite Fedify)
- **Instance Discovery**: Gossip su HTTP (scoperta federata e crawling di NodeInfo)
- **Multimedia**: FFmpeg per transcodifica e metadati

## Componenti Principali

### 1. Sistema Database (`core/database.ts`)
Gestisce la persistenza locale tramite SQLite. Le tabelle includono:
- `artists`, `albums`, `tracks`: Il nucleo della libreria musicale.
- `remote_actors`, `remote_content`: Cache per la federazione ActivityPub.
- `unlock_codes`: Gestione degli accessi basata su chiavi.
- `chat_messages`: Cronologia dei messaggi della chat di community.

### 2. Scoperta Federata (`modules/network/federated-discovery.service.ts`)
TuneCamp scopre altre istanze tramite **gossip su HTTP** — non esiste un relay centrale o un registro condiviso.
- L'istanza esegue il crawling a partire da un set di semi (le istanze TuneCamp seguite tramite ActivityPub più `TUNECAMP_FEDERATION_SEEDS`).
- Valuta se ogni peer è un'istanza TuneCamp attiva tramite NodeInfo e memorizza le istanze raggiungibili nel database SQLite locale (tabella `federated_instances`).
- I cataloghi vengono quindi letti e sincronizzati direttamente tramite REST su HTTP.

### 3. Federazione ActivityPub (`modules/fedify/`, `modules/activitypub/`)
Consente a TuneCamp di interagire con altre istanze del Fediverso (come Mastodon, Funkwhale o altre istanze di TuneCamp).
- Implementa gli oggetti Actor, Note e altri elementi del protocollo ActivityPub.
- Gestisce la consegna dei messaggi e il recupero di contenuti remoti.

### 4. Modulo Catalogo (`modules/catalog/`)
Responsabile della scansione e dell'organizzazione della musica locale.
- **Scanner**: Scansiona le cartelle alla ricerca di nuovi file audio. Per garantire un controllo granulare, lo scanner crea gli album in modalità **Bozza (Draft)** nella libreria locale. Questo contenuto non è visibile pubblicamente finché non viene promosso manualmente a **Pubblicazione Ufficiale (Formal Release)** tramite il Pannello di Amministrazione.
- **Metadati**: Estrae i tag (ID3, Vorbis), genera le forme d'onda e integra provider esterni (MusicBrainz, Discogs, iTunes, Lyrics.ovh) per arricchire i dati e i testi delle canzoni.

### 5. Sicurezza e Autenticazione (`modules/auth/auth.service.ts`, `middleware/auth.ts`)
- Gestisce gli utenti locali memorizzando le password tramite hashing con bcrypt.
- Autenticazione tramite token JWT (segreto letto dalle variabili d'ambiente, dal file `.jwt-secret` o generato al primo avvio).
- Controllo dell'accesso basato sui ruoli (RBAC): Proprietario Istanza (Owner), Gestore (Manager), Curatore (Curator), Ascoltatore (Listener) (vedi [ROLES.md](./ROLES.md)).

### 6. Community: Chat e Live (`modules/chat/`, `modules/live/`)
- **Chat**: Chat autonoma di istanza con cronologia persistente in SQLite.
- **Live**: Registro in memoria delle sessioni live (`live.service.ts`); il flusso multimediale **passa attraverso il server**. Il browser dell'artista cattura l'audio tramite `MediaRecorder` e invia segmenti webm, che il servizio `HlsLiveService` (`hls.service.ts`) invia a un processo FFmpeg persistente. FFmpeg produce una playlist HLS dinamica (segmenti AAC) distribuita a tutti gli ascoltatori: una singola codifica condivisa, a differenza della copia per singolo ascoltatore della precedente mesh WebRTC.

### 7. Integrazione Blockchain (`modules/publishing/`, rotte `api/payments.ts`)
Si interfaccia con gli smart contract per gestire prezzi, pagamenti e sblocco dei contenuti.

## Affidabilità e Monitoraggio

- L'endpoint `GET /health` è registrato prima del middleware di federazione, in modo che un'integrazione bloccata non possa comprometterlo (utilizzato da Docker per l'istruzione `HEALTHCHECK`).
- Segnalazione dei crash opzionale su Sentry tramite `SENTRY_DSN` (vedi [monitoring.md](./monitoring.md)).

## Flussi di Dati

1. **Scansione**: Lo `Scanner` rileva un file -> il servizio di metadati estrae le informazioni -> il repository salva i dati nel DB.
2. **Streaming**: Richiesta API -> verifica dei permessi -> stream del file (con transcodifica FFmpeg se necessaria).
3. **Social**: Nuovo post -> il servizio ActivityPub crea l'oggetto -> Fedify lo consegna agli attori remoti.

## API REST

Gli endpoint sono suddivisi in rotte tematiche in `src/server/routes/`:
- `/api/tracks`, `/api/albums`, `/api/artists`: Gestione della libreria.
- `/api/admin`: Funzionalità amministrative.
- `/api/ap`: Endpoint per la federazione ActivityPub.
- `/api/chat`, `/api/live`: Chat di community e sessioni live.
- `/rest`: Compatibilità con il protocollo Subsonic/OpenSubsonic.
- `/health`: Controllo dello stato del server (health check).
