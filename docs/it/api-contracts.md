# Contratti API

TuneCamp espone un'API RESTful per la comunicazione tra la webapp e il backend, oltre a endpoint dedicati per ActivityPub e per il protocollo Subsonic. La specifica OpenAPI completa è contenuta in [openapi.yml](../openapi.yml).

## Autenticazione

La maggior parte degli endpoint richiede un **JWT (JSON Web Token)** nell'intestazione `Authorization`:

```
Authorization: Bearer <token>
```

È possibile ottenere un token inviando le proprie credenziali tramite una richiesta `POST` a `/api/auth/login`.

---

## Endpoint Principali

### Autenticazione (`/api/auth`)

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| `POST` | `/api/users/register` | Registra un nuovo utente |
| `POST` | `/api/auth/login` | Autentica l'utente e restituisce un JWT |
| `GET`  | `/api/auth/status` | Restituisce la sessione corrente e il profilo utente |

### Catalogo Musicale (`/api/catalog`, `/api/tracks`, `/api/albums`)

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| `GET`  | `/api/albums` | Elenca tutti gli album locali. Restituisce `status` (`draft` \| `published`) e `is_release` (booleano) per distinguere i contenuti della libreria dalle release ufficiali |
| `GET`  | `/api/albums/:id` | Dettagli dell'album, inclusa la lista delle tracce |
| `GET`  | `/api/artists` | Elenca tutti gli artisti |
| `POST` | `/api/tracks` | Crea una traccia (import). Accetta un booleano opzionale `localize`: se impostato su un servizio rippabile (`bandcamp`/`youtube`/`soundcloud`) con un `url` sorgente, il server scarica l'audio in un file locale durevole in background dopo la risposta |
| `GET`  | `/api/tracks/:id` | Metadati della traccia |
| `GET`  | `/api/tracks/:id/stream` | Stream audio binario (supporta l'intestazione `Range` per le tracce cloud) |
| `GET`  | `/api/tracks/:id/download` | Scarica il file audio locale di una singola traccia |
| `POST` | `/api/tracks/:id/localize` | Solo admin: scarica l'audio di una traccia esterna in un file locale durevole |
| `GET`  | `/api/albums/:id/download` | Scarica uno ZIP dei file audio locali dell'album (esclude le tracce streaming/linkate) |
| `GET`  | `/api/releases/:id/download` | Scarica uno ZIP dei file audio locali di una release. Risolve id numerico o slug; le release private sono limitate a proprietario/admin |
| `GET`  | `/api/waveform/:id` | Dati della forma d'onda per la visualizzazione grafica |
| `GET`  | `/api/releases/:id/artwork/:filename` | Serve in modo sicuro gli artwork aggiuntivi delle release |

### Pagamenti e Monetizzazione (`/api/payments`)

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| `POST` | `/api/payments/stripe/create-session` | Crea una sessione di Stripe Checkout per acquisti in valuta fiat |
| `POST` | `/api/payments/stripe/create-trackcap-session` | Crea una sessione di Stripe Checkout per acquistare slot aggiuntivi per il caricamento di tracce |
| `GET`  | `/api/payments/onramp-config` | Configurazione di Stripe Crypto Onramp |
| `POST` | `/api/payments/verify` | Verifica una transazione on-chain (ETH/USDC) su Base |
| `GET`  | `/api/payments/download/:trackId?code=...` | Scarica una traccia acquistata tramite codice di sblocco |
| `GET`  | `/api/payments/rate/USD` | Tasso di cambio corrente ETH/USD |

### Archiviazione e Cloud (`/api/storage`)

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| `GET`  | `/api/storage/gdrive/auth` | Avvia il flusso OAuth2 di Google Drive |
| `GET`  | `/api/storage/gdrive/files` | Elenca file e cartelle su Google Drive |
| `POST` | `/api/storage/gdrive/import` | Importa un file di Drive come riferimento `gdrive://` |
| `POST` | `/api/storage/gdrive/localize/:id` | Scarica permanentemente un file cloud sul server locale |

### Metadati e Ricerca Esterna (`/api/metadata`)

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| `GET`  | `/api/metadata/search?q=...` | Cerca i metadati dell'album tra i provider esterni (MusicBrainz, Discogs, iTunes, TheAudioDB) |
| `GET`  | `/api/metadata/lyrics?artist=...&title=...` | Recupera i testi delle canzoni tramite Lyrics.ovh |
| `POST` | `/api/metadata/apply` | Applica i metadati selezionati a una traccia locale |

### Social, Commenti e Post (`/api/artists`, `/api/comments`, `/api/ap`)

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| `GET`  | `/api/artists/:id/posts` | Elenca i post pubblici di un artista |
| `POST` | `/api/admin/posts` | Crea un nuovo post (solo per amministratori) |
| `GET`  | `/api/comments/track/:trackId` | Elenca i commenti per una traccia specifica |
| `POST` | `/api/comments/track/:trackId` | Aggiunge un commento (richiede autenticazione) |
| `GET`  | `/api/ap/timeline/:artistId` | Attività recente degli attori seguiti |
| `GET`  | `/api/ap/users/:slug` | Profilo ActivityPub (actor) per un utente locale |
| `POST` | `/api/ap/inbox` | Riceve messaggi ActivityPub remoti in entrata |
| `POST` | `/api/releases/:id/report` | Segnala una release per violazione di copyright o contenuti inappropriati |
| `GET`  | `/api/admin/reports` | Elenca tutte le segnalazioni attive di release (solo amministratori) |
| `DELETE` | `/api/admin/reports/:id` | Risolve o archivia una segnalazione (solo amministratori) |

### Amministrazione (`/api/admin`)

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| `GET`  | `/api/admin/system/users` | Elenca gli utenti registrati (solo per amministratori) |
| `POST` | `/api/admin/system/rescan` | Avvia una scansione completa della libreria |
| `POST` | `/api/admin/upload/additional-artworks` | Carica più artwork/booklet aggiuntivi per una release (solo admin/artisti) |
| `GET`  | `/api/admin/stats` | Statistiche di utilizzo del server e del database |
| `GET`  | `/api/admin/system/resources` | Snapshot in tempo reale delle risorse del processo/host — CPU, memoria, RAM dell'host, dimensioni del database SQLite e attività in background in esecuzione (solo per amministratori root) |
| `GET`  | `/api/admin/storage/overview` | Utilizzo del disco a livello di istanza e suddivisione per utente (solo per amministratori root) |

> L'acquisizione di contenuti P2P (Soulseek, BitTorrent, yt-dlp) è stata spostata dal backend all'[app desktop Sidecamp](./sidecamp.md); i precedenti endpoint `/api/admin/torrents*` non esistono più.

### Radio (`/api/radio`)

Una singola stazione sempre attiva che trasmette in streaming il catalogo dell'istanza. L'avvio/arresto è riservato agli amministratori; lo stream e i feed sono pubblici.

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| `GET`  | `/api/radio` | Stato corrente della stazione (traccia in riproduzione, numero di ascoltatori) |
| `POST` | `/api/radio/start` | Avvia la stazione (solo per amministratori) |
| `POST` | `/api/radio/stop` | Ferma la stazione (solo per amministratori) |
| `GET`  | `/api/radio/stream.m3u` | Playlist M3U per lettori esterni |
| `GET`  | `/api/radio/feed.rss` | Feed RSS della stazione |
| `GET`  | `/api/radio/hls/:file` | Playlist/segmenti HLS per la riproduzione nel browser |

---

## Protocolli di Terze Parti

### API Subsonic (`/rest`)

TuneCamp implementa il protocollo Subsonic (v1.16.1) per la compatibilità con i client mobili esistenti come DSub, Symfonium, Tempo e Substreamer.

- Percorso di base: `/rest/*.view`
- I metodi supportati includono: `getAlbumList`, `getMusicDirectory`, `stream` e altri.

Consulta [SUBSONIC.md](./subsonic.md) per la tabella di compatibilità completa.

### Model Context Protocol (`/api/mcp`)

TuneCamp implementa il protocollo MCP in modo che i client IA esterni possano interrogare il catalogo e le statistiche del server.

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| `GET`  | `/api/mcp/sse` | Apre il canale asincrono SSE. Richiede autenticazione `Bearer tc_...` |
| `POST` | `/api/mcp/message` | Invia una richiesta JSON-RPC dal client al server |

Vedi [mcp-setup-guide.md](./mcp-setup-guide.md) per la configurazione del client.

---

## Formato delle Risposte

Tutte le risposte delle API (eccetto gli stream audio) sono in formato **JSON**. In caso di errore, il server restituisce un codice di stato HTTP appropriato e un oggetto di errore:

```json
{
  "error": "Messaggio di errore descrittivo"
}
```
