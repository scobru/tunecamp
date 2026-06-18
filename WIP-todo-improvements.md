# WIP — TODO.md improvements (handoff)

Branch: **`feat/todo-improvements`** (based on `main`). All work is committed and pushed.
This file tracks what's done and what's left so the session can resume cleanly.

Origin of the work: the 5 points in [`TODO.md`](TODO.md). Product decisions taken with the user:
- **#2 Live**: opt-in recording (toggle at Go Live, default OFF) → becomes a private track.
- **#4 Now-listening**: internal opt-in only (NO Last.fm for now).
- **#5 client cache**: ETag + TanStack Query (NO IndexedDB for now).

## Commits so far (main..HEAD)
```
110c55d3 feat(live): backend opt-in session recording (UI pending)
8b0b6732 chore: lock @tanstack/react-query in root lockfile
b8e317a6 perf(webapp): cache catalog lists with TanStack Query
38dcd6be perf(api): memoize list endpoints with short-TTL cache + ETag/304
b282f047 fix(plugins): fire onEnable/onDisable hooks and restore persisted state
98f9ca53 feat(live): add audio input device picker
```

## Build / test commands
- Server typecheck: `npx tsc --noEmit`  · build: `npx tsc`
- Server tests: `node --experimental-vm-modules node_modules/jest/bin/jest.js <path-or-pattern>`
- Webapp typecheck/build: `cd webapp && npx tsc -b` / `npm run build`
- Commit rule (repo memory): work on a branch, never commit to main; verify branch + use explicit pathspec; do NOT commit `dist/` (gitignored). End commit messages with the Co-Authored-By trailer.

---

## Status by TODO point

### ✅ #1 — Live audio input device picker (DONE)
`webapp/src/pages/Live.tsx`: device `<select>` from `enumerateDevices()` (audioinput), `deviceId` passed into `getUserMedia`. Labels unlock after first permission grant.

### ✅ #3 — Plugins: lifecycle hooks + docs (DONE)
The registry already had `onEnable`/`onDisable`; the bug was `loadPlugins()` registered enabled-by-default and ran after the services' `syncRegistryWithDatabase`, so hooks never fired and persisted enable/disable state was lost on restart.
- `src/server/core/plugin-loader.ts`: now registers plugins **disabled**, then reconciles against `db.getPluginState(id)` via `registry.enable()/disable()` (which fire the hooks). Takes `db` param.
- `src/server/server.ts`: `loadPlugins(undefined, database)`.
- `docs/PLUGINS.md`: panel is **Admin → Integrations** (not "Plugins"); documented lifecycle hooks.
- How to test the demo plugin: it's `plugins/demo-provider.js` (id `demo`). Restart server → see `onEnable` log; appears in **Admin → Integrations** (root admin) with toggle; search `soundhelix`/`demo`/`helix` returns its tracks.

### ✅ #5 — Performance (DONE, server + client)
**Server** — `src/server/common/list-cache.ts` (new):
- `serveCachedList(req, res, scopeKey, produce, ttlMs=8000)`: short-TTL response memo keyed by access scope + weak ETag → browser revalidates and gets 304.
- `invalidateListCacheOnMutation` middleware: any successful non-GET to a resource router clears the whole cache (so star/rating/upload show up on the next read).
- Applied to GET handlers + mounted the mutation middleware in: `routes/library/artists.ts`, `albums.ts`, `releases.ts`, `tracks.ts`. The big win was `/api/artists`, which recomputed over the entire catalog on every request.

