# Performance Audit — tunecamp / sidecamp / graphofone

Date: 2026-07-22
Scope: `tunecamp/` (backend + webapp), `tunecamp-sidecamp/apps/sidecamp`, `tunecamp-sidecamp/apps/graphofone`.

Status legend: `[ ]` open · `[x]` fixed · `[~]` in progress

## Common pattern across all three
Sequential I/O where concurrency is trivial (per-file `await` in `for` loops), missing list virtualization, missing pagination/caching on large list endpoints.

---

## tunecamp (backend Node + SQLite, webapp React/Vite)

### High
- [ ] `src/server/modules/subsonic/subsonic.service.ts:186` `getAlbumList()` — unbounded JOIN+GROUP BY over all albums, sort/paginate done in JS on every request. Fix: `LIMIT/OFFSET` in SQL or TTL cache.
- [x] `src/server/modules/subsonic/subsonic.service.ts:75-76` `formatAlbum()` — N+1: `isStarred()`/`getItemRating()` per album row, no bulk prefetch (tracks already do this via `formatTracksBulk`). Fixed: `formatAlbumsBulk` prefetches starred `Set` + ratings `Map`.
- [x] `src/server/modules/subsonic/subsonic.service.ts:80-90` `formatArtist()` — same N+1, doubled (starred + rating), zero bulk prefetch. Fixed: added `formatArtistsBulk` with prefetched maps; `getIndexes`/`search`/`getStarred` now call it instead of looping `formatArtist`.
- [ ] `src/server/modules/subsonic/subsonic.service.ts:198-204` `search()` — per-album `db.getTracks()` call just to compute songCount/duration. Fix: aggregate query (JOIN+GROUP BY).
- [x] `src/server/routes/library/albums.ts:296` — album covers served with `maxAge: 0` (cache disabled) while tracks/artists use `maxAge: 86400000` (`tracks.ts:397`, `artists.ts:295,368`). Fixed: aligned to `86400000`.

### Medium
- [ ] `src/server/modules/media/media-engine.ts:53-74` `sendStreamResult()` — no `Cache-Control`/`ETag` on audio stream responses.
- [ ] `src/server/modules/catalog/catalog.service.ts:217-230` `batchDeleteTracks()` — each `deleteTrack()` re-triggers `syncRelease(albumId)`; N tracks same album = N re-syncs. Fix: dedupe album_ids, sync once after loop.
- [ ] `src/server/modules/storage/storage-usage.service.ts:33-55,159` `dirSize()` — sequential `await fs.stat` per file, uncached, run on every admin overview request. Fix: `Promise.all` + short TTL cache.
- [ ] `webapp/src/components/layout/MainLayout.tsx:6-11` — `CheckoutModal` (pulls in `ethers`), `AuthModal`, `PlaylistModal`, `UnlockModal`, admin modals statically imported into app shell for every visitor. Fix: `React.lazy()`.
- [ ] `webapp/vite.config.ts:18-19` — `vite-plugin-node-polyfills` includes `dgram`/`child_process`/`os`/`zlib`/`stream`, leftover from removed ZEN/Gun.js stack. Fix: trim to what `ethers` actually needs.

### Low
- [ ] `src/server/repositories/album.repository.ts:99-115` `getWithStats()` — no LIMIT/pagination.
- [ ] `src/server/repositories/album.repository.ts:79-93` `getLibraryAlbums()` — silent hardcoded `LIMIT 1000` fallback, no `hasMore` signal.
- [ ] `src/server/routes/api/misc.ts:19-25,93` `getFilteredChangelog()` — `fs.readFileSync` + parse on every request, no cache.
- [ ] `src/server/repositories/artist.repository.ts:121,301` — no LIMIT on artist listing/search.
- [ ] `src/server/core/database.ts:1322-1360` — full `tracks` table scan into memory on every boot, unconditional.
- [ ] `webapp/src` — no virtualization on Library/Releases/Search grids (not urgent, backend caps ~1000 rows).

**Verified clean:** listener/interval cleanup, single shared SQLite connection, batch insert paths (transactions + chunking), federated-discovery crawler (`Promise.allSettled` + depth caps), no lodash/moment, route-level `React.lazy` already used for pages.

---

## sidecamp (Electron app)

### High
- [x] `organizer.ts:50-83` `scanDir()` — sequential per-file `await fs.stat` + `await parseFile()`, no concurrency. Fixed: batched with `CONCURRENCY=8` (split into `scanOne()` + chunked `Promise.all`), mirrors `track-meta.ts`.
- [x] `electron/peer/daemon.ts:63-96` `scanFolders()` — same sequential per-file loop, runs on every daemon start + every `rescanAndSendManifest()`. Fixed: same `CONCURRENCY=8` chunked `Promise.all` pattern; progress now emitted once per batch.
- [x] `electron/main.ts:449-463` + `peer/daemon.ts` — every `torrent:seed`/`torrent:remove` triggers a full `rescanAndSendManifest()` (full re-walk + re-parse) instead of incremental single-file update. Fixed: added `refreshAndSendManifest()` — updates `magnetUri` on cached `fileIndex` entries and resends, no disk re-scan/re-parse.
- [ ] `electron/providers/network.ts:12-129` `getPeers`/`getPeerTracks`/`getCatalogTracks` — unbounded/unpaginated, rendered into un-virtualized table.

