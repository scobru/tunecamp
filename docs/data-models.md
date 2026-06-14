# Modelli Dati

TuneCamp utilizza **SQLite** come motore di database relazionale per la gestione dei metadati musicali, degli utenti e delle interazioni social.

## Schema del Database

### Entità Core (Libreria Musicale)

- **`artists`**: Memorizza le informazioni sugli artisti (nome, biografia, immagine, identificatori federati).
- **`albums`**: Rappresenta le release (titolo, artista, anno, copertina).
- **`tracks`**: Le singole tracce audio (titolo, album, numero traccia, durata, percorso file, bitrate, `genre`, `fingerprint` per il dedup interno). Il genere è una colonna su `tracks`, non una tabella separata.
- **`album_ownership`** / **`track_ownership`**: Proprietà on-chain (NFT) di album e tracce.

### Utenti e Social

- **`admin`**: Tabella di tutti gli account locali (tutti i ruoli, non solo admin: il nome è storico). Include `role`, `password_hash`, `artist_id`, quote di storage.
- **`gun_users`** / **`gun_cache`**: Mappatura/cache legacy per le chiavi pubbliche Zen lato server.
- **`followers`**: Relazioni "segui" tra utenti locali e remoti.
- **`posts`** / **`ap_notes`**: Messaggi e attività nel Fediverso.
- **`starred_items`** / **`item_ratings`**: Preferiti e valutazioni degli utenti.
- **`comments`**: Commenti su tracce e album.
- **`chat_messages`**: Cronologia della chat di istanza.
- **`bookmarks`**: Segnalibri personali.

### Federazione (ActivityPub)

- **`remote_actors`**: Cache dei profili utente remoti scoperti tramite ActivityPub.
- **`remote_content`**: Copia locale dei metadati per contenuti federati (es. post di altri server).

### Funzionalità Avanzate

- **`playlists`** / **`playlist_tracks`**: Gestione delle liste di riproduzione degli utenti.
- **`play_history`**: Registro degli ascolti per statistiche e raccomandazioni.
- **`unlock_codes`**: Codici di accesso per contenuti protetti o a pagamento.
- **`torrents`** / **`soulseek_downloads`**: Integrazione con protocolli di condivisione file per il recupero di contenuti.
- **`dig_sessions`** / **`dig_crate_items`** / **`dig_history`** / **`dig_cache`**: Stato e cache della modalità "Dig" (crate digging / scoperta musicale).
- **`assets`** / **`storage_accounts`**: Asset dello store e account di storage cloud (es. Google Drive) collegati.
- **`track_stats`** / **`release_stats`**: Contatori di riproduzione aggregati.
- **`settings`**: Configurazione dell'istanza (chiave/valore).
- **`api_tokens`** / **`oauth_clients`** / **`oauth_links`**: Token API e client OAuth (es. login Fediverso).
- **`ap_interactions`** / **`ap_replies`** / **`ap_following`** / **`ap_delivery_queue`** / **`fedify_kv`**: Stato e coda di consegna ActivityPub.
- **`system_plugins`**: Stato (abilitato/disabilitato) dei provider plugin.

## Relazioni Principali

1. **Uno-a-Molti**: Un `artist` ha molti `albums`. Un `album` ha molte `tracks`.
2. **Molti-a-Molti**: Una `playlist` contiene molte `tracks` tramite la tabella pivot `playlist_tracks`.
3. **Federazione**: Un `post` locale può essere collegato a un attore in `remote_actors`.

## Accesso ai Dati

La logica di accesso ai dati è incapsulata nei **Repository** (`src/server/repositories/`), che utilizzano query SQL dirette o query builder leggeri per interagire con `better-sqlite3`.

## Migrazioni

Il database viene inizializzato e aggiornato automaticamente in `src/server/core/database.ts`, che contiene gli script DDL per la creazione delle tabelle e le migrazioni idempotenti (`ALTER TABLE ... ADD COLUMN`) eseguite all'avvio dell'applicazione.
