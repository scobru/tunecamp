import { Router } from "express";
import { getPlaylistService } from "../../modules/catalog/playlist.service.js";

export function createImportRoutes() {
  const router = Router();
  const playlistService = getPlaylistService();

  router.post("/playlist", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      const data = await playlistService.fetchExternalPlaylist(url);
      res.json(data);
    } catch (error: any) {
      console.error(`[ImportRoute] Playlist import failed:`, error);
      res.status(400).json({ error: error.message || "Failed to import playlist" });
    }
  });

  return router;
}
