import { Router } from "express";
import { extractBandcampMetadata } from "../../utils/bandcamp.js";

export function createImportRoutes() {
  const router = Router();

  router.post("/bandcamp", async (req, res) => {
    try {
      const { url } = req.body;
      
      // Basic URL validation
      try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname;
        if (!(hostname === "bandcamp.com" || hostname.endsWith(".bandcamp.com") || 
            hostname === "bcbits.com" || hostname.endsWith(".bcbits.com"))) {
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
      res.status(500).json({ error: error.message || "Failed to import" });
    }
  });

  return router;
}

