# FID (Fediverse-ID) Unified Identity & Instance Passports

TuneCamp uses a **self-sovereign, decentralized identity model** powered by [FID (Fediverse-ID)](https://github.com/scobru/fid) (`@scobru/fid`), [Zen SEA](https://github.com/scobru/zen), and the P2P relay network (`wss://delay.scobrudot.dev/zen`).

This architecture allows users to unify their profiles across independent TuneCamp instances without relying on a centralized Single Sign-On (SSO) or shared database.

---

## 🌐 Global Portal & Demo

The official central SSO and identity portal is deployed at:  
👉 **[https://fid-portal.vercel.app/](https://fid-portal.vercel.app/)** (or `tunecamp.org`)

---

## 📡 Help the Network: Host a Zen Relay Node

The decentralized graph sync and P2P communication in FID rely on open Zen P2P Relays.

You can help strengthen the network's resilience, speed, and decentralization by running your own Zen P2P Relay node!

👉 **Host a Zen Relay Node:** Visit the **[scobru/zen repository](https://github.com/scobru/zen)** for instructions on spinning up a lightweight relay instance.

---

## 🏛️ Architecture Overview

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

## 🔄 Two-Step Linking Handshake Workflow

1. **Step 1 (Instance $\rightarrow$ fid-portal.vercel.app)**:
   - On local TuneCamp settings, user clicks **"Genera Challenge di Vincolo"** (`GET /api/auth/zen/challenge`).
   - Instance generates a one-time challenge nonce `{ instanceDomain, username, nonce, timestamp }`.
   - User copies the **Challenge JSON**.

2. **Step 2 (fid-portal.vercel.app $\rightarrow$ Instance)**:
   - On `fid-portal.vercel.app/profile.html`, user opens **"Link Instance"** $\rightarrow$ **"Firma Challenge Istanza"**.
   - User pastes the Challenge JSON.
   - Portal signs the challenge with the user's private Zen SEA key and generates a **Passport JSON**.
   - User copies the **Passport JSON** and pastes it back into the local TuneCamp instance to activate the verified link.

---

## 🔑 Endpoints

### 1. Generate Zen Challenge

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
  "zenPubKey": "QmZenPubKey...",
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
    "zenPubKey": "QmZenPubKey...",
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
    "zenPubKey": "QmZenPubKey...",
    "issuedAt": 1721926658000
  },
  "apSeed": "32_byte_hex_seed..."
}
```

- **Behavior**:
  - Validates `ssoToken` via `FidSsoHandler.validateSsoToken()`.
  - Derives deterministic Ed25519 ActivityPub keys server-side from `apSeed`.
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
