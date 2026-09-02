# Adding Music

This is the reference for getting audio into a TuneCamp instance: where the
library lives on disk, what the scanner does with it, and how a scanned folder
becomes a public release. Every UI step names the URL it lives at, so you can
paste it after your own domain (`https://music.example.com/admin`).

## 1. Where the library lives

TuneCamp reads one folder, and only one: **`TUNECAMP_MUSIC_DIR`**. Everything it
imports, uploads or generates lands under it.

Two environment variables name a music folder, and the difference trips people
up. They are not aliases, and neither is deprecated:

| Variable | Who reads it | What it means | Set it when |
| :------- | :----------- | :------------ | :---------- |
| `TUNECAMP_MUSIC_PATH` | Docker Compose | The folder **on the host** to mount into the container | You run `docker compose`. Default `./music` |
| `TUNECAMP_MUSIC_DIR` | The server | The path the server actually reads | You run from source (`npm start`). Default `./music` |

Under Docker you set `TUNECAMP_MUSIC_PATH` and stop there: `docker-compose.yml`
mounts that host folder at `/music` and pins `TUNECAMP_MUSIC_DIR=/music` for
you. Setting `TUNECAMP_MUSIC_DIR` yourself in a Compose deployment points the
server at a path inside the container that nothing is mounted on.

```bash
# .env — Docker
TUNECAMP_MUSIC_PATH=/srv/music

# .env — running from source
TUNECAMP_MUSIC_DIR=/srv/music
```

The default host folder is `./music` inside the clone. It is gitignored, so
your library never shows up in `git status`.

## 2. Load your music before the first start

You do not have to wait for the app to be up. Put your files in place first and
the very first scan picks them all up:

```bash
git clone https://github.com/scobru/tunecamp.git
cd tunecamp

mkdir -p music
cp -r ~/Albums/* music/          # or: set TUNECAMP_MUSIC_PATH=/srv/music in .env

docker compose up -d --build
```

**One folder per album.** The scanner groups tracks by their containing folder,
names the album after that folder, and looks inside it for cover art
(`cover.jpg`, `cover.png`, `folder.jpg`, `folder.png`, `artwork.jpg`,
`artwork.png`, or `artwork/cover.jpg`). Nesting is free — organise by artist,
by year, however you like:

```
music/
└── Boards of Canada/
    └── Music Has the Right to Children/
        ├── cover.jpg
        ├── 01 Wildlife Analysis.flac
        └── 02 An Eagle in Your Mind.flac
```

Per-track title, artist, album artist, track number, year and genre come from
the file's own tags (ID3, Vorbis comments, MP4 atoms). Untagged files still
import — they just arrive with the filename as the title.

## 3. Run the scan

Scanning is **not** automatic on startup. Trigger it from
**`/admin` → Maintenance tab → `Rescan Library`**.

That one button walks the whole library folder, reads tags, generates
waveforms, extracts cover art, and skips files it has already imported, so it
is safe to press again after every change on disk. Progress shows in the task
list on the same panel.

To have it run by itself, set **`/admin` → Settings → Scheduled Library Scan**
to an off-peak hour. It is `Disabled` by default.

Two other ways in, both of which scan the file as it arrives:

- **Upload through the web UI** — see *Uploading through the web UI* below.
- **[Telegram bot](./telegram.md)**, **[Google Drive](./google-drive.md)**, or
  the **[Sidecamp desktop app](./sidecamp.md)** (Soulseek, torrents, yt-dlp).

## 4. Draft → public: what a scan actually creates

A scanned folder becomes a **library album**: `status: draft`,
`visibility: private`. It is in your library and playable by you, and invisible
to the public. Nothing you scan is exposed until you say so — there is no
"Draft mode" page to hunt for; draft is a state your albums are already in.

Promotion is two hops, in two different screens:

1. **`/my-music`** lists your library albums. `Promote` on one turns it into a
   *formal release* — the thing that can be priced, sold, federated and
   downloaded. It is still a draft.
2. **`/admin` → Releases tab** lists formal releases. Open one to fill in the
   release metadata (cover, year, licence, price, links), then `Publish` to
   make it publicly visible.

A library album you never promote stays a private album — perfectly fine if
you are running TuneCamp as a personal streaming server rather than a store.

## 5. Uploading through the web UI

**`/admin/release/new`** creates a release and uploads its audio in one pass.
Drop the audio files in and TuneCamp reads their tags immediately, filling in
the release title, album artist, year and genre plus each track's title and
number, so a well-tagged album needs almost no typing. Anything it guesses is
editable before you save, and fields you have already filled in are never
overwritten.

Where uploaded audio lands:

| Uploaded... | Stored at |
| :---------- | :-------- |
| into a release | `<music>/releases/<release-slug>/` |
| with no release attached | `<music>/tracks/` |

`tracks/` is the holding area for loose audio — a single, a demo, anything not
yet part of a release. Promoting or attaching it later does not move the file;
the database keeps the link.

## 6. The folders TuneCamp creates

Alongside whatever you put in yourself, the app writes these under the music
folder. Left alone, they are safe; they are listed here so nothing in there
looks mysterious.

| Folder | Holds |
| :----- | :---- |
| `releases/<slug>/` | Audio for a formal release, plus its `artwork/` and `release.yaml` |
| `tracks/` | Uploaded audio not attached to a release |
| `artists/<slug>/` | Artist photos and banners |
| `samples/` | Sample packs and their covers |
| `collab/<id>/` | Files attached to a collaboration project |
| `playlists/covers/` | Playlist cover images |
| `assets/` | Site branding and miscellaneous uploaded images |

### `releases/` vs `tracks/`

These two are the pair that trips people up, because both hold the same kind of
file — the audio itself. The difference is not what is in them, it is whether
the audio belongs to something:

- **`releases/<slug>/`** holds the files of one release, kept together under
  that release's slug.
- **`tracks/`** is where an upload lands when it was not attached to a release
  at all.

So read `tracks/` as *the unfiled pile*, not "all the tracks" — a track that
belongs to a release is not in there, it is under `releases/`. Which of the two
a file lands in is decided once, when it arrives: promoting an album to a
formal release changes its status in the database and does not move anything on
disk.

If you are placing files by hand and want them treated as a release, put them
in `releases/<slug>/` yourself rather than in `tracks/`.

## 7. Editing the library on disk

The files stay ordinary files: rename, re-tag or re-organise them with whatever
tools you like. TuneCamp does not lock them.

Two rules keep the database in step:

- **After editing on disk, run a rescan** (`/admin` → Maintenance →
  `Rescan Library`). Moves and re-tags are picked up there; until then the
  database still describes the old state.
- **Do not hand-edit `releases/<slug>/` while that release is published.** The
  release's `release.yaml` and the database rows are written by the app; a
  rescan reconciles added and removed audio, but metadata you change on disk
  loses to what the release editor holds.

For quick edits without an SSH session, **`/browser`** is a built-in admin file
browser over the music folder: navigate, rename, move, delete, and preview
audio in place.

## See also

- [Getting Started](./getting-started.md) — install and first login
- [Roles & Permissions](./ROLES.md) — who is allowed to upload and publish
- [Backup & Migration](./backup-migration.md) — moving the library and database
- [Telegram](./telegram.md) · [Google Drive](./google-drive.md) ·
  [Sidecamp](./sidecamp.md) — other ingestion paths
