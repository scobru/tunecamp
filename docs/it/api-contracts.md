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
| `POST` | `/api/auth/register` | Registra un nuovo utente |
| `POST` | `/api/auth/login` | Autentica l'utente e restituisce un JWT |
| `GET`  | `/api/auth/me` | Restituisce il profilo dell'utente corrente |

### Catalogo Musicale (`/api/catalog`, `/api/tracks`, `/api/albums`)

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| `GET`  | `/api/albums` | Elenca tutti gli album locali. Restituisce `status` (`draft` \| `published`) e `is_release` (booleano) per distinguere i contenuti della libreria dalle release ufficiali |
| `GET`  | `/api/albums/:id` | Dettagli dell'album, inclusa la lista delle tracce |
| `GET`  | `/api/artists` | Elenca tutti gli artisti |
| `GET`  | `/api/tracks/:id` | Metadati della traccia |
| `GET`  | `/api/tracks/:id/stream` | Stream audio binario (supporta l'intestazione `Range` per le tracce cloud) |
| `GET`  | `/api/tracks/:id/waveform` | Dati della forma d'onda per la visualizzazione grafica |

### Pagamenti e Monetizzazione (`/api/payments`)

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| `POST` | `/api/payments/stripe/create-session` | Crea una sessione di Stripe Checkout per acquisti in valuta fiat |
| `POST` | `/api/payments/onramp-session` | Crea una sessione di Stripe Crypto Onramp |
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
| `POST` | `/api/metadata/maintenance/apply-track` | Applica i metadati selezionati a una traccia locale |

### Social, Commenti e Post (`/api/social`, `/api/comments`, `/api/activitypub`)

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| `GET`  | `/api/posts` | Elenca i post pubblici degli artisti |
| `POST` | `/api/posts` | Crea un nuovo post (solo per amministratori) |
| `GET`  | `/api/comments/:trackId` | Elenca i commenti per una traccia specifica |
| `POST` | `/api/comments` | Aggiunge un commento (richiede autenticazione) |
| `GET`  | `/api/social/feed` | Post recenti degli attori seguiti |
| `GET`  | `/api/activitypub/actor/:username` | Profilo ActivityPub per un utente locale |
| `POST` | `/api/activitypub/inbox` | Riceve messaggi ActivityPub remoti in entrata |

### Amministrazione (`/api/admin`)

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| `GET`  | `/api/admin/users` | Elenca gli utenti registrati (solo per amministratori) |
| `POST` | `/api/admin/scan` | Avvia una scansione della libreria |
| `POST` | `/api/admin/rescan` | Forza una scansione profonda completa |
| `GET`  | `/api/admin/stats` | Statistiche di utilizzo del server e del database |
| `GET`  | `/api/admin/system/resources` | Snapshot in tempo reale delle risorse del processo/host — CPU, memoria, RAM dell'host, dimensioni del database SQLite e attività in background in esecuzione (solo per amministratori root) |
| `GET`  | `/api/admin/storage/overview` | Utilizzo del disco a livello di istanza e suddivisione per utente (solo per amministratori root) |
| `GET`  | `/api/admin/torrents` | Elenca i torrent attivi e completati |
| `POST` | `/api/admin/torrents/add` | Aggiunge un link magnet alla coda di download |
| `DELETE` | `/api/admin/torrents/:infoHash` | Rimuove un torrent e facoltativamente i relativi dati scaricati |

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
