# FID (Fediverse-ID) Identità Unificata e Passport dell'Istanza

TuneCamp utilizza un **modello di identità decentralizzato e auto-sovrano** basato su [FID (Fediverse-ID)](https://github.com/scobru/fid) (`fid`): una coppia di chiavi Ed25519 derivata nel browser da alias e passphrase, richieste firmate su HTTPS semplice e nessun relay.

Questa architettura consente agli utenti di unificare i propri profili tra istanze TuneCamp indipendenti senza dipendere da un Single Sign-On (SSO) centralizzato o da un database condiviso.

---

## 🌐 Portale Globale & Demo

Il portale centralizzato SSO e d'identità ufficiale è distribuito su:  
👉 **[https://fid-portal.vercel.app/](https://fid-portal.vercel.app/)** (o `tunecamp.org`)

---

## 🏛️ Panoramica dell'Architettura

```
                                ┌───────────────────────────┐
                                │   fid-portal.vercel.app   │
                                │   (Ed25519 identity,      │
                                │    keys stay in browser)  │
                                └─────────────┬─────────────┘
                                              │  HTTPS (signed requests)
                        ┌─────────────────────┴─────────────────────┐
                        │                                           │
           ┌────────────▼────────────┐                 ┌────────────▼────────────┐
           │   TuneCamp Instance A   │                 │   TuneCamp Instance B   │
           │ (sudorecords.scobru...) │                 │ (tunecamp.subterra...)  │
           └─────────────────────────┘                 └─────────────────────────┘
```

---

## 🔄 Flusso di Vincolo a Due Passaggi (Handshake)

1. **Passo 1 (Istanza $\rightarrow$ fid-portal.vercel.app)**:
   - Nelle impostazioni locali di TuneCamp, l'utente clicca **"Genera Challenge di Vincolo"** (`GET /api/auth/zen/challenge`).
   - L'istanza genera un nonce monouso `{ instanceDomain, username, nonce, timestamp }`.
   - L'utente copia il **JSON del Challenge**.

2. **Passo 2 (fid-portal.vercel.app $\rightarrow$ Istanza)**:
   - Su `fid-portal.vercel.app/profile.html`, l'utente apre **"Collega Istanza"** $\rightarrow$ **"Firma Challenge Istanza"**.
   - L'utente incolla il JSON del Challenge.
   - Il portale firma il challenge con la chiave privata d'identità dell'utente e genera un **JSON del Passaporto**.
   - L'utente copia il **JSON del Passaporto** e lo incolla nuovamente nell'istanza locale TuneCamp per attivare il collegamento verificato.

---

## 🔑 Endpoint

### 1. Genera Challenge

- **Endpoint**: `GET /api/auth/zen/challenge`
- **Autenticazione Richiesta**: Sì (`requireUser`)
- **Risposta**:

```json
{
  "success": true,
  "challenge": {
    "instanceDomain": "sudorecords.scobrudot.dev",
    "username": "scobru",
    "nonce": "a4f891b2c3d4e5f67890123456789abc",
    "timestamp": 1721926658000
  }
}
```

### 2. Verifica Challenge & Emetti Badge Passaporto

- **Endpoint**: `POST /api/auth/zen/link`
- **Autenticazione Richiesta**: Sì (`requireUser`)
- **Corpo**:

```json
{
  "zenPubKey": "bE9DAycqb9gbxMJHTxh5RRxVQRPpG-wrCojHVl0s9sM",
  "challenge": { ... },
  "seaSignature": "SEA.sign_signature_data"
}
```

- **Risposta**:

```json
{
  "success": true,
  "passport": {
    "instanceDomain": "sudorecords.scobrudot.dev",
    "localUsername": "scobru",
    "zenPubKey": "bE9DAycqb9gbxMJHTxh5RRxVQRPpG-wrCojHVl0s9sM",
    "issuedAt": 1721926658000,
    "passportSignature": "HMAC_SHA256_SIGNATURE",
    "publicDataEndpoint": "https://sudorecords.scobrudot.dev/api/auth/zen/user/scobru/public"
  }
}
```

### 3. Login con FID SSO

- **Endpoint**: `POST /api/auth/zen/sso`
- **Autenticazione Richiesta**: No (Pubblico con Limitazione di Frequenza)
- **Corpo**:

```json
{
  "ssoToken": {
    "clientId": "tunecamp-webapp",
    "instanceDomain": "sudorecords.scobrudot.dev",
    "username": "scobru",
    "zenPubKey": "bE9DAycqb9gbxMJHTxh5RRxVQRPpG-wrCojHVl0s9sM",
    "issuedAt": 1721926658000
  },
  "apSeed": "32_byte_hex_seed..."
}
```

- **Comportamento**:
  - Valida `ssoToken` tramite `FidSsoHandler.validateSsoToken()`.
  - Risolve l'account con la chiave d'identità contro cui la firma è stata effettivamente verificata — `masterKeySource.pubKey` se presente, altrimenti il campo piatto `zenPubKey`. Un token che li porta entrambi e li lascia discordare viene rifiutato (`400 SSO token identity mismatch`): sono due campi indipendenti dello stesso payload, quindi fidarsi di una chiave diversa da quella verificata permetterebbe a qualunque coppia di chiavi di rivendicare qualunque account. Richiede `fid` ≥ 4.0.1, che rifiuta già da sé un token simile; questa rotta ripete il controllo per non dipendere dalla libreria.
  - Deriva le chiavi Ed25519 ActivityPub in modo deterministico sul server da `apSeed`.
  - Salva quelle chiavi sull'account (`admin.ap_public_key` / `ap_private_key`) se non già presenti, e sull'artista collegato quando esiste. Senza questo passaggio l'account non avrebbe alcun attore Fediverse: l'SSO non passa mai da `POST /api/auth/login`, che è il punto in cui la generazione delle chiavi avviene altrimenti.
  - I nuovi utenti SSO iniziano come **Ascoltatori** standard (`UserRole.NORMAL_USER`) senza profili artista creati automaticamente.
  - Se promossi internamente dagli amministratori di istanza, il ruolo e il link artista assegnati vengono rispettati.

### 4. Esportazione Profilo Utente Pubblico

- **Endpoint**: `GET /api/auth/zen/user/:username/public`
- **Autenticazione Richiesta**: No (Pubblico)
- **Risposta**: Ritorna **solo** informazioni pubbliche del profilo, pubblicazioni e playlist pubbliche per l'aggregazione tra istanze su `fid-portal.vercel.app`.

### 5. Scoperta Istanze per il Portale

- **Endpoint**: `GET /api/auth/zen/instances`
- **Autenticazione Richiesta**: Sì (`requireUser`)
- **Risposta**: Ritorna le voci `fid_registry` dell'utente (istanze collegate con info artista, firme passaporto, stato di verifica).
- **Scopo**: Consente al portale globale di scoprire quali istanze un utente ha collegato senza dover interrogare ciascuna istanza.

### 6. Collegamento Artista Tra Istanze (Registro FID)

- **Tabella**: `fid_registry` (per-istanza, traccia le istanze collegate per utente)
- **Endpoint**: Rimossa - collegamento tra istanze ora gestito esternamente a `tunecamp.org/profile.html`
- **Flusso**: Utente si autentica sull'Istanza A, ottiene il passaporto da `tunecamp.org/profile.html` tramite il portale FID, e collega tramite la pagina profilo esterna.

### 7. Autenticazione FID per MCP Server

- **Header di Autenticazione**: `Authorization: FID <zen_pub_key>`
- **Middleware**: `requireFidAuth` in `auth.ts`
- **Comportamento**: Cerca l'utente tramite la chiave `zen_pub`, deriva il contesto e concede l'accesso agli strumenti MCP (search_music, list_recent_albums, scan_library, get_system_stats) senza token JWT.
- **Caso d'Uso**: Assistenti IA (Claude Desktop, ecc.) si autenticano tramite l'identità FID dell'utente per ispezionare/gestire il catalogo tra istanze.

### 8. Aggregazione Profilo Unificato (tunecamp-website/profile.html)

- **Origine Dati**: Aggrega `publicReleases`, `publicLikes`, `publicPlaylists` da tutte le istanze collegate tramite le loro rotte `/api/auth/zen/user/:username/public`.
- **Archiviazione**: Salva i dati per-istanza in cache nel `localStorage` (`tunecamp_instance_data`).
- **Tab**: Pubblicazioni, Preferiti (stelle), Playlist — ognuna mostra il badge dell'istanza.
- **Sincronizzazione Automatica**: Al login, `loadLinkedInstances()` recupera il registro e sincronizza automaticamente le istanze verificate.
- **Sincronizzazione Manuale**: Pulsante "Sincronizza" per ogni istanza nell'elenco delle Istanze Collegate.
- **Sync della libreria (player)**: quando un'identità è collegata a un'istanza, il player può replicare la libreria dell'ascoltatore (preferiti, artisti, playlist) su quell'istanza. I record sono cifrati nel browser con una chiave derivata dalla chiave d'identità; l'istanza conserva solo testo cifrato. Vedi sotto.

### 9. Sync della Libreria (player del sito)

Sincronizzazione tra dispositivi della libreria di un ascoltatore, più le playlist condivise pubbliche. HTTP semplice, nessun relay.

- **Endpoint** (tutti sotto `/api/auth/zen/library/:pub`, CORS aperto, nessun cookie):
  - `GET /:pub?since=<ms>` — i record cambiati dopo `since`, tombstone incluse. Firmato.
  - `PUT /:pub` — inserisce o aggiorna `{ records: [{ bucket, id, d, at, del }] }`. Un record viene accettato solo se `at` è più recente di quello salvato (vince l'ultima scrittura). Firmato.
  - `GET /:pub/shared/:id` — una playlist condivisa pubblica `{ name, items, at }`. Anonimo.
  - `GET /:pub/account` — `{ username }` se l'istanza ha un account attivo collegato alla chiave, altrimenti `404`. Anonimo; un nuovo dispositivo lo usa per trovare dove sta la sua libreria. Espone solo il legame chiave ↔ username che gli endpoint dei passaporti già pubblicano.
- **Autenticazione**: `X-Fid-Auth: <ts>.<sig>`, dove `sig` è la firma della chiave d'identità su `fid-library:<METODO>:<percorso>:<ts>:<sha256 esadecimale del corpo>`. Timestamp con più di 5 minuti di scarto vengono rifiutati. La chiave deve appartenere a un **account attivo su quell'istanza** (`admin.zen_pub`), così un'istanza non è mai spazio gratuito per sconosciuti.
- **Bucket**: `favorites`, `artists`, `playlists` (testo cifrato in `d`) e `shared` (JSON in chiaro, fino a 200 brani).
- **Limiti**: 200 record per richiesta, 64 KB per record, 5000 record e 8 MB per identità, 120 richieste al minuto per IP. Oltre il limite: `413`.
- **Archiviazione**: tabella `library_sync (pub, bucket, id, d, at, del)`. Un record eliminato mantiene la riga come tombstone con payload vuoto.
