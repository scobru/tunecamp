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

- **Docker 20+** and **Docker Compose**
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

# 2. Point TuneCamp at your music folder
#    Edit docker-compose.yml and replace /path/to/your/music
#    with the path to your audio files.

# 3. Build and start in the background
docker-compose up -d --build
```

When the container is healthy, open `http://localhost:1970` (or your domain) in your browser.

## 3. First login & secure your instance

TuneCamp creates a default admin account on first run:

| Username | Password |
|----------|----------|
| `admin`  | `admin`  |

(Override these before first run with `TUNECAMP_ADMIN_USER` / `TUNECAMP_ADMIN_PASS`.)

**Change the admin password immediately** after logging in, from **Admin → Settings**. The server logs a security warning at startup while the admin account, open CORS, or an auto-generated JWT secret are left at defaults — see the [Configuration reference](https://github.com/scobru/tunecamp/blob/main/README.md#configuration) to harden these.

> A built-in setup wizard forces a password change for any account still using a default password. Details in [Roles & Permissions](./ROLES.md#first-login-setup-wizard).

## 4. Add your music

1. Go to **Admin → Library** and trigger a **Scan**.
2. TuneCamp reads tags, generates waveforms, and processes cover art.
3. Scanned albums land in **Draft** mode — they're in your library but not publicly visible until you promote them to a **Formal Release** from the Admin dashboard.

You can also ingest music via the [Telegram bot](./telegram.md), [Sidecamp desktop app](./sidecamp.md) (Soulseek, torrents, yt-dlp), or [Google Drive](./google-drive.md).

## 5. Listen

- **Web player** — already running at `http://localhost:1970`, with waveform display, queue, lyrics, and keyboard shortcuts.
- **Mobile / desktop apps** — TuneCamp speaks the full Subsonic API. Point any Subsonic client (DSub, Symfonium, Tempo, Substreamer) at your server URL with your TuneCamp credentials. See [Subsonic Protocol](./subsonic.md).

## 6. Where to go next

You now have a working instance. Pick the path that matches what you want to do:

| If you want to… | Read |
|-----------------|------|
| Put it on a real domain with SSL | [Nginx Configuration](./NGINX.md) |
| Connect Stripe / crypto payments | [API & Services Setup](./api-setup-guide.md) → [Payments](./payments.md) |
| Join the federated network | [Federation](./FEDERATION.md) |
| Understand who can do what | [Roles & Permissions](./ROLES.md) |
| Keep your data safe | [Backup & Migration](./backup-migration.md) |
| Run it in production at scale | [Monitoring](./monitoring.md) · [Scaling](./scaling.md) |
| Contribute code | [Development Guide](./development-guide.md) · [Contributing](./CONTRIBUTING.md) |

See the full [documentation index](./index.md) for everything else.
