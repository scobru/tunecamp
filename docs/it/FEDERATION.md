# Federazione e Decentralizzazione in TuneCamp

TuneCamp sfrutta principalmente due tecnologie per abilitare un ecosistema musicale decentralizzato: **ActivityPub** per la federazione sociale e la **scoperta federata tramite HTTP/NodeInfo** per trovare altre istanze. Offre inoltre piena compatibilità con l'**API Subsonic** per i client mobili e desktop.

## Scoperta Federata (Gossip HTTP / NodeInfo)

TuneCamp individua le altre istanze tramite un meccanismo di **gossip su HTTP** — non esiste un relay centrale né un registro condiviso. Ciascuna istanza effettua una scansione a partire da un gruppo di istanze seed (i siti TuneCamp seguiti tramite ActivityPub più quelli elencati in `TUNECAMP_FEDERATION_SEEDS`), verifica che ogni peer corrisponda a un'istanza TuneCamp attiva leggendo il suo NodeInfo e ne memorizza i dati nel database SQLite locale (`federated_instances`). Implementato in `src/server/modules/network/federated-discovery.service.ts`.

> **Note storiche**: le versioni precedenti utilizzavano il grafo decentralizzato **Zen** per le comunicazioni tra istanze, e ancora prima per l'identità utente (coppie di chiavi SEA), autenticazione Zen-first, derivazione dei wallet e roaming tra istanze. **Zen è stato rimosso del tutto** (PR #369/#370/#372): l'autenticazione avviene tramite nome utente/password (JWT), la scoperta si basa sul gossip HTTP sopra descritto e lo scambio dei cataloghi avviene direttamente tramite chiamate HTTP. La dipendenza `zen` e tutte le variabili d'ambiente `TUNECAMP_ZEN_*` sono state eliminate.

### Aspetti Chiave

- **Scansione basata su Seed**: la scoperta di nuove istanze inizia dagli attori TuneCamp seguiti tramite ActivityPub e da `TUNECAMP_FEDERATION_SEEDS`, propagandosi poi a cascata (con limiti sulla profondità/ampiezza e rimozione delle istanze non più attive).
- **Controllo di Attività (Liveness)**: un peer viene aggiunto solo se risponde confermando di essere un'istanza TuneCamp attiva (verifica del tipo tramite NodeInfo), non semplicemente restituendo uno stato HTTP 200.
- **Scoperta Musicale**: la pagina "Network" legge l'elenco delle istanze federate, quindi ne scarica i cataloghi direttamente tramite HTTP (`/api/catalog`), salvandoli in cache con strategia stale-while-revalidate.
- **Federazione delle tracce peer** (opt-in): quando un'istanza abilita *Federate Peer Tracks*, le sue tracce peer attualmente condivise viaggiano in `/api/catalog/full` e compaiono sulle pagine Network remote (con badge `PEER`), riproducibili — e, se i download sono consentiti, importabili — tra le istanze. Queste voci sono effimere e usano una finestra di cache breve, così spariscono rapidamente quando il peer si disconnette. Vedi [Condivisione Peer](./sidecamp.md#federare-le-tracce-peer-tra-le-istanze).
- **Ricerca peer tra istanze** (opt-in): sotto lo stesso flag *Federate Peer Tracks*, la ricerca globale di un utente autenticato fa fan-out lato server verso le istanze federate note (limite 10, in parallelo, timeout 3s, protetta da SSRF) e unisce le tracce corrispondenti dei loro peer connessi, taggate con `origin`. **Singolo hop**; gli hit remoti si riproducono dall'endpoint pubblico `federated-stream` dell'origine (ricerca + streaming, nessun download). Esposta come `GET /api/peers/federated-search`.
- **Seguire con un clic**: un amministratore può seguire un'istanza direttamente digitando il suo URL.

### Endpoint Pubblici

- `GET /api/community/instance` — Descrittore di questa istanza.
- `GET /api/community/peers` — I peer conosciuti (la base per il gossip).
- `GET /api/community/sites` — Elenco aggregato dei siti rilevabili (locali + federati + ActivityPub). Abilitato a livello CORS per directory esterne.
- `POST /api/community/register` — auto-registrazione: invia l'URL della tua istanza a un'istanza directory e appari immediatamente, senza attendere il prossimo crawl (ogni 6 ore). Vedi sotto.

