# Lavori completati

Storico dei punti della [ROADMAP.md](ROADMAP.md) portati a termine.

## 5-bis. Interventi di scaling — completato (12 giugno 2026)

Deviazione richiesta dal piano originale: 5 interventi sui limiti documentati in `docs/scaling.md`.

1. **fsync per commit eliminato** (`database.ts`): aggiunto `pragma synchronous = NORMAL` — l'accoppiata raccomandata da SQLite con WAL. Gli import massivi si comportano come transazioni batchate senza ristrutturare lo scanner (il batching esplicito era impraticabile: il loop di scan ha `await` tra le scritture, incompatibile con le transazioni sincrone di better-sqlite3). Trade-off documentato: un power-cut può perdere gli ultimi commit, mai corrompere il DB.
2. **Scan schedulati off-peak** (`server.ts`, `admin.ts`): nuovo setting `scheduledScanHour` (0-23, ora locale del server, vuoto = off) accettato da `PUT /api/admin/settings` e letto a ogni tick (cambi senza riavvio). Check ogni 15 minuti, guard anti-doppia-esecuzione a 20h, stesso task-id dello scan manuale quindi mai concorrenti. **Residuo**: manca il campo nel pannello admin webapp (vedi roadmap).
3. **Nota Litestream** in `docs/scaling.md`: replica continua del WAL su S3/B2, esempio Docker Compose, restore al secondo. Solo DB: i file audio restano sul backup tool.
4. **Nota "scala federando"** in `docs/scaling.md`: il modello di scala intenzionale è più istanze federate (il catalogo federato le unifica già), non scaling verticale; PostgreSQL deliberatamente fuori scope, con motivazione.
5. **Pre-transcodifica lossless completata** — **bug trovato**: `library-sync.ts` impostava `file_path` al futuro `.mp3` per WAV *e* FLAC, ma accodava la conversione solo per i WAV. Risultato: l'mp3 dei FLAC non esisteva mai e ogni stream FLAC transcodificava al volo per sempre (il collo di bottiglia CPU principale). Fix: `queuedConversion` per tutti i lossless + self-healing nello scanner (al rescan, se un lossless ha l'mp3 dichiarato ma mancante, lo accoda).

**Test**: suite completa 605 verdi, typecheck pulito.

## 1. Cache del catalogo federato — completato (12 giugno 2026)

**Problema risolto**: ogni richiesta a `/api/stats/network/tracks` rifaceva il fetch live di `/api/catalog` di tutti i peer (timeout 5s ciascuno). Peer offline = catalogo sparito; latenza visibile a ogni apertura della pagina Network.

**Implementazione**:
- Nuovo servizio `src/server/modules/network/catalog-cache.service.ts` con strategia stale-while-revalidate su SQLite (tabella `peer_catalog_cache`):
  - entry fresca (< 1h): servita dalla cache, zero rete;
  - entry stale: servita subito, refresh in background (con dedup delle richieste concorrenti allo stesso peer);
  - peer mai visto: fetch live al primo incontro;
  - peer offline: continua a servire l'ultimo catalogo noto fino a 7 giorni (hard expiry con prune automatico).
- `src/server/routes/admin/stats.ts` usa il servizio; la vecchia `fetchCatalogsFromInstances` è stata rimossa (logica di fetch/parse spostata nel servizio, invariata).
- Protezione SSRF (`isSafeUrl`) mantenuta.

**Test**: 6 nuovi test in `catalog-cache.service.test.ts` (fresh/stale/offline/prune) + i 10 test esistenti di `stats.test.ts` verdi.

## 2. Migrazione live streaming a HLS server-side — completato (12 giugno 2026)

**Problema risolto**: la live usava Trystero/WebRTC mesh — il browser dell'artista caricava una copia dello stream per ogni ascoltatore (limite pratico ~20-50 listener). Ora un solo upload dal broadcaster scala con la banda del server.

**Implementazione**:
- Nuovo `src/server/modules/live/hls.service.ts`: un processo ffmpeg persistente per stanza legge i chunk webm/opus da stdin e genera una playlist HLS rolling (AAC 128k, segmenti da 4s, finestra di 6) in una dir temporanea per-room. Conteggio listener basato sui poll della playlist (finestra 30s). Cleanup automatico a stop/shutdown.
- `src/server/routes/api/live.ts`: nuovi endpoint `POST /api/live/:roomId/ingest` (solo proprietario della sessione, body raw fino a 15MB) e `GET /api/live/:roomId/hls/:file` (pubblico, con validazione anti path-traversal nel servizio); `/sessions` ora include `listenerCount`; start/stop gestiscono il ciclo di vita della pipeline.
- `webapp/src/pages/Live.tsx` riscritta: broadcaster usa MediaRecorder (webm/opus, chunk da 1s POSTati al server); listener riproduce via hls.js (nativo su Safari). Rimossa la dipendenza `trystero`; aggiunta `hls.js`.
- Latenza attesa: ~10-30s (accettabile per concerti/listening party). Hook futuro: gated access sugli stream per acquirenti/holder NFT.

