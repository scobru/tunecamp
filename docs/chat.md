# Chat & Real-Time Messaging

TuneCamp includes an integrated real-time community chat lobby and end-to-end encrypted (E2EE) direct messaging (DM) system. It enables fans, artists, and instance members to communicate directly within the web app or via desktop/daemon clients like **Sidecamp**.

---

## 1. Core Architecture

The chat system is built around a lightweight WebSocket transport and local SQLite persistence, with optional client-side end-to-end encryption for 1-on-1 private conversations.

- **WebSocket Transport**: Connections are handled via `/ws/chat` (separate from the `/ws/peer` P2P sharing transport).
- **Backend Service**: Managed by `ChatService` (`src/server/modules/chat/chat.service.ts`).
- **Database Storage**:
  - `chat_messages`: Stores public lobby messages with persistent history.
  - `chat_rooms`: Named multi-user rooms. Besides the local `id` (a per-instance `AUTOINCREMENT`) each room carries a `global_id` UUID minted once by the instance that created it — that is the only identifier valid across instances.
  - `chat_room_members`: Room membership, keyed by `(room_id, username)`.
  - `chat_room_messages`: Room backlog (plaintext; rooms are not E2EE yet).
  - `peer_chat_bans`: Persistent IP / user bans for chat moderation.
  - `peer_chat_mutes`: Persistent user mute list.
- **Client Library**: Packaged separately as `@tunecamp/chat` (`tunecamp-chat`), which provides the `TuneCampChatClient` class and the `useTuneCampChat` React hook.

---

## 2. Modes of Operation

### Community Lobby Chat
- **Public & Persistent**: Broadcast to all connected users in the instance lobby.
- **History Backlog**: Automatically hydrated on connect via `GET /api/chat/history`.
- **Domain Labels**: Automatically appends instance origin labels to user nicknames across federated/multi-instance environments (e.g. `artist (sudorecords)`).

### End-to-End Encrypted (E2EE) Direct Messages
- **1-on-1 Private DMs**: Direct messages between two users are encrypted on the client side using **Zen SEA** — an elliptic-curve identity (secp256k1). Messages are encrypted with an ECDH-derived shared secret (`Zen.secret` + `Zen.encrypt`/`Zen.decrypt`).
- **The DM key is the account's Zen identity**, the same `zen_pub` FID uses for cross-instance SSO — not a chat-only keypair. That is what makes a fetched public key checkable: it belongs to the account, not to whichever socket happens to be connected.
- **Random pair, password-sealed vault**: the pair is generated randomly and then encrypted client-side under the user's password (`encryptPairVault`) and uploaded to `POST /api/auth/zen/keys` as `zen_priv`. It is *not* derived from the password — a derived pair would silently become a different identity on every password change. The server stores the vault opaquely and cannot open it.
- **The vault password is stretched before it reaches the cipher**: PBKDF2-HMAC-SHA256, 600 000 iterations, 16-byte random salt. `Zen.encrypt` alone derives its AES key with a single SHA-256, which puts an offline attacker holding a database dump within billions of guesses per second of every user's identity. Format is `tcv1:<iterations>:<saltHex>:<zenBlob>`, so the cost can be raised later without invalidating existing vaults; a blob declaring fewer than 100 000 iterations is refused, since otherwise the server could pick a cost it can brute-force. Vaults predating the envelope still open (`isLegacyPairVault`) and are re-sealed at the next login, which is the only moment the client holds the password.
- **Provisioning**: on register, and on password login for an account that has no identity yet, the webapp mints a pair and uploads the vault. If the account already has a `zen_pub` but no vault (identity bound from the FID portal, private half never uploaded), the client does *not* mint a second pair — it degrades to no E2EE rather than forking the account into two identities.
- **Password changes must re-seal**: the vault is encrypted with the old password until re-wrapped, so every password-change path calls `resealChatIdentity(newPassword)` (`useAuthStore.ts`). Skipping it locks the user out of their own identity and of every DM addressed to it. `POST /api/auth/zen/set` (rebinding to a different identity) nulls `zen_priv` for the same reason: a stale vault would pair a new public key with a non-matching private key.
- **Zero-Trust Server Relay**: The TuneCamp server only acts as a public key and opaque ciphertext relay. It **never sees plaintext DM content**.
- **Key source is reported and downgrade-resistant**: `GET /api/chat/pubkey/:username` returns `source: "identity"` when the key came from the account and `source: "session"` when it came only from a live socket announcement. The client (`@tunecamp/chat`) remembers which it got and will not let a later WebSocket-announced session key overwrite an already-resolved identity key.
- **Fingerprint pinning (TOFU)**: the server chooses which key it hands out, so possessing a key proves nothing about whose it is. The client pins `SHA-256(pub)` truncated to 128 bits the first time it sees a peer (`keyFingerprint`, persisted per peer id) and **refuses** any later key that hashes differently — the old key stays in force, the new one is quarantined, and `onKeyChange` fires. Only `acceptPeerKeyChange(peerId)`, driven by an explicit user action after comparing fingerprints out of band, re-pins. A peer whose key legitimately rotated is indistinguishable from a wiretap without that comparison.
- **A DM is never sent in the clear**: if there is no usable key for the recipient — none published yet, or one quarantined by the pin check — `sendMessage` refuses and says so, instead of falling back to plaintext the sender has no way to notice. Withholding a key is something the server can do at will, so plaintext fallback would be a downgrade it fully controls.
- **Keypair persistence**: The opened pair is cached per-username in `localStorage` (`useAuthStore.ts`) so it survives page reloads without the password, which is not kept in memory.

