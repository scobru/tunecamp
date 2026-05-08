# TuneCamp Task Diary

Chronological log of completed tasks and significant architectural decisions.

### 5. TypeScript Build Fix (Maintenance Service)
**Summary**: Fixed a TypeScript compilation error in the `MaintenanceService` caused by an incomplete object passed to `createAlbum`.
- **Files Modified**: `src/server/services/maintenance.service.ts`.
- **Details**: Added all required fields (slug, date, description, etc.) to the `createAlbum` call to satisfy the `Album` interface constraints. Generated a valid URL-friendly slug from the album title.

---

## 2026-05-06

### 1. Metadata Enrichment Integration
**Summary**: Integrated iTunes and Lyrics.ovh APIs to enhance music metadata retrieval without requiring API tokens.
- **Backend Changes**:
  - `src/server/metadata.ts`: Added `ITunesProvider` (high-res covers) and `getLyrics` method.
  - `src/server/routes/metadata.ts`: Created `GET /api/metadata/lyrics` endpoint.
- **Frontend Changes**:
  - `webapp/src/services/api.ts`: Added `fetchLyricsMetadata` method.
  - `webapp/src/components/modals/AdminTrackModal.tsx`: Added UI for lyrics retrieval.
- **Documentation**:
  - Updated `/docs/api-contracts.md`, `/docs/architecture-backend.md`, and `/docs/project-overview.md`.

### 2. Workflow Configuration
**Summary**: Updated project instructions to include a mandatory task diary.
- **Files Modified**: `agents/GEMINI.md`.
- **New Artifact**: `agents/DIARY.md`.

### 3. Frontend UI Enhancements & Rescan Functionality
**Summary**: Added missing "Full Rescan" functionality to the Admin UI and enhanced metadata search visibility.
- **Frontend Changes**:
  - `webapp/src/pages/Admin.tsx`: Added **"Full Rescan"** button in the System tab to trigger a deep library scan.
  - `webapp/src/services/api.ts`: Added `triggerRescan` method.
  - `webapp/src/components/MetadataMatchModal.tsx`: Updated UI to show iTunes as a metadata source and updated credits.
- **Verification**: Verified that the new buttons are present and correctly linked to the backend endpoints.

---

## 2026-05-07

### 3. Backup & Restore Hardening
**Summary**: Improved the reliability of the backup system, specifically for session continuity and cross-instance migrations.
- **Backend Changes**:
  - `src/server/routes/backup.ts`: 
    - Added `.jwt-secret` to the backup ZIP (if it exists).
    - Updated `performRestore` to identify and restore the `.jwt-secret` file.
    - Added retry logic to DB replacement to handle file locking issues.
- Functionality: Restoring a backup now preserves user sessions (JWT) and is more robust against operating system file locks.


---

## 2026-05-08

### 1. Google Drive Integration (Full Stack)
**Summary**: Completed the integration of Google Drive as an external storage provider for streaming and importing tracks.
- **Backend Changes**:
  - `src/server/services/google-drive.service.ts`: Implemented OAuth2 flow, token management, file browsing, and streaming.
  - `src/server/routes/storage.ts`: Created endpoints for OAuth, account management, file listing, and importing.
  - `src/server/routes/tracks.ts`: Added native support for `gdrive://` protocol in streaming and downloads.
  - `src/server/database.ts`: Added `storage_accounts` table and related methods.
- **Frontend Changes**:
  - `webapp/src/components/admin/StoragePanel.tsx`: New UI for connecting accounts and browsing/importing files.
  - `webapp/src/pages/Admin.tsx`: Integrated Storage tab into the dashboard.
  - `webapp/src/services/api.ts`: Added storage-related API methods.
- **Documentation**:
  - Updated `.env.example` with required Google Cloud credentials.