**Test**: 6 nuovi test in `hls.service.test.ts` (lifecycle, path-traversal, listener count, ffmpeg mancante); build Vite della webapp verde; typecheck server pulito.

## 3. Sorgenti "grigie" opt-in, off di default — completato (12 giugno 2026)

**Problema risolto**: Soulseek, BitTorrent e gli streaming provider SoundCloud/Bandcamp (legalmente problematici per una piattaforma di vendita) erano attivi di default nel core.

**Implementazione** (riusato il sistema plugin esistente: `ProviderRegistry` + tabella `system_plugins` + toggle in Admin → IntegrationsPanel):
- Registrazione con `defaultEnabled = false` per soulseek/torrent (`download.service.ts`) e soundcloud/bandcamp streaming (`streaming.service.ts`). `syncRegistryWithDatabase` ripristina la scelta degli admin che hanno già fatto opt-in.
- **Bug fix**: `DownloadService.search()` usava `getAll()` ignorando il toggle — ora `getEnabled()`; `download()` rifiuta provider disabilitati.
- Nuovo middleware `src/server/middleware/provider-gate.ts` (`requireDownloadProvider`) applicato alle route che bypassavano il registry: `/api/search/content/soulseek/*`, `/api/admin/torrents/*` (`routes/network/torrent.ts`), `/api/admin/torrent-search/*`. Risposta 403 con istruzioni per l'opt-in.
- Auto-connect Soulseek allo startup (`server.ts`) e riconnessione su cambio credenziali (`admin.ts`) eseguiti solo a plugin abilitato.
- Disclaimer nelle descrizioni dei 4 provider, visibili nel pannello plugin ("enable only for content you own the rights to" / "against ToS").
- I provider metadata (MusicBrainz, Discogs, Bandcamp/SoundCloud metadata, ecc.) restano attivi nel core: legalmente tranquilli.

**Nota breaking**: le istanze esistenti che usavano queste sorgenti senza aver mai toccato i toggle le troveranno disattivate dopo l'aggiornamento — riattivabili in un click da Admin → Integrations/Plugins.

**Test**: 5 nuovi test in `provider-gate.test.ts` (default off, blocco 403, opt-in, esclusione da search, rifiuto download); suite completa 605 test verdi.

## 4. Trasparenza sulle fee — completato (12 giugno 2026)

**Scoperta**: oltre alle fee Stripe, TuneCamp stesso applica uno split artista/piattaforma 85/15 di default (`TuneCampCheckout`, 100% per artisti Pro; 0% effettivo se self-hosti la tua istanza). Il claim "fino al 100% dei ricavi" era doppiamente impreciso.

**Modifiche**:
- `docs/payments.md` § 3.1: nuova tabella onesta dei costi reali per l'artista (fee istanza 0-15%, Stripe ~2,9% + €0,30, gas Base, VPS) con esempio numerico €10 via Stripe self-hosted ≈ €9,41 (~94%) vs Bandcamp ≈ €8,50, e l'avvertenza che sotto ~€10-20/mese di vendite il costo fisso del VPS può rendere più conveniente una piattaforma hosted.
- `docs/comparison-funkwhale.md`: "trattenendo fino al 100% dei ricavi" → "senza fee di piattaforma se self-hosti" con link al calcolo.
- Verificati e lasciati invariati: `website/index.html` ("without platform middleman fees" — già onesto), `README.md` (split 85/15 dichiarato esplicitamente), `About.tsx` ("without intermediaries" riferito a dati/piattaforma, non ai ricavi).

## Finding #6 — token di download monouso — completato (12 giugno 2026)

Il JWT di sessione non è più accettato via query string o body su nessuna route payments: un link trapelato non è più una sessione trapelata.

- **Server** (`payments.ts`): nuovo `POST /api/payments/download-token` (auth header-only) che conia un JWT `purpose:'download'` con scadenza 5 minuti; le route di download accettano `?dt=` solo con quel purpose; i token download sono rifiutati su tutte le altre route autenticate (un link trapelato scade in minuti e non dà accesso oltre i download).
- **Webapp**: `getAssetDownloadUrl` ora asincrona con mint e cache del token (riuso fino a 30s dalla scadenza); `Store.tsx` refactorato (URL in stato via useEffect, click handler async).
- **Residuo fuori scope** (in roadmap): lo stesso pattern `?token=` esiste su `/api/tracks/:id/download`, link backup admin e stream chat.

**Test**: 2 nuovi (token sessione in query ignorato; mint + uso `dt` + rifiuto del token download come sessione); suite completa 611 verdi, build Vite ok.

## Follow-up security review pagamenti — completato (12 giugno 2026)

