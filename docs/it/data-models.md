# Modelli dei Dati

TuneCamp utilizza **SQLite** come motore di database relazionale per la gestione dei metadati musicali, degli utenti e delle interazioni sociali.

## Schema del Database

### Entità Principali (Libreria Musicale)

- **`artists`**: Memorizza le informazioni sugli artisti (nome, biografia, immagine, identificativi federati).
- **`albums`**: Rappresenta le pubblicazioni musicali (titolo, artista, anno, copertina).
- **`tracks`**: Singole tracce audio (titolo, album, numero di traccia, durata, percorso del file, bitrate, `genre`, `fingerprint` per la deduplicazione interna). Il genere (`genre`) è una colonna sulla tabella `tracks`, non una tabella separata.
- **`album_ownership`** / **`track_ownership`**: Proprietà on-chain (NFT) di album e tracce.

### Utenti e Social

- **`admin`**: Tabella contenente tutti gli account locali (tutti i ruoli, non solo l'amministratore: il nome ha ragioni storiche). Include `role`, `password_hash`, `artist_id`, quote di archiviazione.
- **`gun_users`** / **`gun_cache`**: Tabelle ereditate dal livello di identità Zen rimosso — conservate per compatibilità di schema ma non più scritte. Vedi [FEDERATION.md](./FEDERATION.md) per la cronologia dettagliata.
- **`followers`**: Relazioni di tipo "follow" tra utenti locali e remoti.
- **`posts`** / **`ap_notes`**: Messaggi e attività nel Fediverso.
- **`starred_items`** / **`item_ratings`**: Preferiti e valutazioni degli utenti.
- **`comments`**: Commenti su tracce e album.
- **`chat_messages`**: Cronologia dei messaggi della chat di community.
- **`bookmarks`**: Segnalibri personali degli utenti.

### Federazione (ActivityPub)

- **`remote_actors`**: Cache dei profili utente remoti scoperti tramite ActivityPub.
- **`remote_content`**: Copia locale dei metadati per i contenuti federati (es. post di altri server).

### Funzionalità Avanzate

- **`playlists`** / **`playlist_tracks`**: Gestione delle playlist degli utenti.
- **`play_history`**: Registro degli ascolti per statistiche e raccomandazioni.
- **`unlock_codes`**: Codici di sblocco per l'accesso a contenuti protetti o a pagamento.
- **`torrents`** / **`soulseek_downloads`**: Integrazioni di condivisione file per il recupero di contenuti.
- **`dig_sessions`** / **`dig_crate_items`** / **`dig_history`** / **`dig_cache`**: Stato e cache della modalità "Dig" (scoperta musicale / crate digging).
- **`assets`** / **`storage_accounts`**: Memorizzazione di asset e account di archiviazione cloud connessi (es. Google Drive).
- **`track_stats`** / **`release_stats`**: Contatori aggregati degli ascolti.
- **`settings`**: Configurazione dell'istanza (chiave/valore).
- **`api_tokens`** / **`oauth_clients`** / **`oauth_links`**: Token API e client OAuth (es. accesso tramite Fediverso).
- **`ap_interactions`** / **`ap_replies`** / **`ap_following`** / **`ap_delivery_queue`** / **`fedify_kv`**: Stato di ActivityPub e coda di consegna dei messaggi.
- **`system_plugins`**: Stato (abilitato/disabilitato) dei provider di plugin.

## Relazioni Chiave

1. **Uno-a-Molti**: Un artista (`artist`) possiede molti album (`albums`). Un album (`album`) possiede molte tracce (`tracks`).
2. **Molti-a-Molti**: Una playlist (`playlist`) contiene molte tracce (`tracks`) attraverso la tabella pivot `playlist_tracks`.
3. **Federazione**: Un post locale (`post`) può essere collegato a un attore in `remote_actors`.

## Accesso ai Dati

La logica di accesso ai dati è incapsulata nei **Repository** (`src/server/repositories/`), che utilizzano query SQL dirette o query builder leggeri per interagire con `better-sqlite3`.

## Migrazioni

Il database viene inizializzato e aggiornato automaticamente in `src/server/core/database.ts`, che contiene gli script DDL per la creazione delle tabelle e migrazioni idempotenti (`ALTER TABLE ... ADD COLUMN`) eseguite all'avvio dell'applicazione.
