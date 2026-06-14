# Soulseek Integration

TuneCamp integrates with the **Soulseek** P2P network to allow administrators to search and download music files directly from other users.

## 1. Architecture

The Soulseek integration is implemented in `src/server/modules/integrations/soulseek.ts` (with a `DownloadProvider` wrapper at `src/server/providers/download/soulseek.provider.ts`). It uses a custom client to connect to the Soulseek server and handle peer-to-peer file transfers.

> **Opt-in:** Soulseek is disabled by default for legal reasons and must be enabled
> explicitly via the plugin toggles in the Admin panel.

### Key Features
- **Global Search**: Search for tracks or albums across the entire Soulseek network.
- **Peer Browsing**: View the shared files of a specific Soulseek user.
- **Download Queue**: Manages multiple concurrent downloads with automatic retries.
- **Automatic Importing**: Once a download is complete, the files are passed to the `Scanner` for processing and added to the library.

## 2. Directory Structure

Downloads from Soulseek are stored in:
- **Path**: `music/downloads/soulseek/`

## 3. Configuration

Normally configured via the Admin UI → Integrations panel. Fallback environment variables:
- `SLSK_USER`: Your Soulseek account username.
- `SLSK_PASS`: Your Soulseek account password.

## 4. Rate Limiting & Safety

To avoid being banned or overwhelming the server:
- **Search Limits**: The system implements a mandatory delay between searches.
- **Download Slots**: Only a limited number of files are downloaded simultaneously.
- **File Validation**: Downloaded files are checked for audio integrity before being imported.

## 5. Usage Flow

1. **Search**: Admin enters a query in the Soulseek tab of the dashboard.
2. **Results**: A list of matching files from various users is displayed, including bitrate and file size.
3. **Queue**: Admin selects files to download, which are added to the internal queue.
4. **Transfer**: The server establishes a direct P2P connection with the peer to download the file.
5. **Ingestion**: Once finished, the file is moved to the library and scanned.
