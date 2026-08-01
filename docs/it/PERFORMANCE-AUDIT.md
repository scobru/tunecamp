# Audit delle Prestazioni — tunecamp / sidecamp / graphofone

Data: 22-07-2026  
Ambito: `tunecamp/` (backend + webapp), `tunecamp-sidecamp/apps/sidecamp`, `tunecamp-sidecamp/apps/graphofone`.

Legenda stato: `[ ]` aperto · `[x]` risolto · `[~]` in corso

## Modello comune nei tre moduli
I/O sequenziale dove la concorrenza è banale (`await` per-file nei cicli `for`), mancanza di virtualizzazione degli elenchi, mancanza di paginazione/caching sugli endpoint per elenchi di grandi dimensioni.

---

## tunecamp (backend Node + SQLite, webapp React/Vite)

### Priorità Alta
- [ ] `src/server/modules/subsonic/subsonic.service.ts:186` `getAlbumList()` — JOIN+GROUP BY non limitato su tutti gli album, ordinamento/paginazione eseguiti in JS a ogni richiesta. Fix: `LIMIT/OFFSET` in SQL o cache TTL.
- [x] `src/server/modules/subsonic/subsonic.service.ts:75-76` `formatAlbum()` — N+1: `isStarred()`/`getItemRating()` per ogni riga album, nessun prefetch massivo (i brani lo eseguono già via `formatTracksBulk`). Risolto: `formatAlbumsBulk` effettua il prefetch del `Set` dei preferiti + `Map` delle valutazioni.
- [x] `src/server/modules/subsonic/subsonic.service.ts:80-90` `formatArtist()` — stesso problema N+1, raddoppiato (preferiti + valutazione), zero prefetch massivo. Risolto: aggiunto `formatArtistsBulk` con mappe pre-recuperate; `getIndexes`/`search`/`getStarred` lo richiamano ora invece di iterare su `formatArtist`.
- [ ] `src/server/modules/subsonic/subsonic.service.ts:198-204` `search()` — chiamata `db.getTracks()` per-album solo per calcolare songCount/duration. Fix: query di aggregazione (JOIN+GROUP BY).
- [x] `src/server/routes/library/albums.ts:296` — le copertine degli album inviate con `maxAge: 0` (cache disabilitata) mentre brani/artisti usano `maxAge: 86400000` (`tracks.ts:397`, `artists.ts:295,368`). Risolto: allineato a `86400000`.

### Priorità Media
- [ ] `src/server/modules/media/media-engine.ts:53-74` `sendStreamResult()` — assenza di `Cache-Control`/`ETag` sulle risposte degli stream audio.
- [ ] `src/server/modules/catalog/catalog.service.ts:217-230` `batchDeleteTracks()` — ogni `deleteTrack()` riattiva `syncRelease(albumId)`; N brani dello stesso album = N ri-sincronizzazioni. Fix: deduplicare gli `album_id`, sincronizzare una sola volta dopo il ciclo.
- [ ] `src/server/modules/storage/storage-usage.service.ts:33-55,159` `dirSize()` — `await fs.stat` sequenziale per file, non memorizzato in cache, eseguito a ogni richiesta di panoramica admin. Fix: `Promise.all` + breve cache TTL.
- [ ] `webapp/src/components/layout/MainLayout.tsx:6-11` — `CheckoutModal` (include `ethers`), `AuthModal`, `PlaylistModal`, `UnlockModal`, modali admin importati staticamente nella shell dell'app per ogni visitatore. Fix: `React.lazy()`.
- [x] `webapp/vite.config.ts:18-19` — `vite-plugin-node-polyfills` include `dgram`/`child_process`/`os`/`zlib`/`stream`, residuo dello stack ZEN/ZEN rimosso. Risolto: rimossi dall'`include`, restano solo `buffer`/`crypto`/`fs`/`path`/`process`/`util`/`url`/`events` (usati da `ethers`/altre lib). Rimosso anche l'alias morto `"zen" → src/zen.js` (file inesistente, mai importato).

