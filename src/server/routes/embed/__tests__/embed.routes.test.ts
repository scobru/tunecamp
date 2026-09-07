import express from "express";
import request from "supertest";
import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import { createEmbedRoutes } from "../embed.routes.js";

describe("Embed Routes", () => {
  let app: express.Express;

  const mockDatabase: any = {
    getTrack: jest.fn(),
    getRelease: jest.fn(),
    getReleaseBySlug: jest.fn(),
    getReleaseTracks: jest.fn(),
    getAlbum: jest.fn(),
    getAlbumBySlug: jest.fn(),
    getAlbumByTitle: jest.fn(),
    getTracksByAlbum: jest.fn(),
    isTrackInPublicPlaylist: jest.fn(),
  };

  const mockContainer: any = {
    database: mockDatabase,
    config: {
      siteName: "Sudo Records",
    },
  };

  // `albums.visibility` defaults to 'private' and `albums.status` to 'draft', so a
  // fixture that omits them is a draft in the private library, not a published one.
  const publishedRelease = {
    id: 24572,
    title: "Ragazzi in collera",
    slug: "ragazzi-in-collera",
    artist_name: "Homologo",
    is_release: true,
    visibility: "public",
    status: "released",
  };

  beforeEach(() => {
    // resetAllMocks, not clearAllMocks: the latter keeps every `mockReturnValue`,
    // so a lookup stubbed in one case still answered in the next and a fixture
    // meant to be absent came back published.
    jest.resetAllMocks();
    mockDatabase.isTrackInPublicPlaylist.mockReturnValue(false);
    app = express();
    app.use("/embed", createEmbedRoutes(mockContainer));
  });

  test("renders release embed by slug with correct headers and player markup", async () => {
    mockDatabase.getReleaseBySlug.mockReturnValue(publishedRelease);
    mockDatabase.getReleaseTracks.mockReturnValue([
      {
        id: 8283,
        title: "Ragazzi in collera",
        artist_name: "Homologo",
        duration: 186,
        album_id: 24572,
      },
    ]);
    mockDatabase.getRelease.mockReturnValue(publishedRelease);

    const res = await request(app).get("/embed/release/ragazzi-in-collera");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors *;");
    expect(res.headers["x-frame-options"]).toBeUndefined();
    expect(res.text).toContain("Ragazzi in collera");
    expect(res.text).toContain("Homologo");
    expect(res.text).toContain("/api/tracks/8283/stream");
    expect(res.text).toContain("/api/releases/24572/cover");
    expect(res.text).toContain("TUNECAMP · Sudo Records");
  });

  test("renders track embed by numeric ID", async () => {
    mockDatabase.getTrack.mockReturnValue({
      id: 8283,
      title: "Waterflow",
      artist_name: "Homologo",
      album_id: 24572,
      duration: 203,
    });
    mockDatabase.getAlbum.mockReturnValue({ id: 24572, visibility: "public" });

    const res = await request(app).get("/embed/track/8283");

    expect(res.status).toBe(200);
    expect(res.text).toContain("Waterflow");
    expect(res.text).toContain("Homologo");
    expect(res.text).toContain("/api/tracks/8283/stream");
    expect(res.text).toContain("/api/albums/24572/cover");
  });

  test("renders /embed/share/release/:slug alias properly", async () => {
    const release = { ...publishedRelease, title: "120 PUNK", slug: "120-punk" };
    mockDatabase.getReleaseBySlug.mockReturnValue(release);
    mockDatabase.getRelease.mockReturnValue(release);
    mockDatabase.getReleaseTracks.mockReturnValue([
      { id: 9001, title: "120 PUNK", artist_name: "Homologo", duration: 240, album_id: 24572 },
    ]);

    const res = await request(app).get("/embed/share/release/120-punk");

    expect(res.status).toBe(200);
    expect(res.text).toContain("120 PUNK");
    expect(res.text).toContain("/api/tracks/9001/stream");
  });

  test("returns 404 if item does not exist", async () => {
    mockDatabase.getReleaseBySlug.mockReturnValue(null);
    mockDatabase.getAlbumBySlug.mockReturnValue(null);
    mockDatabase.getAlbumByTitle.mockReturnValue(null);

    const res = await request(app).get("/embed/release/non-existent");
    expect(res.status).toBe(404);
    expect(res.text).toContain("Release o Album non trovato");
  });

  test("falls back to a by-title lookup only for non-numeric specifiers", async () => {
    mockDatabase.getReleaseBySlug.mockReturnValue(null);
    mockDatabase.getAlbumBySlug.mockReturnValue(null);
    mockDatabase.getAlbumByTitle.mockReturnValue({
      id: 77,
      title: "Ragazzi in collera",
      visibility: "public",
      status: "released",
    });
    mockDatabase.getTracksByAlbum.mockReturnValue([]);

    const res = await request(app).get("/embed/album/Ragazzi in collera");

    expect(res.status).toBe(200);
    expect(mockDatabase.getAlbumByTitle).toHaveBeenCalledWith("Ragazzi in collera");
    expect(res.text).toContain("Ragazzi in collera");
  });

  // --- Visibility ---
  //
  // An embed carries no credential, so the viewer is always a guest. Nothing a
  // guest could not already reach through the API may appear here.

  describe("visibility", () => {
    test("does not publish a draft release", async () => {
      mockDatabase.getReleaseBySlug.mockReturnValue({
        ...publishedRelease,
        status: "draft",
      });

      const res = await request(app).get("/embed/release/ragazzi-in-collera");

      expect(res.status).toBe(404);
      expect(res.text).not.toContain("Ragazzi in collera");
    });

    test("does not publish a private album", async () => {
      mockDatabase.getAlbum.mockReturnValue({
        id: 42,
        title: "Demos 2019",
        artist_name: "Homologo",
        visibility: "private",
        status: "released",
      });

      const res = await request(app).get("/embed/album/42");

      expect(res.status).toBe(404);
      expect(res.text).not.toContain("Demos 2019");
    });

    test("does not publish a track from a private album", async () => {
      mockDatabase.getTrack.mockReturnValue({
        id: 8283,
        title: "Unreleased Demo",
        artist_name: "Homologo",
        album_id: 42,
        duration: 203,
      });
      mockDatabase.getAlbum.mockReturnValue({ id: 42, visibility: "private" });

      const res = await request(app).get("/embed/track/8283");

      expect(res.status).toBe(404);
      expect(res.text).not.toContain("Unreleased Demo");
    });

    test("publishes a private album's track once a public playlist carries it", async () => {
      mockDatabase.getTrack.mockReturnValue({
        id: 8283,
        title: "Playlisted Demo",
        artist_name: "Homologo",
        album_id: 42,
        duration: 203,
      });
      mockDatabase.getAlbum.mockReturnValue({ id: 42, visibility: "private" });
      mockDatabase.isTrackInPublicPlaylist.mockReturnValue(true);

      const res = await request(app).get("/embed/track/8283");

      expect(res.status).toBe(200);
      expect(res.text).toContain("Playlisted Demo");
    });

    test("does not publish an orphan library file", async () => {
      mockDatabase.getTrack.mockReturnValue({
        id: 51,
        title: "Rip From My NAS",
        artist_name: "Homologo",
        album_id: null,
        file_path: "/music/rip.mp3",
        duration: 100,
      });

      const res = await request(app).get("/embed/track/51");

      expect(res.status).toBe(404);
      expect(res.text).not.toContain("Rip From My NAS");
    });

    test("drops a private album's track from a published release tracklist", async () => {
      mockDatabase.getReleaseBySlug.mockReturnValue(publishedRelease);
      mockDatabase.getRelease.mockImplementation((id: number) =>
        id === 24572 ? publishedRelease : undefined,
      );
      mockDatabase.getAlbum.mockImplementation((id: number) =>
        id === 999 ? { id: 999, visibility: "private" } : undefined,
      );
      mockDatabase.getReleaseTracks.mockReturnValue([
        { id: 8283, title: "Public Track", album_id: 24572, duration: 186 },
        { id: 9999, title: "Leaked Track", album_id: 999, duration: 120 },
      ]);

      const res = await request(app).get("/embed/release/ragazzi-in-collera");

      expect(res.status).toBe(200);
      expect(res.text).toContain("Public Track");
      expect(res.text).not.toContain("Leaked Track");
      expect(res.text).not.toContain("/api/tracks/9999/stream");
    });
  });
});