### Auto-registrazione presso una directory

Invece di attendere fino a 6 ore che il gossip raggiunga un'istanza directory, gli admin possono auto-registrarsi:

```http
POST /api/community/register
Content-Type: application/json

{ "url": "https://tua-istanza.esempio.com" }
```

L'istanza directory:
1. Verifica il tuo URL tramite NodeInfo (`/.well-known/nodeinfo`) per confermare che sia un'istanza TuneCamp raggiungibile.
2. Memorizza subito i metadati — la tua istanza appare immediatamente in `GET /api/community/sites`.

**Risposte:**

| Stato | Significato |
| :----- | :------ |
| `200 OK` | Registrata. Appare subito in `/api/community/sites`. |
| `400` | Campo `url` mancante o non valido. |
| `422` | L'URL non è un'istanza TuneCamp raggiungibile (controllo NodeInfo fallito). |
| `429` | Rate limit superato — 1 registrazione per IP all'ora. Header `Retry-After` incluso. |

L'endpoint è pubblico (nessuna autenticazione richiesta) e abilitato a livello CORS, così il [sito web della community](https://github.com/scobru/tunecamp-website) può chiamarlo direttamente dal browser. Il rate limit è applicato per IP per prevenire abusi.

### Configurazione

- `TUNECAMP_FEDERATION_SEEDS` (backend): URL dei nodi seed (separati da virgola o spazio) per avviare il processo di scoperta. Opzionale — i siti TuneCamp seguiti via ActivityPub fungono anch'essi da seed.

---

## Network DIG: Scoperta Cross-Istanza

"Dig" (crate digging) normalmente incrocia il grafo dei collezionisti di **Bandcamp**: da una release seme, trova chi la colleziona e cos'altro possiedono quei collezionisti. **Network DIG** esegue lo stesso incrocio, ma sugli utenti *di questo network TuneCamp* — "chi qui ha messo like a questa release, e cos'altro ha messo like" — usando l'elenco dei peer federati sopra descritto per estendere la query a ogni istanza conosciuta. Implementato in `src/server/modules/catalog/dig.service.ts`.

### Come funziona la correlazione

Due istanze non possono confrontare gli id di riga del proprio database, quindi l'identità cross-istanza di una release è:

1. Il suo `external_id`, quando la release è stata associata a una fonte esterna (Bandcamp, MusicBrainz, ...) tramite match/autofill dei metadati — corrispondenza esatta.
2. In alternativa, una chiave normalizzata `titolo + artista` (accenti e punteggiatura rimossi) — un fallback fuzzy, unica opzione per una release che esiste solo su TuneCamp, senza controparte esterna.

Il seme stesso è una release della *tua* libreria (`albumId` o `trackId`) — non un URL Bandcamp — così anche una release esclusiva TuneCamp può essere usata come punto di partenza.

### Privacy

- Le risposte **non includono mai username** — solo conteggi aggregati.
- Una release co-starrata viene restituita solo se **almeno 2 utenti distinti** hanno messo like sia a essa sia al seme (`MIN_CO_STARRERS`), così il like di un singolo utente non può essere isolato dalla risposta aggregata di un'istanza piccola.
- Quando si risponde a un **peer**, vengono considerate solo le voci di catalogo con `is_release = 1 AND status = 'released' AND visibility = 'public'`: release private/bozza/non pubblicate e i relativi conteggi di like non escono mai dall'istanza, anche se qualcuno le ha messe like.
- Ogni istanza fa **opt-in esplicito** (impostazione `digNetworkOptIn`, disattivata di default) prima di rispondere alle richieste di altre istanze. La disattivazione impedisce solo di *rispondere* — l'istanza può comunque eseguire dig di rete in locale e interrogare i peer che hanno fatto opt-in.

### Endpoint Pubblico

