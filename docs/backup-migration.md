# Backup & Migration Guide

This guide describes how to back up your TuneCamp instance and migrate it to a new server while preserving all data, settings, and user sessions.

## 1. Backup Contents

A full TuneCamp backup is a gzipped TAR archive (`.tar.gz`) that contains:
- **`tunecamp.db`**: The SQLite database (all tracks, artists, users, and settings).
- **`.jwt-secret`**: The server's secret key (required to keep existing user sessions valid).
- **Config**: The config file, included for reference (restore logic relies primarily on the DB).

> The restore endpoint also accepts plain `.zip` archives for backward compatibility.

## 2. Automated Backup

Admins can trigger a backup via the UI or API:
- **Route**: `GET /api/admin/backup/full`
- **Output**: A downloadable `.tar.gz` archive (`Content-Type: application/gzip`).
- **Other routes**: `GET /api/admin/backup/audio` (audio-only), `POST /api/admin/backup/gdrive` (back up to Google Drive).

## 3. Migration (Restore) Flow

To move TuneCamp to a new server:

1. **Install TuneCamp**: Set up the new server following the [Development Guide](./development-guide.md).
2. **Transfer Music**: Manually copy the `music/` directory to the new server.
3. **Restore Data**:
   - Use the Admin UI to upload the backup archive, or
   - `POST /api/admin/backup/restore` with the archive as the `backup` form field (large files can be uploaded in chunks via `/chunk` + `/restore-chunked`).
4. **Verification**:
   - The system extracts the DB and `.jwt-secret`.
   - It reconnects to the database and verifies integrity.
   - **Important**: Restart the server after a restore to apply the new JWT secret and database.

## 4. Manual Database Backup (CLI)

If the UI is unavailable, you can copy the database directly. These tools operate on the raw SQLite file only (they do **not** produce or consume the full `.tar.gz` archive). Build first with `npm run build`:

```bash
# Backup: copies the DB to <dir>/tunecamp-<timestamp>.db (defaults to ./backups)
node dist/tools/backup.js ./backups

# Restore: copies a .db file over the live database (--force to overwrite)
node dist/tools/restore.js ./backups/tunecamp-2026-01-01.db --force
```

## 5. Persistence & Safety

- **File Locking**: The restore tool handles SQLite file locking by retrying the replacement operation.
- **Secret Migration**: Unlike many platforms, TuneCamp explicitly migrates the JWT secret to ensure that users don't have to log in again after a migration.