Corretti in `payments.ts` i finding aperti #3, #4, #7, #8 della review:
- **#3**: importo della label fee verificato contro `prezzo effettivo × adminFeePct` — sia fee in ETH nativo (`feeTx.value`, tolleranza 5%) che in USDC (parsing calldata ERC-20, tolleranza 1%).
- **#4**: `/verify` risolve il prezzo effettivo (price/price_usdc/currency) via `getTrackPriceFromRelease` come il percorso Stripe; tutti e tre i casi di verifica usano i valori effettivi.
- **#7**: `successUrl`/`cancelUrl` validati contro l'origine dell'istanza (publicUrl o host della richiesta) su entrambe le route di creazione sessione Stripe.
- **#8**: rate limit dedicato 30 req/15min per IP su `/verify` e `/subscription/verify`.

Restano aperti (tracciati in roadmap): #5 (accettato e documentato — trust sul contratto checkout, richiede admin malevolo) e #6 (JWT in query string).

**Test**: 4 nuovi test (override prezzo per-release, fee troppo bassa, fee corretta + burn della fee tx, URL di ritorno esterno respinto); suite completa 609 verdi.

## 7. Segnali di maturità — completato (12 giugno 2026)

**Docs backup/deploy**: `docs/backup-migration.md` risultava già completa (UI, API, tool CLI `backup.ts`/`restore.ts`) — nessun lavoro necessario.

**Pagina stato del progetto**: creata `docs/STATUS.md` — tabella onesta per area (stable/beta/opt-in/new), limiti noti, niente audit esterno dichiarato. Linkata in cima a `docs/index.md`.

**Security review del flusso pagamenti** (`payments.ts`) — `docs/security-review-payments.md`:
- **Corretti (High)**: (1) unlock code generati con `Math.random()` (PRNG predicibile → codici derivabili) → ora `crypto.randomBytes`; (2) `feeTxHash` senza replay protection (una sola fee tx poteva coprire infiniti acquisti split) → check sulla tabella hash usati + marker `FEE-` non spendibile.
- **Aperti e tracciati in roadmap**: importo della fee non verificato (Medium), `/verify` non risolve gli override di prezzo per-release (Medium), trust assumption sul contratto checkout (Medium), token in query string / redirect URL non validati / rate limit verify (Low). Nota sul modello di fiducia: i percorsi a presentazione-di-hash non verificano il sender.
- Verificati come corretti: firma webhook Stripe sul raw body, path handling dei download.

**Test**: suite completa 605 verdi, typecheck pulito.

## 5-bis (residuo). Campo UI per `scheduledScanHour` — completato (12 giugno 2026)

Aggiunto select "Scheduled Library Scan" (Disabled / 00:00-23:00) in `AdminSettingsPanel.tsx`, tipo aggiornato in `types/index.ts`. Build Vite verde.

## 6. NFT/Web3 come modulo opzionale — completato (12 giugno 2026)

**Esito della verifica** (segnalato dall'utente, confermato): il toggle `web3Enabled` esisteva già — switch in AdminSettingsPanel, persistito nelle settings, gating server-side in `payments.ts` (default off: il check è `=== "true"`), opzioni NFT nascoste in AdminReleaseEditor a toggle spento.

**Gap trovati e corretti nel CheckoutModal** (`webapp/src/components/modals/CheckoutModal.tsx`):
- Non leggeva `web3Enabled` dal config: mostrava il percorso crypto anche con Web3 disattivato. Ora lo switcher Card/Crypto appare solo con entrambi i percorsi disponibili.
- Il tab di default era "crypto" anche con Stripe configurato. Ora **Card è il default**; crypto diventa il percorso attivo solo quando è l'unico disponibile (niente Stripe). Tab riordinati (Card prima di Crypto).

**Test**: build Vite verde.

## 5. Hardening SQLite multi-utente — completato (12 giugno 2026)

**Esito della verifica**: il sotto-punto "spostare le scritture pesanti nel worker pool" era già implementato nel codice — parse metadata nel worker pool (`scanner.ts`), hashing "fast hash" economico (1MB testa+coda), waveform e conversioni in code separate con ffmpeg come processo figlio, `journal_mode=WAL` e `busy_timeout=5000` già attivi (`database.ts:32-33`). Le scritture SQLite residue sono micro-write sincroni, non un collo di bottiglia con WAL.

**Lavoro svolto**: il sotto-punto mancante era la documentazione. Creato `docs/scaling.md` (linkato da `docs/index.md`): tabella di dove gira ogni workload pesante e con che cap, limiti pratici onesti (letture ≈ banda/ffmpeg, non SQLite; scritture ok per uso normale, import massivi da schedulare off-peak; ~10 artisti + qualche centinaio di listener su un VPS 2vCPU; primo collo di bottiglia = transcodifica CPU, non il DB; multi-processo sullo stesso file SQLite non supportato), e mitigazioni (pre-transcodifica, scan notturni, CDN/X-Accel-Redirect).
