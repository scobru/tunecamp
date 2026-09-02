# Getting Started

This page takes you from nothing to a running TuneCamp instance with music in it. It should take about 10 minutes. For deeper topics, follow the links at the end.

> **New to TuneCamp?** It's a self-hosted music platform: your own streaming server with a web player, mobile-app support (Subsonic), Fediverse federation (ActivityPub), and optional Web3 monetization. You run it; you own the data.

## Deploy on Railway (no VPS)

Don't have a server? Deploy directly from the official Railway template — one click, HTTPS included:

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/tunecamp?referralCode=BUSsSY&utm_medium=integration&utm_source=template&utm_campaign=generic)

See the full [Railway deployment guide](./railway.md) for environment variables, persistent storage, and federation setup.

---

## 1. Prerequisites

The fastest path uses Docker. You need:

- **Docker 20+** and **Docker Compose v2.24+** (the compose file marks `.env`
  optional, which needs the long `env_file` syntax). Use `docker compose`, the
  v2 subcommand — the standalone `docker-compose` binary has been end-of-life
  since 2023.
- A folder of audio files (MP3, FLAC, WAV, …)

> Prefer running from source for development instead? See the [Development Guide](./development-guide.md).

## 2. Install & run

Choose one of the following setup options:

### Option A: VPS Auto-Installer (Recommended)
If you rented a fresh Linux VPS (Ubuntu/Debian), run this single command to automatically install Docker, Docker Compose, Nginx, Certbot (SSL), configure your reverse proxy, clone the repository, and spin up TuneCamp:

```bash
curl -fsSL https://tunecamp.org/install.sh | sudo bash
```

### Option B: Manual Docker Setup
If you want to manage prerequisites and configuration yourself:

```bash
# 1. Clone the repository
git clone https://github.com/scobru/tunecamp.git
cd tunecamp

# 2. Optional: drop your audio in now — the first scan will pick it up
mkdir -p music && cp -r ~/Albums/* music/

# 3. Build and start in the background
docker compose up -d --build
```

When the container is healthy, open `http://localhost:1970` (or your domain) in your browser.

**Your music lives elsewhere?** Set `TUNECAMP_MUSIC_PATH=/path/to/music` in
`.env` — that is the host folder Compose mounts into the container. Don't set
`TUNECAMP_MUSIC_DIR` under Docker; the compose file already pins it to the
mount point. [Adding Music](./adding-music.md) explains the difference.

**Need to change the deployment itself** — container name, extra networks,
proxy labels, more volumes? Don't edit `docker-compose.yml`. Copy
`docker-compose.override.yml.example` to `docker-compose.override.yml`:
Compose merges it automatically, and it is gitignored, so `git pull` never
conflicts with your setup.

## 3. First login & secure your instance

TuneCamp creates a default admin account on first run:

| Username | Password |
|----------|----------|
| `admin`  | `admin`  |

(Override these before first run with `TUNECAMP_ADMIN_USER` / `TUNECAMP_ADMIN_PASS`.)

**Change the admin password immediately** after logging in, from **Admin → Settings**. The server logs a security warning at startup while the admin account, open CORS, or an auto-generated JWT secret are left at defaults — see the [Configuration reference](https://github.com/scobru/tunecamp/blob/main/README.md#configuration) to harden these.

> A built-in setup wizard forces a password change for any account still using a default password, and the server enforces it: until the password is changed, that account gets `403` on every endpoint except the ones needed to change it, and Subsonic (`/rest`) is refused entirely. Anonymous listeners are unaffected. Details in [Roles & Permissions](./ROLES.md#first-login-setup-wizard).

## 4. Add your music

Copy your files into the music folder (`./music` by default, one folder per
album), then:

1. Go to **`/admin` → Maintenance tab** and press **`Rescan Library`**. Scanning
   is not automatic on startup; `/admin` → Settings → *Scheduled Library Scan*
   makes it run daily at an hour you pick.
2. TuneCamp reads tags, generates waveforms, and processes cover art.
3. Scanned folders become **private draft albums**, listed at **`/my-music`**.
   They're in your library and invisible to the public until you promote them:
   `Promote` at `/my-music` turns an album into a *formal release*, then
   **`/admin` → Releases tab** is where you fill in its metadata and
   **Publish** it.

To upload instead of scanning, **`/admin/release/new`** creates a release and
uploads its audio in one pass, filling the title, artist, year and track list
from the files' own tags.

**[Adding Music](./adding-music.md) is the full reference** — library layout on
disk, what each folder under `music/` is for, and how to edit the library
without confusing the database.

You can also ingest music via the [Telegram bot](./telegram.md), [Sidecamp desktop app](./sidecamp.md) (Soulseek, torrents, yt-dlp), or [Google Drive](./google-drive.md).

## 5. Listen

- **Web player** — already running at `http://localhost:1970`, with waveform display, queue, lyrics, and keyboard shortcuts.
- **Mobile / desktop apps** — TuneCamp speaks the full Subsonic API. Point any Subsonic client (DSub, Symfonium, Tempo, Substreamer) at your server URL with your TuneCamp credentials. See [Subsonic Protocol](./subsonic.md).

## 6. Where to go next

You now have a working instance. Pick the path that matches what you want to do:

| If you want to… | Read |
|-----------------|------|
| Put it on a real domain with SSL | [Nginx Configuration](./NGINX.md) |
| Share it from a home machine, with no domain | `docker compose --profile tunnel up -d` — see [README](https://github.com/scobru/tunecamp#public-url-without-a-domain) |
| Connect Stripe / crypto payments | [API & Services Setup](./api-setup-guide.md) → [Payments](./payments.md) |
| Join the federated network | [Federation](./FEDERATION.md) |
| Understand who can do what | [Roles & Permissions](./ROLES.md) |
| Keep your data safe | [Backup & Migration](./backup-migration.md) |
| Run it in production at scale | [Monitoring](./monitoring.md) · [Scaling](./scaling.md) |
| Contribute code | [Development Guide](./development-guide.md) · [Contributing](./CONTRIBUTING.md) |

See the full [documentation index](./index.md) for everything else.
