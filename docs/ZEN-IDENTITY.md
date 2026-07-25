# Zen SEA Unified Identity & Instance Passports

TuneCamp uses a **self-sovereign, decentralized identity model** powered by [Zen SEA](https://github.com/scobru/zen) (`@akaoio/zen`) and the P2P relay network (`wss://delay.scobrudot.dev/zen`).

This architecture allows users to unify their profiles across independent TuneCamp instances without relying on a centralized Single Sign-On (SSO) or shared database.

---

## 🏛️ Architecture Overview

```
                               ┌───────────────────────────┐
                               │     tunecamp.org          │
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

### 3. Public User Profile Export
- **Endpoint**: `GET /api/auth/zen/user/:username/public`
- **Auth Required**: No (Public)
- **Response**: Returns **only** public profile info, public releases, and public playlists for cross-instance aggregation on `tunecamp.org`.