### Medium
- [ ] `electron/peer/daemon.ts:217-232` `handleRequest()` — audio streamed as base64-in-JSON over WebSocket (~33% overhead). Fix: binary WS frames.
- [ ] `electron/organizer-cache.ts:33-61`, `electron/track-meta.ts:53-69` — whole-cache JSON file read/rewritten on every `cacheGet`/`cachePut`, never pruned.
- [ ] `src/App.tsx:1905-1966` — Library table unvirtualized; `currentTime` (1/sec) forces full re-render of whole table.
- [ ] `src/App.tsx:95-2751` — single ~2750-line `App` component, ~50 `useState` hooks, everything re-renders on any state tick.
- [ ] `electron/providers/search.ts:132-172` `searchArchiveOrg()` — up to 10 extra metadata calls per search, zero caching.
- [ ] No HTTP keep-alive anywhere in `electron/` (`network.ts`, `uploader/index.ts` use plain axios, no shared `Agent`).
- [ ] `electron/providers/ytdlp.ts:23-68` — synchronous `fs.existsSync`/`mkdirSync`/`copyFileSync`/`chmodSync` block Electron main process on every download/search.
- [ ] `src/services/platform/capacitorAdapter.ts:5-10,154-159` — listener arrays only ever `.push()`, no unsubscribe; remount duplicates callbacks.

### Low
- [ ] `electron/providers/network.ts:47-48,98-99` — blocking `fs.existsSync` in async functions.
- [ ] `electron/providers/network.ts`, `electron/uploader/index.ts` — no `timeout` on axios calls.
- [ ] `src/App.tsx:1662,2423` — `.some()` inside `.map()` render callback, O(n·m). Fix: precompute `Set` (already done for `selectedSet`).
- [ ] `vite.config.ts` — no route-based code splitting; ~386KB bundle loads eagerly.
- [ ] `electron/organizer.ts` `organize:scan` — cache keyed off top-level dir mtime only; subdir changes may not bump it.
- [ ] `electron/beatport.ts`/`musicbrainz.ts` genre-fill loop — sequential w/ 1400ms sleep, intentional rate-limit (informational only, ~47min for 2000 tracks).

**Verified clean:** no keep-alive agent misconfig found elsewhere; `preload.ts` correctly does `removeAllListeners` dedup.

---

## graphofone (Electron app)

### High
- [x] `electron/library.ts:174-180` + `src/App.tsx:90` — `saveLibrary()` rewrites entire library JSON to disk per track analyzed in loop = O(n²) I/O. Fixed: added `updateTrackMetaBatch()` (library.ts), wired IPC (main.ts/preload.ts/env.d.ts), `handleAnalyze` now accumulates updates and flushes once.
- [x] `src/App.tsx:89-102` `handleAnalyze()` — `setLibrary(prev => prev.map(...))` per-track inside loop = O(n²) re-renders. Fixed together with the above — single `setLibrary`/`setMeta` after the loop.

### Medium
- [ ] `src/App.tsx:70-108`, `electron/library.ts:106-131` — analyze/import loops strictly sequential (`await` in `for`), no concurrency for CPU/I/O-bound decode/parse.
- [ ] `electron/library.ts:48-69` `findAudioFiles()` — sequential `fs.stat` per file instead of `Promise.all` per directory level, or skip via `withFileTypes: true`.
- [ ] `src/components/LibraryPanel.tsx:31-35` — full unfiltered/unpaginated table, no virtualization.
- [ ] `src/components/LibraryPanel.tsx:31-35` — `filtered` recomputed via `.filter()` on every render, no `useMemo`.

### Low
- [ ] `electron/library.ts:20-21,39-44` `saveLibrary()` — no debounce (unlike `saveGraph`, which is debounced).
- [ ] `electron/main.ts:82-112` `app:update-check` — no persisted cache across launches (minor).
- [ ] `src/App.tsx:151` `libraryForGraph` — `.map()` recomputed every render, not memoized, defeats `GraphView` memoization.
- [ ] `electron/library.ts:169-172` `readAudioFile()` — full-file read + buffer copy over IPC; fine at current scale.
- [ ] `src/App.tsx:60-63` — `.filter()` full-array scan just for early-return check.

**Verified clean:** `LogViewer`/`ProgressBar`/`QuickTour` listener cleanup correct; `saveGraph` IPC properly debounced; no DB (flat-file JSON, N/A for indexes).

**Not audited:** `graph-ui`/`audio-engine` workspace packages (consumed via `vite.config.ts:10-11` aliases) — outside `apps/graphofone` scope, but `GraphView` is a hot-path component in this app's render tree.

---

## Fix order (proposed)

1. graphofone: O(n²) `saveLibrary`/`setLibrary` per-track loop — cheapest fix, worst algorithmic complexity, in active analyze hot path.
2. sidecamp: sequential file scans (`organizer.ts`, `peer/daemon.ts`) — same batching fix reusable across both.
3. tunecamp: subsonic N+1 (`formatAlbum`/`formatArtist`) — mirror existing `formatTracksBulk` pattern already in the codebase.
4. tunecamp: album cover `maxAge: 0` — one-line fix, immediate cache win.
5. sidecamp: full-rescan on single torrent seed/remove — incremental index update.
