# Architettura Backend

Il backend di TuneCamp è un'applicazione Node.js costruita con Express, progettata per essere federata, decentralizzata e orientata ai contenuti musicali.

## Stack Tecnologico

- **Framework**: Express.js (TypeScript)
- **Database**: SQLite3 (`better-sqlite3`)
- **Protocollo Sociale**: ActivityPub (tramite Fedify)
- **Instance Discovery**: Gossip su HTTP (scoperta federata e crawling di NodeInfo)
- **Multimedia**: FFmpeg per transcodifica e metadati

## Componenti Principali

### 1. Scoperta Federata (`modules/network/federated-discovery.service.ts`)

TuneCamp scopre altre istanze tramite **gossip su HTTP** — non esiste un relay centrale o un registro condiviso.

- L'istanza esegue il crawling a partire da un set di semi (le istanze TuneCamp seguite tramite ActivityPub più `TUNECAMP_FEDERATION_SEEDS`).
- Valuta se ogni peer è un'istanza TuneCamp attiva tramite NodeInfo e memorizza le istanze raggiungibili nel database SQLite locale (tabella `federated_instances`).
- I cataloghi vengono quindi letti e sincronizzati direttamente tramite REST su HTTP.

### 2. Federazione ActivityPub (`modules/fedify/`, `modules/activitypub/`)

Consente a TuneCamp di interagire con altre istanze del Fediverso (come Mastodon, Funkwhale o altre istanze di TuneCamp).

- Implementa gli oggetti Actor, Note e altri elementi del protocollo ActivityPub.
- Gestisce la consegna dei messaggi e il recupero di contenuti remoti.

### 3. Modulo Catalogo (`modules/catalog/`)

Responsabile della scansione e dell'organizzazione della musica locale.

- **Scanner**: Scansiona le cartelle alla ricerca di nuovi file audio. Per garantire un controllo granulare, lo scanner crea gli album in modalità **Bozza (Draft)** nella libreria locale. Questo contenuto non è visibile pubblicamente finché non viene promosso manualmente a **Pubblicazione Ufficiale (Formal Release)** tramite il Pannello di Amministrazione.
- **Metadati**: Estrae i tag (ID3, Vorbis), genera le forme d'onda e integra provider esterni (MusicBrainz, Discogs, iTunes, Lyrics.ovh) per arricchire i dati e i testi delle canzoni.

### 4. Sicurezza e Autenticazione (`modules/auth/auth.service.ts`, `middleware/auth.ts`)

