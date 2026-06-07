# Telegram Bot Integration

TuneCamp includes a built-in Telegram bot that allows for rapid ingestion of music files, metadata extraction, and remote management.

## Setup

1.  **Create a Bot**: Talk to [@BotFather](https://t.me/BotFather) on Telegram to get an API Token.
2.  **Configuration**: Set the `TUNECAMP_TELEGRAM_BOT_TOKEN` environment variable.
3.  **Permissions**: Admins can use the `/admin` command to authorize specific channels or users.

## Features

### 1. Batch Ingestion
Send audio files, documents, or photos to the bot.
*   **Automatic Scanning**: The bot automatically extracts ID3 tags, artist names, and album titles.
*   **Rate-Limit Bypass**: Media files are processed without a cooldown, enabling high-speed batch uploads.
*   **Quiet Mode**: By default, the bot stays silent during ingestion to avoid Telegram's API rate limits. Successful uploads are confirmed at the end.
*   **Debug Mode**: Use `/debug on` to see detailed processing logs (useful for troubleshooting metadata extraction).

### 2. Metadata Hints & AI Parsing
The bot is highly intelligent in how it handles track metadata:
*   **Hashtags**: Use specific hashtags in the caption to force metadata: `#artist Name`, `#album Title`, `#year 2024`, `#title Song`, `#genre Electronic`.
*   **AI Extraction**: If no hashtags are found but a caption is present, the bot uses **AI (via OpenRouter)** to automatically parse the artist, album, and title from natural language text.
*   **Bandcamp Integration**: If the bot detects a Bandcamp URL in the caption, it will automatically scrape the page to extract high-quality metadata, including the release year and correct artist/album mapping.

### 3. Remote Search & Streaming
Search your library directly from Telegram using commands:
*   `/search <query>`: Find tracks in the library. **Note:** Authorized users (via `/admin`) can search across all tracks (including private/drafts). Unauthorized users can only search for public tracks.
*   `/play <query>`: Get a streaming link for a specific track.

## Administration

*   **Primary Admin**: Tracks uploaded via Telegram are automatically assigned to the "Primary Administrator" of the instance (Root Admin or Super User).
*   **Ownership Repair**: If the bot is used in a channel with multiple admins, the system performs automatic ownership normalization during startup maintenance.