**Client** — TanStack Query (`@tanstack/react-query` ^5.101.0):
- `webapp/src/lib/queryClient.ts` (QueryClient, staleTime 30s, no refetch-on-focus).
- `webapp/src/hooks/queries.ts`: `useArtists/useAlbums/useReleases/useCatalog/useTracks` + `queryKeys` (static keys). Hooks accept `{ enabled }`.
- `webapp/src/main.tsx`: wrapped in `QueryClientProvider`.
- `webapp/src/stores/useAuthStore.ts`: `invalidateQueries()` on login/register, `clear()` on logout (per-user filtered lists refetch under the new identity — static keys don't refetch on auth change otherwise).
- Migrated pages: `Artists`, `Tracks`, `Releases`, `Library` (albums, gated via `enabled`), `Home` (catalog), `Favorites` (4 lists; unstar patches the source caches via `setQueryData`). Artists star/delete use `setQueryData` to keep optimistic UX.
- **Not migrated (intentional, optional follow-up):** admin panels & modals still call `API.getArtists/...` directly (`components/admin/*`, `components/modals/*`, `pages/Profile.tsx`, `pages/AdminReleaseEditor.tsx`, `hooks/useOwnedNFTs.ts`). Migrating them would add dedup but isn't required.

### 🚧 #2 — Live opt-in recording (BACKEND DONE, FRONTEND UI PENDING)
Backend is complete, typechecks, tests pass; feature is **off by default** because the UI toggle isn't wired yet (so this is safe/dormant).
- `src/server/modules/live/hls.service.ts`: `start(roomId, { record })` adds a 2nd ffmpeg output → persistent `.m4a` in `os.tmpdir()/tunecamp-live-rec` (outside the per-room HLS dir so it survives cleanup). `stop()` now awaits clean ffmpeg exit and **returns the recording path** (or null). Added `discardRecording()`.
- `src/server/routes/api/live.ts`: `/start` reads `record`; `/stop` captures the recording path and `finalizeRecording()` ingests it as a **private track** for the broadcaster via `scanner.processAudioFile(..., { title })`, attributed to the broadcaster (resolved from `session.username` via `authService`), runs in background after responding. `/stop` response includes `recording: boolean`.
- `webapp/src/services/api.ts`: `startLive(title, record=false)` sends `record`; return type includes `recording?`.

**REMAINING — `webapp/src/pages/Live.tsx` UI only:**
1. Add state: `const [record, setRecord] = useState(false);` and `const [isRecording, setIsRecording] = useState(false);`
2. In `handleGoLive`: `const session = await API.startLive(title.trim() || "Live session", record);` then `setIsRecording(!!(session as any).recording);`
3. In `teardownBroadcast`: also `setIsRecording(false);`
4. In the `!isBroadcasting` form (near the device picker / title input) add a checkbox:
   ```tsx
   <label className="label cursor-pointer justify-start gap-3">
     <input type="checkbox" className="checkbox checkbox-sm"
            checked={record} onChange={e => setRecord(e.target.checked)} />
     <span className="label-text text-sm">Record this session (saved as a private track in your library)</span>
   </label>
   ```
5. In the "You are live" block, when `isRecording`, show a small "● Recording — will be saved to your library" note.
6. Verify: `cd webapp && npx tsc -b`, then commit.
7. (Manual) end-to-end check needs real ffmpeg (`FFMPEG_PATH`) + a browser: go live with record on, stop, confirm a private track appears in the broadcaster's library.

### ⬜ #4 — Now-listening (internal opt-in) — NOT STARTED
Scope: per-user opt-in (default OFF); a page showing what opted-in users are currently listening to. **No Last.fm.** Respect privacy (only opted-in users appear); view should be **members-only** (consistent with playlists, per repo memory `project_playlists_members_only`).

Suggested plan:
- **Presence store (backend):** an in-memory `NowPlayingService` (map `username -> { trackId, title, artist, updatedAt }`, TTL ~60s) — mirrors `HlsLiveService` listener tracking; no migration needed since presence is ephemeral. Register it in the service container.
- **Opt-in preference:** needs a **per-user** setting (default false). FIRST investigate where user-level prefs live — `identity.getSetting` is instance-level; check the users table / `social` manager / any `user_settings` for a per-user store. This is the main unknown to resolve before building.
- **Endpoints** (new `src/server/routes/api/now-playing.ts`, mount under `/api/now-playing`):
  - `POST /api/now-playing` (auth): `{ trackId, title, artist }` heartbeat — only records if the caller opted in.
  - `GET /api/now-playing` (members-only): list of `{ username, alias, avatar, title, artist }` for opted-in users seen within TTL.
  - opt-in toggle: add to the existing user-settings endpoint once the pref store is found.
- **Frontend:**
  - `webapp/src/components/player/PlayerBar.tsx`: on track change (+ periodic ~20s), if opted in, call a new `API.nowPlaying(...)`.
  - Settings/profile: a toggle for the opt-in.
  - New page (e.g. `/now-listening`) polling `GET /api/now-playing` ~10s + a `Sidebar` entry.
- Cache note: don't route now-playing writes through the list-cache mutation middleware (they're high-frequency; would thrash the cache). It's a separate router, so it won't — just keep it that way.

---

## Open verification debts
- Nothing has been run end-to-end in the real app this session (changes are typecheck- + unit-test-verified). Live recording especially needs a manual run with ffmpeg + browser.
- Webapp production build passed (`npm run build`) after the TanStack migration.
