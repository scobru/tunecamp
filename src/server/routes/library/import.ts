import { Router } from "express";
import { getPlaylistService } from "../../modules/catalog/playlist.service.js";
import { extractBandcampMetadata } from "../../utils/bandcamp.js";

export function createImportRoutes() {
  const router = Router();
  const playlistService = getPlaylistService();

  /**
   * POST /api/import/bandcamp
   * Extracts metadata and track info from a Bandcamp URL.
   */
  router.post("/bandcamp", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      // Basic validation
      try {
        const u = new URL(url);
        if (!u.hostname.endsWith("bandcamp.com") && !u.hostname.endsWith("bcbits.com")) {
          throw new Error("Invalid domain");
        }
      } catch (e) {
        return res.status(400).json({ error: "Invalid Bandcamp URL" });
      }

      const metadata = await extractBandcampMetadata(url);

      if (!metadata) {
        return res.status(404).json({ error: "Could not extract metadata from Bandcamp page" });
      }

      res.json(metadata);
    } catch (error: any) {
      console.error(`[ImportRoute] Bandcamp import failed:`, error);
      res.status(500).json({ error: error.message || "Failed to import" });
    }
  });

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
