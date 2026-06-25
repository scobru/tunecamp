# Scaling & Concurrency Limits

TuneCamp runs as a single Node.js process with SQLite. This is a deliberate trade-off: minimal ops for a single artist or small label, in exchange for hard limits you should know before pointing real traffic at it. This page documents where those limits actually are.

## How writes are kept off the hot path

The architecture already isolates the expensive work:

| Workload | Where it runs | Concurrency cap |
|----------|---------------|-----------------|
| Audio metadata parsing (scan/import) | Worker thread pool (`src/server/modules/workers/`) | 4 workers |
| File hashing | Main thread, but "fast hash" (first+last 1MB, MD5) — sub-millisecond per file | semaphore in scanner |
| Waveform generation | Dedicated queue → ffmpeg child process | separate queue |
| WAV→MP3 conversion | Dedicated queue → ffmpeg child process | dynamic, `min(cores−1, 4)` |
| Live HLS encoding | One ffmpeg child process per active broadcast | one per room |
| SQLite writes | Main thread, synchronous (better-sqlite3) | single writer |

SQLite runs with `journal_mode=WAL`, `synchronous=NORMAL` and `busy_timeout=5000` (set in `src/server/core/database.ts`). WAL means readers never block on the writer; NORMAL removes the per-commit fsync (the WAL checkpoint still syncs), so bulk imports with thousands of small writes behave like batched transactions without restructuring the scanner. The trade-off is documented and deliberate: a power cut can lose the last few commits, never corrupt the database.

## Practical limits

**Reads (streaming, browsing, API)**: effectively bounded by bandwidth and ffmpeg transcodes, not by SQLite. Hundreds of concurrent listeners streaming already-transcoded files is fine on a small VPS.

**Writes**: better-sqlite3 is synchronous on the main thread. Individual writes are microseconds under WAL, so normal usage (purchases, comments, play counts) never notices. The write path that can hurt is a **bulk import racing with peak traffic**: a 10,000-track scan performs tens of thousands of small writes interleaved with metadata parsing. The parsing is off-thread, the writes are not. Schedule large imports off-peak.

**Concurrent users**: as a rule of thumb, a 2-vCPU / 2GB VPS handles a small label comfortably — say up to ~10 artists uploading occasionally and a few hundred listeners. The first bottleneck you will hit is **CPU from on-the-fly transcoding** (capped at 4 concurrent ffmpeg tasks; further requests queue), not the database.

**What does not scale**: multiple TuneCamp processes against the same SQLite file. The single-writer design assumes one process.

## Outgrowing one instance: scale by federating

If a single instance genuinely hits its limits, the answer that fits TuneCamp's architecture is not a bigger database — it is **more instances**. Split by label, collective, or artist roster: each instance keeps its own SQLite file and its own ffmpeg budget, and the federated catalog (gossip-based discovery + `/api/catalog`) already presents them as one network to listeners. This is the intended scaling model, and it is why a PostgreSQL backend is deliberately out of scope: it would double the schema maintenance burden to solve a problem federation already solves, while sacrificing the zero-ops simplicity that is TuneCamp's main advantage over Funkwhale.

## If you hit limits

1. **Transcoding CPU**: lossless uploads (.wav and .flac) are pre-transcoded to MP3 320k at import time, so streams are served as static files. A rescan self-heals older libraries whose MP3s were never generated. For other on-the-fly cases (seek, bitrate reduction), raise `transcodeCacheMaxBytes` so transcodes are cached.
2. **Import contention**: set the `scheduledScanHour` setting (0–23, server time) to run the daily scan off-peak automatically; it shares a task lock with the manual scan so they never overlap.
3. **Bandwidth**: put the instance behind a CDN or use `xaccelRedirect` (nginx `X-Accel-Redirect` support is built in, see [NGINX](./NGINX.md)).

## Durability: continuous SQLite replication with Litestream

Nightly backups (`src/tools/backup.ts`) bound your data loss to a day. For a selling platform, [Litestream](https://litestream.io/) is the better fit: it tails SQLite's WAL and streams every change to S3/Backblaze B2, giving second-level recovery points with zero changes to TuneCamp itself — it runs as a sidecar process watching the database file. A minimal Docker Compose addition:

```yaml
litestream:
  image: litestream/litestream
  command: replicate /data/tunecamp.db s3://your-bucket/tunecamp
  volumes:
    - ./data:/data
  environment:
    - LITESTREAM_ACCESS_KEY_ID=...
    - LITESTREAM_SECRET_ACCESS_KEY=...
```

Restore with `litestream restore -o /data/tunecamp.db s3://your-bucket/tunecamp`. Note: Litestream replicates the database only — cover art and audio files still need the regular backup tool or object storage.
