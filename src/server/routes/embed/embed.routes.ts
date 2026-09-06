import express, { Router, Request, Response } from "express";
import { wrapAsync } from "../../middleware/error-handling.js";
import { type ServiceContainer } from "../../core/container.js";

export function createEmbedRoutes(container: ServiceContainer): Router {
  const router = Router();
  const library = container.catalogService;
  const musicDir = container.musicDir;

  // Main embed routes
  router.get("/:type(track|album)/:id", wrapAsync(async (req: Request, res: Response) => {
    const { type, id } = req.params;
    const numericId = Number(id);

    // Get the actual track/album data
    let audioUrl = "";
    if (type === "track") {
      const track = container.database.getTrack(numericId);
      if (track) {
        // Use the actual audio path from the track data
        audioUrl = `/api/tracks/${id}/stream`;
      }
    } else if (type === "album") {
      const album = container.database.getAlbum(numericId);
      if (album) {
        // Use the actual audio path from the album data
        audioUrl = `/api/albums/${id}/stream`;
      }
    }

    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.send(`<html><head><title>Embed</title></head><body style="margin:0;background:#111;color:#fff;font-family:sans-serif">
      <h3>${type} embed</h3><p>ID: ${id}</p>
      <audio controls style="width:100%"><source src="${audioUrl}" type="audio/mpeg"></audio>
    </body></html>`);
  }));
  // Share embed route: preview for /share/track/:id and /share/album/:id  
  router.get("/share/:type(track|album)/:id", wrapAsync(async (req: Request, res: Response) => {
    const { type, id } = req.params;
    const numericId = Number(id);
    const isTrack = type === "track";

    // Load data for embed preview
    let item: any = null;
    if (isTrack) {
      item = container.database.getTrack(numericId);
    } else {
      item = container.database.getAlbum(numericId);
    }

    if (!item) {
      return res.status(404).send(`<html><head><title>Not Found</title></head><body style="margin:0;background:#111;color:#fff;font-family:sans-serif"><h1>Not Found</h1></body></html>`);
    }

    const title = item.title || "TuneCamp";
    const artistName = item.artistName || (item.artist_name || "Unknown Artist");
    const coverUrl = item.coverUrl || item.coverPath || item.cover_path || item.coverImage || "/default-cover.png";
    const audioUrl = isTrack ? `/api/tracks/${id}/stream` : `/api/albums/${id}/stream`;

    res.setHeader("X-Frame-Options", "ALLOWFROM https://tunecamp.dev");
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="Listen to ${title} by ${artistName}" />
  <meta property="og:image" content="${coverUrl}" />
  <title>${title} — TuneCamp Share</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#0f0f10; color:#fff; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
    .card { max-width:420px; width:100%; background:#18181b; border-radius:24px; overflow:hidden; box-shadow:0 32px 64px rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.05); }
    .cover { width:100%; aspect-ratio:1; object-fit:cover; display:block; }
    .content { padding:24px; }
    .tag { font-size:10px; font-weight:800; letter-spacing:0.15em; text-transform:uppercase; color:#888; margin-bottom:8px; }
    h2 { font-size:22px; font-weight:900; letter-spacing:-0.03em; margin-bottom:6px; line-height:1.1; }
    .artist { font-size:15px; color:rgba(255,255,255,0.6); margin-bottom:20px; }
    audio { width:100%; border-radius:12px; }
  </style>
</head>
<body>
  <div class="card">
    <img class="cover" src="${coverUrl}" alt="${title}" onerror="this.src='https://placehold.co/500x500?text=No+Cover'" />
    <div class="content">
      <div class="tag">${isTrack ? 'Track' : 'Album'}</div>
      <h2>${title}</h2>
      <p class="artist">${artistName}</p>
      <audio controls preload="none"><source src="${audioUrl}" type="audio/mpeg" /></audio>
    </div>
  </div>
</body>
</html>`);
  }));

  return router;
}