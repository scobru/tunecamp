import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";
import path from "path";
import { createMiscRoutes } from "../misc.js";

describe("Misc API Routes", () => {
    let app: express.Express;
    let mockContainer: any;

    beforeEach(() => {
        mockContainer = {
            config: {
                musicDir: "/tmp/music",
                publicUrl: "https://tunecamp.example.com",
                port: 1970,
                siteName: "Test TuneCamp",
                siteDescription: "Test Description"
            },
            waveformService: {
                getWaveformSVG: jest.fn().mockResolvedValue("<svg>waveform</svg>")
            },
            metadataService: {
                getRegistry: jest.fn().mockReturnValue({ getRegistryInfo: () => ({ providers: ["discogs"] }) })
            },
            scannerService: {
                getRegistry: jest.fn().mockReturnValue({ getRegistryInfo: () => ({ providers: ["local"] }) })
            },
            streamingService: {
                getRegistry: jest.fn().mockReturnValue({ getRegistryInfo: () => ({ providers: ["bandcamp"] }) })
            },
            playlistService: {
                getRegistry: jest.fn().mockReturnValue({ getRegistryInfo: () => ({ providers: ["deezer"] }) })
            },
            authMiddleware: {
                requireAdmin: (req: any, res: any, next: any) => next()
            },
            library: {
                getTrack: jest.fn(),
                getTracks: jest.fn().mockReturnValue([]),
                getTracksByArtist: jest.fn().mockReturnValue([]),
                getStats: jest.fn().mockResolvedValue({ tracks: 12, artists: 3, albums: 4 }),
                getArtist: jest.fn(),
                getArtistBySlug: jest.fn(),
                getAlbum: jest.fn(),
                getAlbumBySlug: jest.fn(),
                iterateTracks: jest.fn().mockReturnValue([])
            },
            integration: {
                getPublicAssets: jest.fn().mockReturnValue([{ id: 1, slug: "test-asset", visibility: "public" }]),
                getAssetBySlug: jest.fn().mockReturnValue({ id: 1, slug: "test-asset", visibility: "public" }),
                getAsset: jest.fn()
            },
            identity: {
                getSetting: jest.fn().mockReturnValue(null)
            },
            social: {
                getPostBySlug: jest.fn(),
                getApNoteByContent: jest.fn()
            },
            database: {},
            radioService: {
                getStatus: jest.fn().mockReturnValue({ active: false })
            }
        };

        app = express();
        app.use(express.json());
        app.use(createMiscRoutes(mockContainer));
    });

    describe("GET /api/version", () => {
        it("returns package version", async () => {
            const res = await request(app).get("/api/version");
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("version");
        });
    });

    describe("GET /api/changelog", () => {
        it("returns filtered changelog", async () => {
            const res = await request(app).get("/api/changelog");
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("changelog");
        });
    });

    describe("GET /api/waveform/:id", () => {
        it("returns fallback SVG when track not found", async () => {
            mockContainer.library.getTrack.mockReturnValue(null);
            const res = await request(app).get("/api/waveform/999");
            expect(res.status).toBe(200);
            expect(res.header["content-type"]).toContain("image/svg+xml");
            const text = res.text || (res.body ? res.body.toString("utf8") : "");
            expect(text).toContain("<svg");
        });

        it("calls waveformService when track exists", async () => {
            mockContainer.library.getTrack.mockReturnValue({ id: 1, file_path: "artist/track.mp3" });
            const res = await request(app).get("/api/waveform/1");
            expect(res.status).toBe(200);
            expect(mockContainer.waveformService.getWaveformSVG).toHaveBeenCalledWith(1, path.join("/tmp/music", "artist/track.mp3"));
            const text = res.text || (res.body ? res.body.toString("utf8") : "");
            expect(text).toBe("<svg>waveform</svg>");
        });
    });

    describe("GET /api/assets", () => {
        it("returns public assets", async () => {
            const res = await request(app).get("/api/assets");
            expect(res.status).toBe(200);
            expect(res.body).toEqual([{ id: 1, slug: "test-asset", visibility: "public" }]);
        });

        it("returns asset by slug if public", async () => {
            const res = await request(app).get("/api/assets/test-asset");
            expect(res.status).toBe(200);
            expect(res.body.slug).toBe("test-asset");
        });

        it("returns 404 if asset not found or not public", async () => {
            mockContainer.integration.getAssetBySlug.mockReturnValue({ id: 2, slug: "private-asset", visibility: "private" });
            const res = await request(app).get("/api/assets/private-asset");
            expect(res.status).toBe(404);
        });
    });

    describe("GET /api/plugins", () => {
        it("returns plugin registry infos", async () => {
            const res = await request(app).get("/api/plugins");
            expect(res.status).toBe(200);
            expect(res.body.metadata).toEqual({ providers: ["discogs"] });
            expect(res.body.scanner).toEqual({ providers: ["local"] });
            expect(res.body.streaming).toEqual({ providers: ["bandcamp"] });
            expect(res.body.playlist).toEqual({ providers: ["deezer"] });
        });
    });

    describe("GET /api/v1/federation/libraries", () => {
        it("returns federation library format", async () => {
            const res = await request(app).get("/api/v1/federation/libraries");
            expect(res.status).toBe(200);
            expect(res.body.count).toBe(1);
            expect(res.body.results[0].uploads_count).toBe(12);
        });
    });

    describe("GET /api/v1/instance/nodeinfo/2.0", () => {
        it("returns valid nodeinfo 2.0 payload", async () => {
            const res = await request(app).get("/api/v1/instance/nodeinfo/2.0");
            expect(res.status).toBe(200);
            expect(res.body.version).toBe("2.0");
            expect(res.body.software.name).toBe("tunecamp");
            expect(res.body.protocols).toContain("activitypub");
        });
    });

    describe("Redirect routes", () => {
        it("redirects @:slug to artist page if artist exists", async () => {
            mockContainer.library.getArtistBySlug.mockReturnValue({ id: 1, slug: "scobru" });
            const res = await request(app).get("/@scobru");
            expect(res.status).toBe(302);
            expect(res.header.location).toBe("/artists/scobru");
        });

        it("redirects artist/:slug to hash router", async () => {
            mockContainer.library.getArtistBySlug.mockReturnValue({ id: 1, slug: "scobru" });
            const res = await request(app).get("/artist/scobru");
            expect(res.status).toBe(302);
            expect(res.header.location).toBe("/#/artist/scobru");
        });

        it("redirects note/release/:slug to album", async () => {
            mockContainer.library.getAlbumBySlug.mockReturnValue({ id: 1, slug: "my-album" });
            const res = await request(app).get("/note/release/my-album");
            expect(res.status).toBe(302);
            expect(res.header.location).toBe("/#/album/my-album");
        });

        it("returns 404 for missing release note", async () => {
            mockContainer.library.getAlbumBySlug.mockReturnValue(null);
            const res = await request(app).get("/note/release/missing");
            expect(res.status).toBe(404);
        });
    });

    describe("GET /api/posts/:slug", () => {
        it("returns post details with enriched artist info", async () => {
            mockContainer.social.getPostBySlug.mockReturnValue({
                id: 10,
                artist_id: 2,
                slug: "hello-world",
                content: "First post",
                created_at: "2026-08-01T00:00:00Z"
            });
            mockContainer.library.getArtist.mockReturnValue({
                id: 2,
                name: "Scobru",
                slug: "scobru",
                photo_path: "photo.jpg"
            });
            mockContainer.social.getApNoteByContent.mockReturnValue(null);

            const res = await request(app).get("/api/posts/hello-world");
            expect(res.status).toBe(200);
            expect(res.body.artistName).toBe("Scobru");
            expect(res.body.artistSlug).toBe("scobru");
        });

        it("returns 404 if post is marked as deleted from ActivityPub", async () => {
            mockContainer.social.getPostBySlug.mockReturnValue({
                id: 10,
                artist_id: 2,
                slug: "hello-world"
            });
            mockContainer.social.getApNoteByContent.mockReturnValue({ deleted_at: "2026-08-02T00:00:00Z" });

            const res = await request(app).get("/api/posts/hello-world");
            expect(res.status).toBe(404);
        });
    });

    describe("RSS feeds", () => {
        it("serves global /feed.xml with XML content type", async () => {
            mockContainer.library.getTracks.mockReturnValue([
                { id: 1, title: "Track 1", artist_name: "Artist 1", created_at: "2026-08-01T00:00:00Z" }
            ]);
            const res = await request(app).get("/feed.xml");
            expect(res.status).toBe(200);
            expect(res.header["content-type"]).toContain("text/xml");
            expect(res.text).toContain("<rss version="2.0"");
            expect(res.text).toContain("Track 1");
        });

        it("serves artist RSS feed /artists/:slug/feed.xml", async () => {
            mockContainer.library.getArtistBySlug.mockReturnValue({
                id: 3,
                name: "DJ Scobru",
                slug: "dj-scobru"
            });
            mockContainer.library.getTracksByArtist.mockReturnValue([
                { id: 2, title: "Artist Exclusive", artist_name: "DJ Scobru" }
            ]);
            const res = await request(app).get("/artists/dj-scobru/feed.xml");
            expect(res.status).toBe(200);
            expect(res.header["content-type"]).toContain("text/xml");
            expect(res.text).toContain("DJ Scobru - TuneCamp Feed");
            expect(res.text).toContain("Artist Exclusive");
        });

        it("returns 404 for non-existent artist RSS feed", async () => {
            mockContainer.library.getArtistBySlug.mockReturnValue(null);
            const res = await request(app).get("/artists/unknown/feed.xml");
            expect(res.status).toBe(404);
        });
    });
});
