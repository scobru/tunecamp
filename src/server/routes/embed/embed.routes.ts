import express, { Router } from "express";
import { wrapAsync } from "../../middleware/error-handling.js";
import { VisibilityGuardian } from "../../common/visibility.js";
import { getContextFromProfile } from "../../common/visibility.js";
import { resolveService } from "../../core/container.js";

export function createEmbedRoutes(container: ServiceContainer): Router {
  const router = Router();
  const library = container.catalogService;
  const musicDir = container.musicDir;
  
  router.get("/:type(track|album)/:id", wrapAsync(async (req, res: any) => {
    const { type, id } = req.params;
    
    // Get context for permissions
    const context = getContextFromProfile(req.userId, req.userRole);
    const visibility = VisibilityGuardian.canPublishContent(context);
    
    // Get the actual track/album data
    let audioUrl = "";
    if (type === "track") {
      const track = library.getTrack(id);
      if (track) {
        // Use the actual audio path from the track data
        audioUrl = `/api/tracks/${id}/stream`;
      }
    } else if (type === "album") {
      const album = library.getAlbum(id);
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