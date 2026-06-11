# Architettura Backend

Il backend di TuneCamp è un'applicazione Node.js costruita con Express, progettata per essere federata, decentralizzata e orientata ai contenuti musicali.

## Stack Tecnologico

- **Framework**: Express.js (TypeScript)
- **Database**: SQLite3 (`better-sqlite3`)
- **Protocollo Sociale**: ActivityPub (tramite Fedify)
- **Rete P2P**: Zen (isolato in un worker thread, vedi sotto)
- **Multimedia**: FFmpeg per transcodifica e metadati

## Componenti Principali

### 1. Sistema di Database (`core/database.ts`)
Gestisce la persistenza locale tramite SQLite. Le tabelle includono:
- `artists`, `albums`, `tracks`: Core della libreria musicale.
- `remote_actors`, `remote_content`: Cache per la federazione ActivityPub.
- `unlock_codes`: Gestione degli accessi basata su chiavi.
- `chat_messages`: Cronologia della chat community.

### 2. Integrazione Zen in Worker Thread (`modules/network/zendb.service.ts`, `zen.worker.ts`)
Zen è usato per il signaling/discovery delle istanze della community e per l'identità crittografica (SEA). Storicamente i freeze dell'event loop di Zen bloccavano l'intero server HTTP (errori 504), quindi Zen gira **esclusivamente in un `worker_thread`** — il main thread non importa mai il modulo `zen`.

- `zendb.service.ts` (main thread) parla col worker via RPC `postMessage` con timeout.
- Un **heartbeat** (ping ogni 30s) supervisiona il worker: dopo 3 mancate risposte il worker viene considerato congelato, terminato e **respawnato con backoff** (1s → 5s → 15s → 60s).
- Alla re-init dopo un respawn, l'istanza si ri-registra da sola nel registry della community.

### 3. Federazione ActivityPub (`modules/fedify/`, `modules/activitypub/`)
Permette a TuneCamp di interagire con altre istanze del Fediverso (come Mastodon, Funkwhale o altre istanze TuneCamp).
- Implementa Actor, Note, e altri oggetti ActivityPub.
- Gestisce la consegna dei messaggi e il recupero dei contenuti remoti.

### 4. Modulo Catalog (`modules/catalog/`)
Responsabile della scansione e dell'organizzazione della musica locale.
- **Scanner**: Analizza le cartelle per nuovi file audio. Per garantire il controllo granulare, lo scanner crea album in modalità **Draft (Bozza)** nella libreria locale. Questi contenuti non sono visibili pubblicamente finché non vengono promossi manualmente a **Release Formale** tramite la Dashboard Admin.
- **Metadata**: Estrae tag (ID3, Vorbis), genera waveform e integra provider esterni (MusicBrainz, Discogs, iTunes, Lyrics.ovh) per l'arricchimento dei dati e dei testi.

### 5. Sicurezza e Autenticazione (`modules/auth/auth.service.ts`, `middleware/auth.ts`)
- Gestione utenti locali con password bcrypt.
- Autenticazione tramite JWT (secret da env, file `.jwt-secret`, o generato al primo avvio).
- Controllo accessi basato sui ruoli: Root Admin, Admin, Artist/User (vedi [ROLES.md](./ROLES.md)).

### 6. Community: Chat e Live (`modules/chat/`, `modules/live/`)
- **Chat**: chat di istanza standalone con cronologia persistente in SQLite.
- **Live**: registry in-memory delle sessioni live; l'audio viaggia P2P via WebRTC (Trystero) tra i browser, il server non tocca mai il media.

### 7. Integrazione Blockchain (`modules/publishing/`, routes `api/payments.ts`)
Interfaccia con gli smart contract per gestire prezzi, pagamenti e sblocchi di contenuti.

## Affidabilità e Monitoring

- L'endpoint `GET /health` è registrato prima del middleware di federazione, così un'integrazione bloccata non può oscurarlo (usato dall'`HEALTHCHECK` Docker).
- Crash reporting Sentry opt-in via `SENTRY_DSN` (vedi [monitoring.md](./monitoring.md)).

## Flussi di Dati

1. **Scansione**: Lo `Scanner` rileva un file → il servizio metadata estrae i dati → il repository salva nel DB.
2. **Streaming**: Richiesta API → verifica permessi → stream del file (con transcodifica FFmpeg se necessario).
3. **Social**: Nuovo post → il servizio ActivityPub crea l'oggetto → Fedify lo consegna agli attori remoti.

## API REST

Gli endpoint sono suddivisi in rotte tematiche in `src/server/routes/`:
- `/api/tracks`, `/api/albums`, `/api/artists`: Gestione libreria.
- `/api/admin`: Funzionalità di amministrazione.
- `/api/ap`: Endpoint per la federazione ActivityPub.
- `/api/chat`, `/api/live`: Community chat e sessioni live.
- `/rest`: Compatibilità con il protocollo Subsonic/OpenSubsonic.
- `/health`: Health check.
