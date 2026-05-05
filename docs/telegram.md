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

### 2. Metadata Hints
The bot can parse captions for metadata hints. If you send a file with a caption like `Artist - Song (Year)`, the bot will use this to improve its extraction if the file's internal tags are missing or corrupted.

### 3. Remote Search
Search your library directly from Telegram using commands (if enabled).

## Administration

*   **Primary Admin**: Tracks uploaded via Telegram are automatically assigned to the "Primary Administrator" of the instance (Root Admin or Super User).
*   **Ownership Repair**: If the bot is used in a channel with multiple admins, the system performs automatic ownership normalization during startup maintenance.
