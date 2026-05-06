# Contratti API

TuneCamp espone un'API RESTful per la comunicazione tra la webapp e il backend, oltre a endpoint specifici per ActivityPub e il protocollo Subsonic.

## Autenticazione

La maggior parte degli endpoint richiede l'autenticazione tramite **JWT (JSON Web Token)** nell'header `Authorization`:
`Authorization: Bearer <token>`

---

## Endpoint Principali

### Autenticazione (`/api/auth`)
- `POST /api/auth/register`: Registra un nuovo utente.
- `POST /api/auth/login`: Autentica un utente e restituisce il token JWT.
- `GET /api/auth/me`: Restituisce le informazioni dell'utente corrente.

### Catalogo Musicale (`/api/catalog`, `/api/tracks`, `/api/albums`)
- `GET /api/albums`: Elenco di tutti gli album locali.
- `GET /api/albums/:id`: Dettagli di un album specifico, inclusa la lista tracce.
- `GET /api/artists`: Elenco di tutti gli artisti.
- `GET /api/tracks/:id`: Metadati di una traccia specifica.
- `GET /api/tracks/:id/stream`: Stream binario del file audio.
- `GET /api/tracks/:id/waveform`: Dati per la visualizzazione della forma d'onda.

### Metadati e Ricerca Esterna (`/api/metadata`)
- `GET /api/metadata/search?q=...`: Ricerca metadati album su provider esterni (MusicBrainz, Discogs, iTunes, TheAudioDB).
- `GET /api/metadata/lyrics?artist=...&title=...`: Recupera il testo di una canzone (via Lyrics.ovh).
- `POST /api/metadata/maintenance/apply-track`: Applica metadati selezionati a una traccia locale.

### Social e Federazione (`/api/social`, `/api/activitypub`)
- `GET /api/social/feed`: Post recenti dagli attori seguiti.
- `POST /api/social/post`: Crea un nuovo post nel Fediverso.
- `GET /api/activitypub/actor/:username`: Profilo ActivityPub di un utente locale.
- `POST /api/activitypub/inbox`: Endpoint per la ricezione di messaggi remoti.

### Amministrazione (`/api/admin`)
- `GET /api/admin/users`: Lista degli utenti (solo admin).
- `POST /api/admin/scan`: Avvia una nuova scansione della libreria.
- `GET /api/admin/stats`: Statistiche sull'utilizzo del server e del database.

### Web3 e Pagamenti (`/api/payments`)
- `GET /api/payments/prices`: Listino prezzi per le release.
- `POST /api/payments/unlock`: Valida un codice o una transazione per sbloccare contenuti.

---

## Protocolli di Terze Parti

### Subsonic API (`/rest`)
TuneCamp implementa una parte del protocollo Subsonic per garantire la compatibilità con app mobili esistenti (es. DSub, Play:Sub).
- Endpoint base: `/rest/*.view`
- Supporta: `getAlbumList`, `getMusicDirectory`, `stream`, etc.

## Formati di Risposta

Tutte le risposte API (tranne lo streaming audio) sono in formato **JSON**. In caso di errore, il server restituisce un codice di stato HTTP appropriato e un oggetto errore:
```json
{
  "error": "Messaggio di errore descrittivo"
}
```
