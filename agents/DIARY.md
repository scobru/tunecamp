# TuneCamp Development Diary

### 2026-05-11: Modular Federation Architecture & Global Search
- **TuneCamp Plugin SDK**: Created a formal SDK in `src/sdk/` defining standard interfaces for `MetadataProvider`, `StreamingProvider`, and `FederationProvider`. This enables external developers to extend TuneCamp functionality without touching core logic.
- **ActivityPub Integration**: Finalized the `ActivityPubFederationProvider` adapter, integrating the ActivityPub protocol into the main `FederationService` registry.
- **Global Search (Hybrid)**: Implemented `/api/search/global` which provides unified search results across local library (with RBAC via `VisibilityGuardian`) and external metadata providers (Bandcamp, etc.).
- **External Streaming Discovery**: Enabled the ability to stream tracks directly from search results using virtual IDs (`ext:provider:id`). The backend now handles these IDs via redirect in the stream route.
- **Unified Search UI**: Updated the frontend `Search.tsx` to display both "Your Library" and "Discover" sections, providing a seamless transition between local and remote content.
- **Build Success**: Verified that the entire TypeScript codebase compiles successfully after these architectural shifts.

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

---

## 2026-05-11

### 1. Scanner Refactoring for Manual Release Management
**Summary**: Refactored the library scanner to prevent automatic creation of formal releases, giving users manual control over the public catalog.
- **Files Modified**: `src/server/scanner.ts`, `agents/GEMINI.md`.
- **Backend Changes**:
    - Modified `Scanner.processReleaseConfig` to create/update library albums (in `albums` table) instead of formal releases (in `releases` table).
    - Set default status to `'draft'` and `is_release: false` for all scanned content.
    - Updated `GEMINI.md` with a new mandate ensuring manual release management.
- **Details**: This change ensures that rescanning the library does not clutter the "Admin Releases" section with automatically generated drafts. Metadata from `release.yaml` is still preserved in the library album, which can be manually promoted to a release via the UI.

### 1. Synchronization of Undocumented Features
**Summary**: Synchronized project documentation with advanced features already present in the codebase (Torrent, Hybrid Payments, Linda Bridge).
- **Torrent System**: Documented `TorrentService` (WebTorrent) and related routes for magnet link management and auto-importing.
- **Hybrid Payments**: Documented Stripe Checkout, Stripe Crypto Onramp, and On-chain Verification logic (Base Network).
- **Linda Messaging**: Documented the Zen-based bridge for decentralized messaging, group management, and track forwarding.
- **Agent Updates**: Updated `tc-web3-payments` skill to include Stripe and Onramp management.

---

## 2026-05-13

### 1. Architectural Cleanup & Legacy File Removal
**Summary**: Finalized the transition to the modular architecture by removing redundant legacy files from the root `src/server/` directory and synchronizing all imports.
- **Files Removed**:
    - `src/server/auth.ts` (Replaced by `modules/auth/auth.service.ts`)
    - `src/server/scanner.ts` (Replaced by `modules/catalog/scanner.ts`)
    - `src/server/zen.ts` (Replaced by `modules/network/zen.ts`)
    - `src/server/waveform.ts` (Replaced by `modules/waveform/waveform-peak.service.ts`)
    - `src/server/ffmpeg.ts` (Replaced by `modules/media/ffmpeg.ts`)
- **Impact**:
    - Updated `src/tools/verify_consolidation.ts` to use the modular scanner.
    - Fixed broken imports in multiple test files (`subsonic.test.ts`, `tracks.test.ts`, etc.) that were still pointing to the legacy root files.
    - Verified build success with `npm run build`.
- **Result**: The codebase is now cleaner, with a clear separation between modular services and the server entry point.

### 2026-05-15: Fixing Modular Refactoring Regressions & YouTube Auth
- **Test Suite Restoration**: Fixed all regressions introduced by the modular architecture refactoring.
    - Updated over 15 test files with corrected relative import paths (moving from root to `core/`, `modules/`, etc.).
    - Fixed `unstable_mockModule` relative paths and mapping issues in ESM.
    - Updated mock objects for `ScannerService`, `AuthService`, and `DatabaseService` to match current interfaces.
    - Fixed benchmark foreign key constraint failures by seeding admin users.
    - Resolved TypeErrors in database performance tests by ensuring mock returns match expected shapes.
    - **Result**: All 304 tests in 47 suites are now passing.
