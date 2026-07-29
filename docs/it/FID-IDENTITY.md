# FID (Fediverse-ID) Identità Unificata e Passport dell'Istanza

TuneCamp utilizza un **modello di identità decentralizzato e auto-sovrano** basato su [FID (Fediverse-ID)](https://github.com/scobru/fid) (`@scobru/fid`), [Zen SEA](https://github.com/scobru/zen), e la rete di relay P2P (`wss://delay.scobrudot.dev/zen`).

Questa architettura consente agli utenti di unificare i propri profili tra istanze TuneCamp indipendenti senza dipendere da un Single Sign-On (SSO) centralizzato o da un database condiviso.

---

## 🌐 Portale Globale & Demo

Il portale centralizzato SSO e d'identità ufficiale è distribuito su:  
👉 **[https://fid-portal.vercel.app/](https://fid-portal.vercel.app/)** (o `tunecamp.org`)

---

## 📡 Aiuta la Rete: Ospita un Nodo Relay Zen

La sincronizzazione dei grafi decentralizzati e le comunicazioni P2P in FID si basano su nodi Zen P2P Relay aperti.

Puoi contribuire a rafforzare la resilienza, la velocità e la decentralizzazione della rete eseguendo il tuo nodo Zen P2P Relay!

👉 **Ospita un Nodo Zen Relay:** Visita il repository **[scobru/zen](https://github.com/scobru/zen)** per le istruzioni sull'installazione di un'istanza relay leggera.

---

## 🏛️ Panoramica dell'Architettura

```
                                ┌───────────────────────────┐
                                │   fid-portal.vercel.app   │
                                │  (Zen SEA Global Portal)  │
                                └─────────────┬─────────────┘
                                              │  WSS (Zen Graph)
                                ┌─────────────▼─────────────┐
                                │   wss://delay.scobrudot.dev│
                                │     Zen P2P Relay         │
                                └─────────────┬─────────────┘
                                              │
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
   - Il portale firma il challenge con la chiave privata Zen SEA dell'utente e genera un **JSON del Passaporto**.
   - L'utente copia il **JSON del Passaporto** e lo incolla nuovamente nell'istanza locale TuneCamp per attivare il collegamento verificato.

---

## 🔑 Endpoint

### 1. Genera Challenge Zen
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
  "zenPubKey": "QmZenPubKey...",
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
    "zenPubKey": "QmZenPubKey...",
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
    "zenPubKey": "QmZenPubKey...",
    "issuedAt": 1721926658000
  },
  "apSeed": "32_byte_hex_seed..."
}
```
- **Comportamento**:
  - Valida `ssoToken` tramite `FidSsoHandler.validateSsoToken()`.
  - Deriva le chiavi Ed25519 ActivityPub in modo deterministico sul server da `apSeed`.
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
- **Endpoint** (`/api/fid-registry`, autenticazione richiesta):
  - `GET /` — elenca tutte le istanze collegate per l'utente corrente
  - `GET /:instanceDomain` — ottiene la voce per un'istanza specifica
  - `POST /` — aggiunge un nuovo collegamento `{ instanceDomain, artistId?, artistName?, artistSlug?, publicKey?, passportSignature? }`
  - `PATCH /:id` — aggiorna la voce (info artista, passaporto, flag verificato)
  - `POST /:id/verify` — contrassegna come verificato
  - `DELETE /:id` — scollega l'istanza
- **Flusso**: L'utente si autentica sull'Istanza A, ottiene il passaporto dall'Istanza B tramite fid-portal, invia il passaporto a `/api/fid-registry` dell'Istanza A per collegare l'artista sull'Istanza B.

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
