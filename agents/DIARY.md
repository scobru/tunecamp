# TuneCamp Task Diary

Chronological log of completed tasks and significant architectural decisions.

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