- `POST /api/community/dig-lookup` — `{ externalId?, title, artist }` → `{ results: [{ externalId, title, artist, coverUrl, score }] }`. Pubblico, protetto da opt-in (404 se l'istanza non ha attivato la funzione), rate-limited a 30 richieste/minuto/IP.

### Avviare un network dig

`POST /api/dig/run` (autenticato) accetta:

```json
{ "source": "network", "albumId": 123 }
```

oppure `"trackId"` al posto di `"albumId"`. Il server risolve l'identità del seme, aggrega localmente i propri `starred_items`, estende la query `dig-lookup` a ogni peer conosciuto (concorrenza limitata, protetta da SSRF, timeout 5s — un peer irraggiungibile o non opt-in contribuisce semplicemente con zero risultati) e unisce tutto in un'unica classifica. Confronta con `{ "releaseUrl": "https://...bandcamp.com/album/...", "strategy": "fast" | "balanced" | "deep" }` per il dig originale sui collezionisti Bandcamp.

### Configurazione

- `digNetworkOptIn` (impostazione istanza, via `PUT /api/admin/settings`): se questa istanza risponde alle richieste `dig-lookup` di altre istanze. Disattivata di default.

---

## ActivityPub: Integrazione con il Fediverso

ActivityPub consente a TuneCamp di comunicare con altre piattaforme quali Mastodon, Pleroma, Funkwhale e Lemmy.

### Aspetti Chiave

- **Profili Artista**: Ogni artista su TuneCamp è un attore di tipo "Person" in ActivityPub.
- **Account Ascoltatore**: *Anche* ogni account è un attore "Person" su `/users/{username}`, con o senza profilo artista: l'essere seguibili dal Fediverso non dipende dai permessi di pubblicazione. L'attore di un ascoltatore è un profilo spoglio: gli ascoltatori non possono pubblicare (vedi `ROLES.md`), quindi da lì non viene mai trasmesso nulla.
- **Follower e Preferiti**: Gli utenti di altre istanze del Fediverso possono seguire gli artisti di TuneCamp e mettere "mi piace" o aggiungere ai preferiti i loro post e pubblicazioni.
- **Annunci (Broadcast)**: Quando un artista pubblica una nuova release o un post, TuneCamp invia un'attività "Create Note" a tutti i follower.
- **Interoperabilità**: TuneCamp supporta WebFinger e i box di inbox/outbox standard di ActivityPub.

### Dettagli di Implementazione

- **Chiavi**: Coppie di chiavi RSA a 4096 bit vengono generate automaticamente per ogni artista. Anche gli account ascoltatore ricevono la propria coppia di chiavi, scritta alla registrazione, al login con password o FID (`ensureUserKeys`) oppure — nel caso dell'SSO FID — derivata in modo deterministico dall'`apSeed` (vedi `FID-IDENTITY.md`).
- **L'attore esiste solo quando esistono le sue chiavi**: il dispatcher restituisce `null` per un account senza `ap_public_key`, quindi sia `/users/{handle}` sia il suo record WebFinger rispondono 404. Per questo la webapp interroga il server invece di indovinare l'handle: `GET /api/users/me/fediverse` restituisce `{ hasActor, handle, actorUri }` e la pagina Profilo nasconde il pannello Fediverse Identity quando `hasActor` è `false`.
- **Allegati**: Gli annunci trasmessi includono allegati di tipo "Audio" (link diretti allo streaming) e "Image" (copertina).
- **URL Pubblico**: La federazione richiede la corretta configurazione di `TUNECAMP_PUBLIC_URL` con protocollo `https`.

### Configurazione

- `TUNECAMP_PUBLIC_URL`: Richiesto per la federazione.
- **Relay ActivityPub** (opzionale): Per trasmettere annunci oltre i propri follower diretti, imposta l'URL del relay a runtime dal pannello di amministrazione (salvato nell'impostazione `relayUrl`). **Non** si tratta di una variabile d'ambiente.

### Risoluzione dei Problemi: "Public key not found" all'invio

I server remoti (es. Mastodon) memorizzano la chiave pubblica di un attore la prima volta che lo rilevano, continuando a verificare le firme a partire da quella copia memorizzata. Se in seguito la chiave dell'attore cambia — o se lo stesso URL `/users/{nomeutente}` serviva in precedenza un'identità *diversa* (ad esempio un **account ascoltatore prima che diventasse artista**) — il server remoto mantiene la chiave non più valida e rifiuta qualsiasi attività con l'errore `401 {"error":"Public key not found for key .../users/{nomeutente}#main-key"}`.