### Priorità Bassa
- [ ] `src/server/repositories/album.repository.ts:99-115` `getWithStats()` — nessuna paginazione/LIMIT.
- [ ] `src/server/repositories/album.repository.ts:79-93` `getLibraryAlbums()` — fallback hardcoded silenzioso `LIMIT 1000`, nessun segnale `hasMore`.
- [ ] `src/server/routes/api/misc.ts:19-25,93` `getFilteredChangelog()` — `fs.readFileSync` + parsing a ogni richiesta, nessuna cache.
- [ ] `src/server/repositories/artist.repository.ts:121,301` — nessun LIMIT negli elenchi/ricerca artisti.
- [ ] `src/server/core/database.ts:1322-1360` — scansione completa della tabella `tracks` in memoria a ogni avvio, incondizionata.
- [ ] `webapp/src` — nessuna virtualizzazione sulle griglie Libreria/Pubblicazioni/Ricerca (non urgente, il backend limita a ~1000 righe).

---

## sidecamp (App Electron)

### Priorità Alta
- [x] `organizer.ts:50-83` `scanDir()` — `await fs.stat` + `await parseFile()` sequenziale per file, nessuna concorrenza. Risolto: elaborato a blocchi con `CONCURRENCY=8` (diviso in `scanOne()` + `Promise.all` a blocchi), rispecchia `track-meta.ts`.
- [x] `electron/peer/daemon.ts:63-96` `scanFolders()` — stesso ciclo sequenziale per file, eseguito a ogni avvio del demone + ogni `rescanAndSendManifest()`. Risolto: stesso pattern `CONCURRENCY=8` con `Promise.all` a blocchi; avanzamento emesso una volta per blocco.
- [x] `electron/main.ts:449-463` + `peer/daemon.ts` — ogni `torrent:seed`/`torrent:remove` attiva un `rescanAndSendManifest()` completo (ri-scansione + ri-parsing completo) anziché un aggiornamento incrementale del singolo file. Risolto: aggiunto `refreshAndSendManifest()` — aggiorna `magnetUri` sulle voci in cache di `fileIndex` e reinvia, senza ri-scansione/ri-parsing su disco.
- [ ] `electron/providers/network.ts:12-129` `getPeers`/`getPeerTracks`/`getCatalogTracks` — non limitati/senza paginazione, renderizzati in una tabella non virtualizzata.

### Priorità Media
- [ ] `electron/peer/daemon.ts:217-232` `handleRequest()` — audio inviato in streaming come base64-in-JSON su WebSocket (~33% di overhead). Fix: frame WS binari.
- [ ] `electron/organizer-cache.ts:33-61`, `electron/track-meta.ts:53-69` — l'intero file JSON di cache viene letto/riscritto su disco a ogni `cacheGet`/`cachePut`, mai potato.
- [ ] `src/App.tsx:1905-1966` — tabella Libreria non virtualizzata; `currentTime` (1/sec) forza il re-render completo dell'intera tabella.
- [ ] `src/App.tsx:95-2751` — singolo componente `App` di ~2750 righe, ~50 hook `useState`, ogni elemento si ri-renderizza a ogni tick di stato.
- [ ] `electron/providers/search.ts:132-172` `searchArchiveOrg()` — fino a 10 chiamate di metadati extra per ricerca, zero caching.
- [ ] Nessun HTTP keep-alive presente in `electron/` (`network.ts`, `uploader/index.ts` usano axios base, nessun `Agent` condiviso).
- [ ] `electron/providers/ytdlp.ts:23-68` — `fs.existsSync`/`mkdirSync`/`copyFileSync`/`chmodSync` sincroni bloccano il processo principale Electron a ogni download/ricerca.
- [ ] `src/services/platform/capacitorAdapter.ts:5-10,154-159` — gli array di listener eseguono solo `.push()`, nessun annullamento dell'iscrizione; il rimontaggio duplica le callback.

---

## graphofone (App Electron)

### Priorità Alta
- [x] `electron/library.ts:174-180` + `src/App.tsx:90` — `saveLibrary()` riscrive l'intero JSON della libreria su disco per ogni brano analizzato nel ciclo = I/O O(n²). Risolto: aggiunto `updateTrackMetaBatch()` (library.ts), collegato IPC (main.ts/preload.ts/env.d.ts), `handleAnalyze` accumula ora gli aggiornamenti ed esegue il flush una sola volta.
- [x] `src/App.tsx:89-102` `handleAnalyze()` — `setLibrary(prev => prev.map(...))` per-brano all'interno del ciclo = O(n²) re-render. Risolto insieme a quanto sopra — singolo `setLibrary`/`setMeta` dopo il ciclo.