### Rooms
- **Named multi-user conversations**, separate from the single global lobby. Membership is keyed by *username*, not by socket: a user who joins from the webapp is still a member from their Sidecamp daemon and across reconnects.
- **Managed over REST** (`/api/chat/rooms*`, all behind `authMiddleware.requireUser`) and used over WebSocket (`room_join`, `room_leave`, `room_chat`). The acting user is always taken from the authenticated session — never from a query parameter.
- **Deletion is creator-only**; private rooms (`is_private`) are visible to members only.
- **Not E2EE**: room messages are stored and relayed in plaintext, unlike DMs. Do not use rooms for anything that needs the DM threat model.

### Federated Chat (Cross-Instance)
- **Lobby relay**: Public lobby messages are broadcast to every known federated peer instance and injected into their local lobby, tagged with the sender's origin instance.
- **Cross-instance DMs**: Sending to `username@instance` resolves the target instance via `federatedDiscoveryService.resolvePeerByInstance()` and delivers the message to that single peer only (not broadcast).
- **Federated room messages**: A public room's messages fan out to every peer, addressed by the room's `global_id` (never by the local `id`, which means a different room on every instance). A peer that does not know that `global_id` drops the message instead of guessing. Private rooms are never federated: membership is not federated yet, so no peer could enforce who may read them.
- **Transport & auth**: Federated instances relay over `POST /api/chat/federated/inbound`, authenticated with an `X-Chat-Signature` header — HMAC-SHA256 over the JSON encoding of `[username, instance, text, ts, lobby, toUsername, roomGlobalId, roomName]` using a shared secret (`TUNECAMP_CHAT_FEDERATION_SECRET`). The fields are JSON-encoded rather than joined on a separator so that a separator character inside the attacker-controlled `text` cannot produce the same signing input as a different message. The endpoint returns `503` if the secret is unset (fail-closed) and `401` on a bad signature.
- **Freshness window**: a signature never expires on its own, so `ts` must be within 5 minutes in the past and 1 minute in the future (clock skew) or the message is refused with `401`. Without it a captured message would stay replayable forever once it aged out of the dedup window.
- **Known-peer check**: the claimed `instance` must resolve to a peer already in federated discovery, otherwise `403`. The peer list is refreshed from `federatedDiscoveryService` on every inbound request, so a receiver that has never sent anything still knows who it federates with — but an instance that has not yet discovered the sender will reject it.
- **Trust model — read this before deploying**: the HMAC secret is shared by the whole federation, so a valid signature proves *some* peer sent the message, not *which* one. Any peer holding the secret can sign as any user of any other instance; the known-peer check only bounds that to instances you already federate with. Treat the secret as a federation-wide trust boundary, not a per-peer credential, and only share it with operators you trust. Per-peer secrets are the fix and are not implemented yet.
- **Dedup**: Inbound messages are deduplicated by a content hash of the signed fields, held in process for 6 minutes (the freshness window plus the skew allowance, so an entry can never expire while the message is still fresh enough to re-enter). The `id` a sender puts in the body is ignored and recomputed locally — it is not covered by the MAC, so honouring it would let a peer choose the dedup key and pre-seed it to suppress a later message. No durable replay store: the map is lost on restart.
- **DM ciphertext stays E2EE end-to-end**: federation only relays the already-encrypted DM payload between servers — plaintext still never touches any instance.

