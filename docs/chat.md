# Chat & Real-Time Messaging

TuneCamp includes an integrated real-time community chat lobby and end-to-end encrypted (E2EE) direct messaging (DM) system. It enables fans, artists, and instance members to communicate directly within the web app or via desktop/daemon clients like **Sidecamp**.

---

## 1. Core Architecture

The chat system is built around a lightweight WebSocket transport and local SQLite persistence, with optional client-side end-to-end encryption for 1-on-1 private conversations.

- **WebSocket Transport**: Connections are handled via `/ws/chat` (separate from the `/ws/peer` P2P sharing transport).
- **Backend Service**: Managed by `ChatService` (`src/server/modules/chat/chat.service.ts`).
- **Database Storage**:
  - `chat_messages`: Stores public lobby messages with persistent history.
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
- **1-on-1 Private DMs**: Direct messages between two users are encrypted on the client side using **Zen SEA** — an elliptic-curve identity (secp256k1) whose keypair is derived from the user's login password via PBKDF2 (`deriveKeyPairFromPassword`, `@tunecamp/chat`). Messages are encrypted with an ECDH-derived shared secret (`Zen.secret` + `Zen.encrypt`/`Zen.decrypt`).
- **Zero-Trust Server Relay**: The TuneCamp server only acts as a public key and opaque ciphertext relay. It **never sees plaintext DM content**.
- **Keypair persistence**: The derived keypair is cached per-username in `localStorage` (`useAuthStore.ts`) so it survives page reloads without re-deriving from the password.

### Federated Chat (Cross-Instance)
- **Lobby relay**: Public lobby messages are broadcast to every known federated peer instance and injected into their local lobby, tagged with the sender's origin instance.
- **Cross-instance DMs**: Sending to `username@instance` resolves the target instance via `federatedDiscoveryService.resolvePeerByInstance()` and delivers the message to that single peer only (not broadcast).
- **Transport & auth**: Federated instances relay over `POST /api/chat/federated/inbound`, authenticated with an `X-Chat-Signature` header — HMAC-SHA256 over `username|instance|text|ts|lobby|toUsername` using a shared secret (`TUNECAMP_CHAT_FEDERATION_SECRET`). The endpoint returns `503` if the secret is unset (fail-closed) and `401` on a bad signature.
- **Dedup**: Inbound messages are deduplicated by content hash for a 5-minute in-process window; no durable replay store.
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
- **`TUNECAMP_CHAT_FEDERATION_SECRET`** (env var): Shared HMAC secret for cross-instance chat federation. Unset disables federated relay (`/inbound` returns `503`).

---

## 5. API Reference

### REST Endpoints
- **`GET /api/chat/history`**: Retrieves recent lobby message history.
- **`GET /api/chat/peers`**: Returns the roster of currently active chat participants.
- **`GET /api/chat/pubkey/:username?instance=`**: Returns a user's Zen SEA public key. Falls back to resolving a remote instance's peer and proxying the request if the user isn't local.

### Federation Endpoints
- **`GET /api/chat/federated/peers`**: Lists known federated peer instances.
- **`POST /api/chat/federated/inbound`**: Accepts a signed message relay from a federated peer (see [Federated Chat](#federated-chat-cross-instance) above).

### WebSocket `/ws/chat` Events
- **`chat:message`**: Outgoing/incoming lobby or DM payloads.
- **`chat:peers`**: Roster update events on peer join/leave.
- **`chat:ban` / `chat:mute`**: Moderation signal events dispatched by admins.

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
