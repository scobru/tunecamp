# Backup & Migration Guide

This guide describes how to back up your TuneCamp instance and migrate it to a new server while preserving all data, settings, and user sessions.

## 1. Backup Contents

A TuneCamp backup is a ZIP file that contains:
- **`tunecamp.db`**: The SQLite database (all tracks, artists, users, and settings).
- **`.jwt-secret`**: The server's secret key (required to keep existing user sessions valid).
- **Settings**: Instance-specific configurations stored in the database.

## 2. Automated Backup

Admins can trigger a backup via the UI or API:
- **Route**: `POST /api/admin/backup`
- **Output**: A downloadable ZIP file.

## 3. Migration (Restore) Flow

To move TuneCamp to a new server:

1. **Install TuneCamp**: Set up the new server following the [Development Guide](./development-guide.md).
2. **Transfer Music**: Manually copy the `music/` directory to the new server.
3. **Restore Data**:
   - Use the Restore tool: `npm run restore -- path/to/backup.zip`
   - Alternatively, use the Admin UI to upload the backup ZIP.
4. **Verification**:
   - The system will extract the DB and `.jwt-secret`.
   - It will attempt to reconnect to the database and verify integrity.
   - **Important**: Restart the server after a restore to apply the new JWT secret and database.

## 4. Manual Backup (CLI)

If the UI is unavailable, you can back up manually:
```bash
# Backup
npx ts-node src/tools/backup.ts

# Restore
npx ts-node src/tools/restore.ts backup_2024-05-09.zip
```

## 5. Persistence & Safety

- **File Locking**: The restore tool handles SQLite file locking by retrying the replacement operation.
- **Secret Migration**: Unlike many platforms, TuneCamp explicitly migrates the JWT secret to ensure that users don't have to log in again after a migration.