Per risolvere questo problema, vai in **Admin → Identity → scheda dell'artista → "Refresh federation"** (`POST /api/admin/artists/:id/refresh-identity`). Questo assicura che l'artista possieda una coppia di chiavi RSA valida e trasmette una richiesta `Update(Person)` firmata ai follower e al relay, forzando i nodi remoti a scaricare nuovamente il descrittore dell'attore aggiornando la chiave memorizzata. L'azione è idempotente e sicura da rieseguire.

---

## Feed RSS / Atom

Oltre ad ActivityPub, TuneCamp può seguire semplici **feed RSS/Atom** (podcast, stream Owncast, blog) in modo che i loro elementi compaiano all'interno dei contenuti federati.

- **Seguire un feed**: `POST /api/admin/network/rss/follow` specificando l'URL del feed.
- **Archiviazione**: un feed seguito viene registrato come attore remoto con `type = 'rss'`; ogni elemento diventa una riga in `remote_content`.
- **Aggiornamento**: i feed sono aggiornati dal servizio RSS (`src/server/modules/network/rss.service.ts`), in maniera indipendente dal recupero dell'outbox di ActivityPub.

---

## Compatibilità con Funkwhale

TuneCamp è compatibile con le istanze **Funkwhale** per la federazione musicale specifica.

### Come Funziona

- **NodeInfo**: TuneCamp espone metadati all'indirizzo `/.well-known/nodeinfo`, includendo campi compatibili con Funkwhale (`library.federationEnabled`, `supportedUploadExtensions`, `funkwhaleVersion`).
- **Librerie di Federazione**: `GET /api/v1/federation/libraries` restituisce il catalogo musicale di TuneCamp nel formato richiesto da Funkwhale.
- **API NodeInfo 2.0**: `GET /api/v1/instance/nodeinfo/2.0` fornisce i metadati dell'istanza per la scoperta in stile Funkwhale.
- **Tipi di Attore**: Gli artisti sono esposti come `["Person", "Artist", "MusicArtist"]` utilizzando estensioni del namespace di Funkwhale.
- **Allegati Audio**: Gli annunci delle release includono oggetti `Audio` con proprietà `funkwhale:bitrate` e `funkwhale:duration`.

---

## API Subsonic: Compatibilità con i Client

TuneCamp espone un'API REST **Subsonic completa** su `/rest` (versione API 1.16.1), consentendo il collegamento da qualsiasi client compatibile.

### Metodi di Autenticazione

| Metodo | Formato | Descrizione |
| :--- | :--- | :--- |
| Testo in chiaro | `p=password` | Password in chiaro nella query |
| Codificato esadecimale | `p=enc:hex` | Password codificata in esadecimale |
| Token + Salt | `t=md5(password+salt)&s=salt` | Autenticazione sicura basata su token |

### Scrobbling e Statistiche

Quando un client Subsonic registra la riproduzione di una traccia (`scrobble.view`), TuneCamp registra l'ascolto nel database SQLite locale (tabella `play_history`). Tutte le statistiche di ascolto e riproduzione sono memorizzate sul server locale.

---

## Riepilogo Architettura

| Funzionalità | Tecnologia | Ambito |
| :--- | :--- | :--- |
| Seguire gli Artisti | ActivityPub | Esterno (Mastodon, ecc.) |
| Mi Piace / Preferiti | ActivityPub | Esterno (Mastodon, ecc.) |
| Notifiche delle Release | ActivityPub | Esterno (Mastodon, ecc.) |
| Federazione Funkwhale | ActivityPub | Esterno (Funkwhale) |
| Scoperta delle Istanze | Gossip HTTP / NodeInfo federato | Interno (Nodi TuneCamp) |
| Network DIG (crate digging sugli utenti del network) | HTTP federato (`/api/community/dig-lookup`), opt-in | Interno (Nodi TuneCamp) |
| Streaming su Dispositivi Mobili | API Subsonic | Esterno (Qualsiasi client) |
| Stellati / Preferiti | API Subsonic | Locale (per utente) |
