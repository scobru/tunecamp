# Modelli Dati

TuneCamp utilizza **SQLite** come motore di database relazionale per la gestione dei metadati musicali, degli utenti e delle interazioni social.

## Schema del Database

### Entità Core (Libreria Musicale)

- **`artists`**: Memorizza le informazioni sugli artisti (nome, biografia, immagine, identificatori federati).
- **`albums`**: Rappresenta le release (titolo, artista, anno, copertina).
- **`tracks`**: Le singole tracce audio (titolo, album, numero traccia, durata, percorso file, bitrate).
- **`genres`**: Categorizzazione musicale.

### Utenti e Social

- **`admin`**: Tabella per gli amministratori locali del server.
- **`gun_users`**: Integrazione con GunDB per l'identità decentralizzata.
- **`followers`**: Relazioni "segui" tra utenti locali e remoti.
- **`posts`** / **`ap_notes`**: Messaggi e attività nel Fediverso.
- **`likes`** / **`starred_items`**: Preferenze degli utenti.

### Federazione (ActivityPub)

- **`remote_actors`**: Cache dei profili utente remoti scoperti tramite ActivityPub.
- **`remote_content`**: Copia locale dei metadati per contenuti federati (es. post di altri server).

### Funzionalità Avanzate

- **`playlists`** / **`playlist_tracks`**: Gestione delle liste di riproduzione degli utenti.
- **`play_history`**: Registro degli ascolti per statistiche e raccomandazioni.
- **`unlock_codes`**: Codici di accesso per contenuti protetti o a pagamento.
- **`torrents`** / **`soulseek_downloads`**: Integrazione con protocolli di condivisione file per il recupero di contenuti.

## Relazioni Principali

1. **Uno-a-Molti**: Un `artist` ha molti `albums`. Un `album` ha molte `tracks`.
2. **Molti-a-Molti**: Una `playlist` contiene molte `tracks` tramite la tabella pivot `playlist_tracks`.
3. **Federazione**: Un `post` locale può essere collegato a un attore in `remote_actors`.

## Accesso ai Dati

La logica di accesso ai dati è incapsulata nei **Repository** (`src/server/repositories/`), che utilizzano query SQL dirette o query builder leggeri per interagire con `better-sqlite3`.

## Migrazioni

Il database viene inizializzato e aggiornato automaticamente in `src/server/database.ts`, che contiene gli script DDL per la creazione delle tabelle e degli indici necessari all'avvio dell'applicazione.
