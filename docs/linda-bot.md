# Linda Messaging Bridge

The `LindaBotService` (`src/server/services/linda-bot.ts`) provides a bridge between TuneCamp and the **Linda** (Signal-like) decentralized messaging platform.

## 1. Decentralized Identity

The bot maintains a stable identity using **Zen (Gun.js)**.
- **Identity Storage**: Stored in settings as `linda_bot_pair`.
- **Authentication**: Derives a keypair to participate in the decentralized network.

## 2. Group Integration (Rooms)

Linda operates using "Rooms" or "Groups".
- **Invite Links**: Admins can configure a `linda_invite_link` (Base64 encoded JSON).
- **Group Joining**: The bot automatically joins the group and listens for messages on the path `linda_rooms/{groupId}/messages`.
- **End-to-End Encryption**: Supports E2EE via `AES-256-GCM` if a group secret is provided in the invite link.

## 3. Interaction & Commands

The bot listens for commands in the group chat:
- **`/status`**: Checks if the bridge is online.
- **`/search <query>`**: Searches the TuneCamp library for tracks matching the query.
- **`/play <query>`**: Alias for search.

## 4. Track Forwarding

When a search result is found, the bot "forwards" the track to the group:
- **Stream Link**: Generates a public streaming URL.
- **Metadata**: Includes Artist and Title.
- **Messaging**: The message is sent as a `type: "audio"` object, which allows compatible Linda clients to display an inline player.

## 5. Configuration

Settings required in the database (Admin UI):
- `linda_bot_enabled`: `true`/`false`.
- `linda_invite_link`: The invitation string for the destination group.
- `publicUrl`: The public-facing URL of the TuneCamp server (required for streaming links).