---

## 3. IRC-Style Commands & Moderation

TuneCamp chat supports native slash commands for user interaction and administration:

| Command | Permission | Description |
| :--- | :--- | :--- |
| `/help` | Everyone | Lists all available chat commands. |
| `/clear` | Everyone | Clears the local chat viewport history. |
| `/kick <user>` | Admin / Owner | Disconnects the specified user from the chat session. |
| `/ban <user>` | Admin / Owner | Ban a user from joining the chat lobby (persisted in DB). |
| `/unban <user>` | Admin / Owner | Removes a user ban. |
| `/mute <user>` | Admin / Owner | Mutes a user, preventing them from sending lobby messages. |
| `/unmute <user>` | Admin / Owner | Unmutes a user. |

---

## 4. Administration & Configuration

Instance administrators can control chat behavior from the Admin Dashboard or environment configuration:

- **`peerChatEnabled`** (`boolean`): Master toggle to enable or disable the chat service across the instance.
- **`peerChatGuestEnabled`** (`boolean`): Allows unauthenticated guests to view and participate in the public lobby with generated guest handles.
- **`TUNECAMP_CHAT_FEDERATION_SECRET`** (env var): Shared HMAC secret for cross-instance chat federation. Unset disables federated relay (`/inbound` returns `503`). Shared by every peer, so it is a federation-wide trust boundary — see [Federated Chat](#federated-chat-cross-instance).

---

## 5. API Reference

### REST Endpoints
- **`GET /api/chat/history`**: Retrieves recent lobby message history.
- **`GET /api/chat/peers`**: Returns the roster of currently active chat participants.
- **`GET /api/chat/pubkey/:username?instance=`**: Returns `{ pubkey, source }` for a user's Zen SEA public key. Prefers the account's stored identity (`source: "identity"`, answers even while the user is offline), falls back to a live session's announced key (`source: "session"`), then to resolving a remote instance's peer and proxying the request. `404` when the user has neither.

### Room Endpoints
All of them require a session (`/api/chat` is mounted behind `authMiddleware.requireUser`) and act as the authenticated user.

- **`GET /api/chat/rooms`**: Lists rooms, each with its `id` and `globalId`.
- **`POST /api/chat/rooms`**: Creates a room (`name`, `description`, `is_private`); returns `{ id, globalId, name }`.
- **`DELETE /api/chat/rooms/:id`**: Deletes a room. Creator only.
- **`POST /api/chat/rooms/:id/join`** / **`/leave`**: Adds or removes the caller's membership.
- **`GET /api/chat/rooms/:id/messages?limit=`**: Room backlog (capped at 500).
- **`GET /api/chat/rooms/:id/members`**: Room member list.

### Federation Endpoints
- **`POST /api/chat/federated/inbound`**: Accepts a signed message relay from a federated peer (see [Federated Chat](#federated-chat-cross-instance) above). Known peers are listed by `GET /api/community/peers`. Responses: `202` accepted, `409` duplicate, `400` missing fields, `401` missing/bad signature or a stale/future-dated `ts`, `403` unknown peer instance, `415` non-JSON body, `503` federation secret unset.

### WebSocket `/ws/chat` Events
- **`chat:message`**: Outgoing/incoming lobby or DM payloads.
- **`chat:peers`**: Roster update events on peer join/leave.
- **`chat:ban` / `chat:mute`**: Moderation signal events dispatched by admins.
- **`room_join` / `room_leave` / `room_chat`**: Room subscription and room messages, addressed by the local `roomId`. A `room_chat` that arrived from a federated peer also carries `roomGlobalId`.

---

## 6. Client Integration (`@tunecamp/chat`)

To integrate TuneCamp chat into custom frontends or React applications:

```tsx
import { useTuneCampChat } from '@tunecamp/chat';

function ChatComponent() {
  const { messages, peers, sendMessage, formatUser } = useTuneCampChat({
    serverUrl: 'https://sudorecords.scobrudot.dev',
    token: 'USER_JWT_TOKEN'
  });

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>
          <strong>{formatUser(msg.from, msg.instance)}</strong>: {msg.text}
        </div>
      ))}
      <button onClick={() => sendMessage('', 'Hello Lobby!')}>Send</button>
    </div>
  );
}
```
