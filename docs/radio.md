# Radio

TuneCamp can broadcast a single always-on **radio station** from your own
library. It transcodes a queue of tracks into a looping HLS stream that anyone
can tune into — in the browser at `/radio`, or in any external player via an
M3U or podcast-style RSS feed.

There is one station per instance. Only admins start and stop it; listening is
public.

## How it works

When you start the station, TuneCamp resolves the selected sources into a queue
of tracks, writes an FFmpeg `concat` playlist, and spawns FFmpeg to produce a
rolling HLS stream (`-stream_loop -1`, so the queue repeats forever). Listeners
pull the HLS playlist; the station survives a server restart and resumes
automatically (see [Monitoring](./monitoring.md) for process health).

> **Local files only.** The radio can only broadcast tracks that have a real
> audio file on the server. Cloud (`gdrive://`), external, and network tracks
> have no local file and are silently skipped. If *none* of your picks have a
> local file, starting the station fails with a clear error.

## Building a station (Admin → Radio)

1. Open **Admin Panel → Radio**.
2. Give the station a **name**.
3. Pick its content. You can combine, with checkboxes, any number of:
   - **Your playlists** — the custom playlists on the instance.
   - **Genre mixes** — one dynamic mix per genre in your library (e.g. *Rock
     Mix*, *Jazz Mix*). These are computed live from every track tagged with
     that genre — you don't have to maintain them.
   Tracks from all selected sources are **merged into one queue, with
   duplicates removed** (a track in two picks plays once).
4. Optionally enable **Shuffle queue**.
5. Click **Start Radio**.

The selection is persisted, so after a server restart the station resumes and
**re-resolves each source fresh** — newly added tracks in a chosen playlist or
genre are picked up automatically on the next restart.

To change the line-up, **Stop** the station and start it again with a new
selection.

## Listening

| Where | URL |
|-------|-----|
| In-browser player | `/radio` |
| HLS stream (VLC, mpv, web players) | `/api/radio/hls/stream.m3u8` |
| M3U playlist (VLC, foobar2000) | `/api/radio/stream.m3u` |
| Podcast/RSS feed (Pocket Casts, AntennaPod) | `/api/radio/feed.rss` |

The `/radio` page also shows the current track and a live listener count.

## API

See [API Contracts → Radio](./api-contracts.md#radio-apiradio) for the full
endpoint list. The admin endpoint accepts a `sources` array mixing numeric
playlist ids and `genre:<name>` ids:

```jsonc
POST /api/radio/start
{
  "name": "Late Night Mix",
  "sources": ["12", "genre:ambient", "genre:jazz"],  // playlist #12 + two genre mixes
  "shuffle": true
}
```

`playlistId` (single) and an explicit `trackIds` array are still accepted for
backward compatibility; when `sources` is present it takes precedence.