- Gestisce gli utenti locali memorizzando le password tramite hashing con bcrypt.
- Autenticazione tramite token JWT (segreto letto dalle variabili d'ambiente, dal file `.jwt-secret` o generato al primo avvio).
- Controllo dell'accesso basato sui ruoli (RBAC): Proprietario Istanza (Owner), Gestore (Manager), Curatore (Curator), Ascoltatore (Listener) (vedi [ROLES.md](./ROLES.md)).

### 5. Community: Live (`modules/live/`)

- **Live**: Registro in memoria delle sessioni live (`live.service.ts`); il flusso multimediale **passa attraverso il server**. Il browser dell'artista cattura l'audio tramite `MediaRecorder` e invia segmenti webm, che il servizio `HlsLiveService` (`hls.service.ts`) invia a un processo FFmpeg persistente. FFmpeg produce una playlist HLS dinamica (segmenti AAC) distribuita a tutti gli ascoltatori: una singola codifica condivisa, a differenza della copia per singolo ascoltatore della precedente mesh WebRTC.

### 6. Integrazione Blockchain (`modules/publishing/`, rotte `api/payments.ts`)

Si interfaccia con gli smart contract per gestire prezzi, pagamenti e sblocco dei contenuti.

## Modello dei Dati

TuneCamp utilizza **SQLite** come motore di database relazionale per la gestione dei metadati musicali, degli utenti e delle interazioni sociali. Il database viene inizializzato e aggiornato automaticamente in `src/server/core/database.ts`, che contiene gli script DDL per la creazione delle tabelle e migrazioni idempotenti (`ALTER TABLE ... ADD COLUMN`) eseguite all'avvio dell'applicazione.

### Entità Principali (Libreria Musicale)

- **`artists`**: Memorizza le informazioni sugli artisti (nome, biografia, immagine, identificativi federati).
- **`artist_events`**: Date live, concerti e tour degli artisti.
- **`albums`**: Rappresenta le pubblicazioni musicali (titolo, artista, anno, copertina).
- **`tracks`**: Singole tracce audio (titolo, album, numero di traccia, durata, percorso del file, bitrate, `genre`, `fingerprint` per la deduplicazione interna). Il genere (`genre`) è una colonna sulla tabella `tracks`, non una tabella separata.
- **`album_ownership`** / **`track_ownership`**: Proprietà on-chain (NFT) di album e tracce.

### Utenti e Social

- **`admin`**: Tabella contenente tutti gli account locali (tutti i ruoli, non solo l'amministratore: il nome ha ragioni storiche). Include `role`, `password_hash`, `artist_id`, quote di archiviazione.
- **`password_reset_tokens`**: Token crittografici a scadenza per il reset password via Brevo.
- **`zen_users`**: Cache del profilo identità FID/Zen (chiave pubblica, alias, avatar), sincronizzata con `admin.zen_pub` per il login SSO cross-istanza.
- **`zen_cache`**: Tabella ereditata dal livello di sincronizzazione ZEN rimosso — conservata per compatibilità di schema ma non più scritta.
- **`fid_registry`**: Registro passaporti e verifiche crittografiche dell'identità federata.
- **`followers`** / **`following`**: Relazioni di tipo "follow" tra utenti locali e attori remoti ActivityPub.
- **`posts`** / **`ap_notes`**: Messaggi e attività nel Fediverso.
- **`board_messages`**: Messaggi della bacheca / bulletin board pubblica della community.
- **`starred_items`** / **`item_ratings`**: Preferiti e valutazioni dei brani.
- **`comments`**: Commenti degli utenti su tracce e pubblicazioni.
- **`reports`**: Segnalazioni di copyright o contenuti inappropriati in attesa di moderazione.
- **`bookmarks`**: Segnalibri personali degli utenti.

### Ritirate: tabelle della chat

La chat peer è stata rimossa; `peer_chat_messages`, `peer_chat_bans`, `peer_chat_mutes`, `chat_rooms`, `chat_room_members` e `chat_room_messages` vengono ancora create per sicurezza in caso di rollback, ma nessuno le legge o le scrive. Eliminarle è una migrazione ancora da scrivere.

### Condivisione P2P Peer Sharing (Sidecamp)

- **`peer_sessions`**: Sessioni attive di connessione dei daemon autenticate su `/ws/peer`.
- **`peer_tracks`** / **`peer_tracks_new`**: Manifesti effimeri dei brani condivisi dai daemon Sidecamp connessi.
- **`peer_catalog_cache`**: Cache SQLite dei cataloghi peer delle istanze remote per la navigazione di rete.

### Federazione (ActivityPub & Discovery)

- **`remote_actors`**: Cache dei profili utente remoti scoperti tramite ActivityPub.
- **`remote_content`**: Copia locale dei metadati per i contenuti federati (es. post di altri server).
- **`ap_interactions`** / **`ap_replies`** / **`ap_following`** / **`ap_delivery_queue`** / **`fedify_kv`**: Stato di ActivityPub, firme degli attori e coda di consegna dei messaggi in uscita.
- **`federated_instances`**: Peer scoperti nella rete tramite il servizio di gossip discovery HTTP.

### Funzionalità Avanzate

- **`playlists`** / **`playlist_tracks`**: Gestione delle playlist degli utenti e ordine delle tracce.
- **`play_history`**: Registro degli ascolti per statistiche, scrobbling e raccomandazioni.
- **`unlock_codes`**: Codici di sblocco per l'accesso a contenuti protetti o a pagamento.
- **`torrents`**: Integrazioni di condivisione file per il recupero di contenuti (l'acquisizione P2P vive in [Sidecamp](./sidecamp.md)).
- **`dig_sessions`** / **`dig_crate_items`** / **`dig_history`** / **`dig_cache`**: Stato e cache della modalità "Dig" (scoperta musicale / crate digging — sul grafo collezionisti Bandcamp, oppure, opt-in, sugli utenti di questo network; vedi [FEDERATION.md](./FEDERATION.md#network-dig-scoperta-cross-istanza)).
- **`assets`** / **`storage_accounts`**: Memorizzazione di asset e account di archiviazione cloud connessi (es. Google Drive).
- **`track_stats`** / **`release_stats`**: Contatori aggregati degli ascolti e statistiche sul tempo di riproduzione.
- **`settings`**: Configurazione chiave/valore dell'istanza.
- **`api_tokens`** / **`oauth_clients`** / **`oauth_links`**: Token API personali (es. MCP) e collegamenti OAuth.
- **`system_plugins`**: Stato (abilitato/disabilitato) dei provider di plugin.
- **`samples`** / **`sample_packs`**: Upload di sample gratuiti (non in store) — BPM, tonalità, licenza, moderazione. Un sample può appartenere a un pack tramite `samples.pack_id`.
- **`collab_projects`** / **`collab_versions`** / **`collab_stems`**: Creazione collaborativa di tracce multi-artista con snapshot di versioni append-only e caricamento stem.

### Relazioni Chiave

1. **Uno-a-Molti**: Un artista (`artist`) possiede molti album (`albums`). Un album (`album`) possiede molte tracce (`tracks`).
2. **Molti-a-Molti**: Una playlist (`playlist`) contiene molte tracce (`tracks`) attraverso la tabella pivot `playlist_tracks`.
3. **Federazione**: Un post locale (`post`) può essere collegato a un attore in `remote_actors`.

### Accesso ai Dati

La logica di accesso ai dati è incapsulata nei **Repository** (`src/server/repositories/`), che utilizzano query SQL dirette o query builder leggeri per interagire con `better-sqlite3`.

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
- `/api/live`: Sessioni live.
- `/rest`: Compatibilità con il protocollo Subsonic/OpenSubsonic.
- `/health`: Controllo dello stato del server (health check).