- **YouTube Auth Enhancements**:
    - Supported manual cookie upload in the admin panel to bypass bot detection.
    - Updated `Dockerfile` to include `python3`, `libc6-compat`, and `gcompat` for robust `yt-dlp` execution in production.
    - Verified `YouTubeProvider` integration with `YouTubeCookieManager`.

### 2026-05-16: Application Hardening & yt-dlp Fixes
- **Album Cover Redirection**: Fixed a bug in `src/server/routes/library/albums.ts` where external HTTP URLs in `cover_path` were incorrectly being looked up on the local disk. Added immediate HTTP redirect for such cases.
- **Localization Service Process Fix**: Resolved a mysterious `yt-dlp: error: no such option: --binary` error in `LocalizationService` caused by the `youtube-dl-exec` wrapper's faulty argument mapping in its `v3.x` layer. Replaced the wrapper with direct `yt-dlp` execution via `child_process.execFile` for improved reliability and precision.
- **Bot Detection Resilience**: Synchronized `LocalizationService` parameters with `YouTubeProvider` to use the most resilient client configurations (mweb/android).

### 2026-05-27: Database Consolidation & WebTorrent Compilation Fix
- **Database Consolidation**: Fused physical `releases` and `release_tracks` tables into `albums` and `tracks` tables respectively, completely removing row-copying duplication on album promotion.
- **Backward-Compatible SQL Views**: Established `releases` and `release_tracks` as SQL views, ensuring zero breakage for existing API and database consumers.
- **Repository Optimization**: Refactored `AlbumRepository`, `ReleaseTrackRepository`, and `TrackRepository` to remove all copy synchronization logic, updating links directly.
- **Startup Maintenance Repair**: Cleaned up `maintenance.startup.ts` to execute updates directly on the `albums` table rather than attempting to update read-only SQL views on startup.
- **WebTorrent Build Fix**: Resolved a compiler block in `torrent.service.ts` by adding `await` to the async `client.get()` call.
- **Verification**: Verified 100% test suite coverage success (57/57 suites, 408/408 tests passed).

---

## 2026-06-05

### 1. Agent Alignment & Plugin SDK Cleanup
**Summary**: Cleaned up the deprecated `tc-plugin-sdk` agent and aligned the remaining 10 agents with modular server paths and active features (such as Stripe Checkout, Google Drive, WebTorrent seeding, and Setup Wizard flows).
- **Files Deleted**: `agents/tc-plugin-sdk.skill`, `agents/tc-plugin-sdk/SKILL.md` (and corresponding local/global plugin directories).
- **Files Modified**: `agents/tc-adoption-ux/SKILL.md`, `agents/tc-auth-security/SKILL.md`, `agents/tc-db-logic/SKILL.md`, `agents/tc-federation-zen/SKILL.md`, `agents/tc-integrations/SKILL.md`, `agents/tc-media-engine/SKILL.md`, `agents/tc-qa-testing/SKILL.md`, `agents/tc-subsonic-plugins/SKILL.md`, `agents/tc-ux-frontend/SKILL.md`, `agents/tc-web3-payments/SKILL.md`.
- **Result**: Synchronized the local `.gemini/skills/` directory and globally registered plugins under `C:/Users/scobr/.gemini/config/plugins/` to reflect these changes.

### 2. Code Optimizations & Test Alignment
**Summary**: Added preemptive seeding path validation, parameterized ZEN off-heap memory evictor thresholds in `.env`, and fixed a mock regression in `auth.test.ts`.
- **Files Modified**: `src/server/modules/integrations/torrent.service.ts`, `src/server/modules/network/zen.ts`, `.env.example`, `src/server/routes/auth/__tests__/auth.test.ts`.
- **Verification**: Verified successfully with `npm run build` and `npm test` (all 559 tests passed).

### 3. Cleanup of Deprecated Environment / Build Configs
**Summary**: Purged deprecated and unused environment/build variables (`COINBASE_`, `MOONPAY_`, `SPOTIFY_`, `PAYPAL_`) from configuration files to keep them clean for deployment.
- **Files Modified**: `Dockerfile`, `docker-compose.yml`, `.env.example`.
- **Result**: Pushed all alignment, optimization, and cleanup changes successfully to `main` branch on origin.


