# Google Drive Integration

TuneCamp allows administrators to link a Google Drive account to stream, import, and localize music files directly from the cloud.

## 1. OAuth2 Workflow

The integration uses the Google OAuth2 protocol to securely access user files.
- **Service**: `src/server/modules/storage/google-drive.service.ts`
- **Scopes**:
  - `drive.readonly`: To list and download files.
  - `drive.file`: To upload files (if needed).
  - `userinfo.email`: To identify the connected account.

### Authentication Steps:
1. Admin clicks "Connect Google Drive" in the Storage tab.
2. Redirected to Google Consent screen via `GET /api/storage/gdrive/auth`.
3. After approval, Google redirects back to `/api/storage/gdrive/callback?code=...`.
4. Backend exchanges the code for an `access_token` and `refresh_token`.
5. Tokens are encrypted and stored in the `storage_accounts` table.

## 2. Cloud Streaming

TuneCamp supports streaming directly from Google Drive without downloading the file to the local server first.
- **Protocol**: Tracks with a `file_path` starting with `gdrive://` are treated as cloud tracks.
- **Mechanism**:
  1. When a stream is requested, `GoogleDriveService.getFileStream` is called.
  2. It uses the `alt=media` Google Drive API parameter.
  3. Supports **Range Requests** (seeking) by passing the HTTP Range header directly to the Google API.

## 3. Importing & Localization

### Importing
- Admins can browse their Drive folders (`GET /api/storage/gdrive/files`).
- Selecting a file creates a track record in the database with `file_path: gdrive://{fileId}`.
- Metadata (Title/Artist) is tentatively parsed from the filename.

### Localization
- **Purpose**: Converts a cloud track (`gdrive://`) into a local file on the TuneCamp server.
- **Mechanism**: The backend downloads the file from Drive, saves it to the local `music/tracks/` folder, and updates the database record to point to the local path.

## 4. Configuration

Credentials can be set either via environment variables or in the Admin UI
(Storage tab → `google_drive_client_id` / `google_drive_client_secret` settings,
which take precedence over the env vars).

Environment variables:
- `TUNECAMP_GDRIVE_CLIENT_ID`: From Google Cloud Console.
- `TUNECAMP_GDRIVE_CLIENT_SECRET`: From Google Cloud Console.

The OAuth redirect URI is derived from the instance public URL:
`https://your-domain.com/api/storage/gdrive/callback`.
