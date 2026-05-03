# Architettura Backend

Il backend di TuneCamp è un'applicazione Node.js costruita con Express, progettata per essere federata, decentralizzata e orientata ai contenuti musicali.

## Stack Tecnologico

- **Framework**: Express.js (TypeScript)
- **Database**: SQLite3 (`better-sqlite3`)
- **Protocollo Sociale**: ActivityPub (tramite Fedify)
- **Rete P2P**: Zen.js (integrazione IPFS/GunDB)
- **Multimedia**: FFmpeg per transcodifica e metadati

## Componenti Principali

### 1. Sistema di Database (`database.ts`, `zendb.ts`)
Gestisce la persistenza locale tramite SQLite. Le tabelle includono:
- `artists`, `albums`, `tracks`: Core della libreria musicale.
- `remote_actors`, `remote_content`: Cache per la federazione ActivityPub.
- `unlock_codes`: Gestione degli accessi basata su chiavi.

### 2. Federazione ActivityPub (`fedify.ts`, `activitypub.ts`)
Permette a TuneCamp di interagire con altre istanze del Fediverso (come Mastodon o altre istanze TuneCamp).
- Implementa Actor, Note, e altri oggetti ActivityPub.
- Gestisce la consegna dei messaggi e il recupero dei contenuti remoti.

### 3. Modulo Catalog (`modules/catalog/`)
Responsabile della scansione e dell'organizzazione della musica locale.
- **Scanner**: Analizza le cartelle per nuovi file audio.
- **Metadata**: Estrae tag (ID3, Vorbis) e genera waveform.

### 4. Sicurezza e Autenticazione (`auth.ts`, `middleware/auth.ts`)
- Gestione utenti locali.
- Autenticazione tramite JWT.
- Controllo accessi basato sui ruoli (`admin`, `user`).

### 5. Integrazione Blockchain (`price.ts`, `publishing.ts`)
Interfaccia con gli smart contract per gestire prezzi, pagamenti e sblocchi di contenuti.

## Flussi di Dati

1. **Scansione**: Lo `Scanner` rileva un file -> `metadata.ts` estrae i dati -> `track.repository.ts` salva nel DB.
2. **Streaming**: Richiesta API -> `tracks.ts` verifica permessi -> Stream del file (con transcodifica FFmpeg se necessario).
3. **Social**: Nuovo post -> `activitypub.ts` crea oggetto -> `fedify.ts` lo invia agli attori remoti.

## API REST

Gli endpoint sono suddivisi in rotte tematiche in `src/server/routes/`:
- `/api/tracks`: Gestione tracce audio.
- `/api/albums`: Gestione album e release.
- `/api/admin`: Funzionalità di amministrazione.
- `/api/activitypub`: Endpoint per la federazione.
- `/api/subsonic`: Compatibilità con il protocollo Subsonic.
