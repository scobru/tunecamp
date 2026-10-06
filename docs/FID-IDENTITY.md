# FID (Fediverse-ID) Unified Identity & Instance Passports

TuneCamp uses a **self-sovereign, decentralized identity model** powered by [FID (Fediverse-ID)](https://github.com/scobru/fid) (`fid`): an Ed25519 keypair derived in the browser from an alias and a passphrase, signed requests over plain HTTPS, and no relay.

This architecture allows users to unify their profiles across independent TuneCamp instances without relying on a centralized Single Sign-On (SSO) or shared database.

---

## 🌐 Global Portal & Demo

The official central SSO and identity portal is deployed at:  
👉 **[https://fid-portal.vercel.app/](https://fid-portal.vercel.app/)** (or `tunecamp.org`)

---

## 🏛️ Architecture Overview

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

## 🔄 Two-Step Linking Handshake Workflow

1. **Step 1 (Instance $\rightarrow$ fid-portal.vercel.app)**:
   - On local TuneCamp settings, user clicks **"Genera Challenge di Vincolo"** (`GET /api/auth/zen/challenge`).
   - Instance generates a one-time challenge nonce `{ instanceDomain, username, nonce, timestamp }`.
   - User copies the **Challenge JSON**.

2. **Step 2 (fid-portal.vercel.app $\rightarrow$ Instance)**:
   - On `fid-portal.vercel.app/profile.html`, user opens **"Link Instance"** $\rightarrow$ **"Firma Challenge Istanza"**.
   - User pastes the Challenge JSON.
   - Portal signs the challenge with the user's private identity key and generates a **Passport JSON**.
   - User copies the **Passport JSON** and pastes it back into the local TuneCamp instance to activate the verified link.

---

## 🔑 Endpoints

## 🔁 After `fid` 5.0: relinking an account

`fid` 5.0 replaced Zen SEA keys with Ed25519 keys, so the same alias and passphrase now derive a **different** key. An account whose `zen_pub` is the old key is no longer reached by signing in: the SSO answers `Username already exists…` (`FID_KEY_CHANGED`) or the link flow `FID identity not found`.

Accounts created through FID have no password, and the server refuses to write one, so the owner cannot fix this from the web UI. The instance operator points the account at the new key:

```bash
npm run fid:relink -- <username> <new-public-key>   # add --db path/to/db if it is not the configured one
```

The new public key is the one the FID profile page shows after signing in again. The tool refuses a malformed key or one another account owns, signs the account's sessions out, resets its passports (they were issued for the old key) and removes the old identity's library records, which nobody can read any more. Accounts that do have a password can log in normally and link the new key from their profile.

---

### 1. Generate Challenge

- **Endpoint**: `GET /api/auth/zen/challenge`
- **Auth Required**: Yes (`requireUser`)
- **Response**:

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

### 2. Verify Challenge & Issue Passport Badge

- **Endpoint**: `POST /api/auth/zen/link`
- **Auth Required**: Yes (`requireUser`)
- **Body**:

```json
{
  "zenPubKey": "bE9DAycqb9gbxMJHTxh5RRxVQRPpG-wrCojHVl0s9sM",
  "challenge": { ... },
  "seaSignature": "SEA.sign_signature_data"
}
```

- **Response**:

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

### 3. Login with FID SSO

- **Endpoint**: `POST /api/auth/zen/sso`
- **Auth Required**: No (Public Rate-Limited)
- **Body**:

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

- **Behavior**:
  - Validates `ssoToken` via `FidSsoHandler.validateSsoToken()`.
  - Resolves the account by the identity key the signature was actually verified against — `masterKeySource.pubKey` when present, otherwise the flat `zenPubKey`. A token that carries both and lets them disagree is refused (`400 SSO token identity mismatch`): those are two independent fields on one wire payload, so trusting a key other than the verified one would let any keypair claim any account. Requires `fid` ≥ 4.0.1, which refuses such a token itself; this route repeats the check so it does not depend on the library for it.
  - Derives deterministic Ed25519 ActivityPub keys server-side from `apSeed`.
  - Persists those keys on the account (`admin.ap_public_key` / `ap_private_key`) when not already set, and on the linked artist when there is one. Without this the account would have no Fediverse actor at all: SSO never goes through `POST /api/auth/login`, which is where key generation is otherwise triggered.
  - New SSO users start as standard **Listeners** (`UserRole.NORMAL_USER`) without auto-created artist profiles.
  - If promoted internally by instance admins, their instance-assigned role/artist link is respected.

### 4. Public User Profile Export

- **Endpoint**: `GET /api/auth/zen/user/:username/public`
- **Auth Required**: No (Public)
- **Response**: Returns **only** public profile info, public releases, and public playlists for cross-instance aggregation on `fid-portal.vercel.app`.

### 5. Instance Discovery for Portal

- **Endpoint**: `GET /api/auth/zen/instances`
- **Auth Required**: Yes (`requireUser`)
- **Response**: Returns the user's `fid_registry` entries (linked instances with artist info, passport signatures, verification status).
- **Purpose**: Allows the global portal to discover which instances a user has linked without querying every instance.

### 6. Cross-Instance Artist Linking (FID Registry)

- **Table**: `fid_registry` (per-instance, tracks linked instances per user)
- **Endpoints**: Removed - cross-instance linking now handled externally at `tunecamp.org/profile.html`
- **Flow**: User authenticates on Instance A, gets passport from `tunecamp.org/profile.html` via FID portal, then links via external profile page.

### 7. MCP Server FID Authentication

- **Auth Header**: `Authorization: FID <zen_pub_key>`
- **Middleware**: `requireFidAuth` in `auth.ts`
- **Behavior**: Looks up user by `zen_pub` key, derives context, grants access to MCP tools (search_music, list_recent_albums, scan_library, get_system_stats) without JWT.
- **Use Case**: AI assistants (Claude Desktop, etc.) authenticate via user's FID identity to inspect/manage catalog across instances.

### 8. Unified Profile Aggregation (tunecamp-website/profile.html)

- **Data Source**: Aggregates `publicReleases`, `publicLikes`, `publicPlaylists` from all linked instances via their `/api/auth/zen/user/:username/public` endpoints.
- **Storage**: Caches per-instance data in `localStorage` (`tunecamp_instance_data`).
- **Tabs**: Releases, Favorites (starred), Playlists — each shows instance badge.
- **Auto-sync**: On login, `loadLinkedInstances()` fetches registry and auto-syncs verified instances.
- **Manual sync**: "Sync" button per instance in the Linked Instances list.
- **Library sync (player)**: when an identity is linked to an instance, the player can mirror the listener's library (favorites, artists, playlists) to that instance. Records are encrypted in the browser with a key derived from the identity key; the instance only stores ciphertext. See below.

### 9. Library Sync (website player)

Cross-device sync of a listener's library, plus public shared playlists. Plain HTTP, no relay.

- **Endpoints** (all under `/api/auth/zen/library/:pub`, wildcard CORS, no cookies):
  - `GET /:pub?since=<ms>` — records changed after `since`, tombstones included. Signed.
  - `PUT /:pub` — upserts `{ records: [{ bucket, id, d, at, del }] }`. A record only lands if `at` is newer than the stored one (last write wins). Signed.
  - `GET /:pub/shared/:id` — one public shared playlist `{ name, items, at }`. Anonymous.
- **Auth**: `X-Fid-Auth: <ts>.<sig>`, where `sig` is the identity key's signature over `fid-library:<METHOD>:<path>:<ts>:<sha256 hex of the body>`. Timestamps more than 5 minutes off are refused. The key must belong to an **active account on that instance** (`admin.zen_pub`), so an instance is never free storage for strangers.
- **Buckets**: `favorites`, `artists`, `playlists` (ciphertext in `d`) and `shared` (JSON in the clear, up to 200 tracks).
- **Limits**: 200 records per request, 64 KB per record, 5000 records and 8 MB per identity, 120 requests per minute per IP. Over the limit: `413`.
- **Storage**: table `library_sync (pub, bucket, id, d, at, del)`. A deleted record keeps its row as a tombstone with an empty payload.
