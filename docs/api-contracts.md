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
- `GET /api/tracks/:id/stream`: Stream binario del file audio (supporta Range per cloud tracks).
- `GET /api/tracks/:id/waveform`: Dati per la visualizzazione della forma d'onda.

### Pagamenti e Monetizzazione (`/api/payments`)
- `POST /api/payments/stripe/create-session`: Crea una sessione Stripe Checkout per acquisti Fiat.
- `POST /api/payments/onramp-session`: Crea una sessione Stripe Crypto Onramp.
- `POST /api/payments/verify`: Verifica una transazione on-chain (ETH/USDC) su rete Base.
- `GET /api/payments/download/:trackId?code=...`: Scarica un brano acquistato tramite codice di sblocco.
- `GET /api/payments/rate/USD`: Ottiene il tasso di cambio ETH/USD corrente.

### Storage e Cloud (`/api/storage`)
- `GET /api/storage/gdrive/auth`: Inizia il flusso OAuth2 per Google Drive.
- `GET /api/storage/gdrive/files`: Lista file e cartelle su Google Drive.
- `POST /api/storage/gdrive/import`: Importa un file da Drive come riferimento `gdrive://`.
- `POST /api/storage/gdrive/localize/:id`: Scarica permanentemente un file cloud sul server locale.

### Metadati e Ricerca Esterna (`/api/metadata`)
- `GET /api/metadata/search?q=...`: Ricerca metadati album su provider esterni (MusicBrainz, Discogs, iTunes, TheAudioDB).
- `GET /api/metadata/lyrics?artist=...&title=...`: Recupera il testo di una canzone (via Lyrics.ovh).
- `POST /api/metadata/maintenance/apply-track`: Applica metadati selezionati a una traccia locale.

### Social, Commenti e Post (`/api/social`, `/api/comments`, `/api/activitypub`)
- `GET /api/posts`: Elenco dei post pubblici degli artisti.
- `POST /api/posts`: Crea un nuovo post (Admin).
- `GET /api/comments/:trackId`: Elenco commenti per un brano specifico.
- `POST /api/comments`: Aggiunge un commento (richiede autenticazione).
- `GET /api/social/feed`: Post recenti dagli attori seguiti.
- `GET /api/activitypub/actor/:username`: Profilo ActivityPub di un utente locale.
- `POST /api/activitypub/inbox`: Endpoint per la ricezione di messaggi remoti.

### Amministrazione (`/api/admin`)
- `GET /api/admin/users`: Lista degli utenti (solo admin).
- `POST /api/admin/scan`: Avvia una scansione della libreria.
- `POST /api/admin/rescan`: Forza una scansione profonda (full rescan) della libreria.
- `GET /api/admin/stats`: Statistiche sull'utilizzo del server e del database.
- `GET /api/admin/torrents`: Lista dei torrent attivi e passati.
- `POST /api/admin/torrents/add`: Aggiunge un magnet link alla coda di download.
- `DELETE /api/admin/torrents/:infoHash`: Rimuove un torrent e opzionalmente i dati scaricati.

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
