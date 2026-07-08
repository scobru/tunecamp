# Deploy on Railway (no VPS)

Railway is a managed platform that runs your TuneCamp instance without requiring a VPS, SSH access, or any server management. A single click deploys from the official template.

## One-click deploy

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/tunecamp?referralCode=BUSsSY&utm_medium=integration&utm_source=template&utm_campaign=generic)

This provisions:
- The TuneCamp Node.js server
- A persistent volume for the SQLite database and media files
- A public HTTPS URL on `.railway.app` (usable for federation)

## What you get

| Feature | Detail |
|---------|--------|
| HTTPS | Automatic — no Nginx or Certbot needed |
| Persistent storage | Volume attached at `/app/data` |
| Environment variables | Set via the Railway dashboard → Variables tab |
| Custom domain | Add your own in Railway → Settings → Domains |
| Logs | Railway dashboard → Deployments → View logs |

## Environment variables

Set these in **Railway → Variables** before or after first deploy:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TUNECAMP_PUBLIC_URL` | Yes (for federation) | — | Your full public URL, e.g. `https://yourname.up.railway.app` |
| `TUNECAMP_ADMIN_USER` | No | `admin` | Override default admin username |
| `TUNECAMP_ADMIN_PASS` | No | `admin` | Override default admin password — **change this** |
| `JWT_SECRET` | Recommended | auto-generated | Set a stable random string so sessions survive redeploys |

## First login

Default credentials (same as Docker path):

| Username | Password |
|----------|----------|
| `admin` | `admin` |

Change the password immediately in **Admin → Settings**.

## Persistent media

Railway volumes persist across redeploys. Your SQLite database and uploaded/scanned media live inside the volume. If you need to upload a large library, use one of the remote ingestion paths instead of local file scan:

- [Telegram bot](./telegram.md)
- [Google Drive](./google-drive.md)

## Limits

Railway's free Hobby tier has execution-hour limits. For a production instance with heavy streaming traffic, upgrade to a paid plan or consider a VPS with Docker instead (see [Getting Started](./getting-started.md)).

## Custom domain + federation

To federate with other TuneCamp instances, ActivityPub requires a stable HTTPS URL. Set `TUNECAMP_PUBLIC_URL` to your Railway app URL (or a custom domain) and register with a directory instance:

```bash
curl -X POST https://directory.example.com/api/community/register \
     -H "Content-Type: application/json" \
     -d '{"url": "https://yourname.up.railway.app"}'
```
