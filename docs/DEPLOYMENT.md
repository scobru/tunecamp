# Deployment Guide

TuneCamp can be deployed in two modes: **Static Site** (for public music catalogs) or **Server Mode** (for personal streaming).

## Static Site Deployment

After building your catalog with `tunecamp build`, deploy the `public/` folder to any static hosting.

### Netlify

```bash
# CLI
netlify deploy --dir=public --prod

# Or drag-and-drop at netlify.com
```

### Vercel

```bash
vercel --prod public
```

### GitHub Pages

1. Push the `public/` folder to a `gh-pages` branch
2. Enable GitHub Pages in repository settings
3. Set `basePath: "/repo-name"` in `catalog.yaml`

```yaml
# catalog.yaml
basePath: "/my-music"
```

### Cloudflare Pages

1. Connect your repository
2. Build command: `npx tunecamp build ./catalog -o ./public`
3. Output directory: `public`

---

## Server Mode Deployment

For running TuneCamp as a personal streaming server.

### Local / VPS

```bash
# Install globally
npm install -g tunecamp

# Start server
tunecamp server ./music --port 1970 --db ./tunecamp.db
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `1970` | Server port |
| `MUSIC_DIR` | `./music` | Music library path |
| `DB_PATH` | `./tunecamp.db` | SQLite database path |
| `JWT_SECRET` | (auto-generated) | JWT signing secret |

### Docker (Example)

```dockerfile
FROM node:20-slim
WORKDIR /app
RUN npm install -g tunecamp
COPY ./music /music
EXPOSE 1970
CMD ["tunecamp", "server", "/music", "--port", "1970"]
```

---

## basePath Configuration

Critical for subdirectory deployments:

| Deployment | basePath Example |
|------------|------------------|
| Root domain (`mymusic.com`) | `""` (empty) |
| GitHub Pages (`user.github.io/repo`) | `"/repo"` |
| Subdirectory (`site.com/music`) | `"/music"` |

```yaml
# catalog.yaml
basePath: "/my-music"  # Must start with / if not empty
```

Override at build time:
```bash
tunecamp build ./catalog -o ./public --basePath /my-music
```
