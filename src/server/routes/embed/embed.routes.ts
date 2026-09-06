import express, { Router, Request, Response } from "express";
import { wrapAsync } from "../../middleware/error-handling.js";
import { type ServiceContainer } from "../../core/container.js";

export function createEmbedRoutes(container: ServiceContainer): Router {
  const router = Router();
  const library = container.catalogService;
  const musicDir = container.musicDir;
  
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
  return router;
}