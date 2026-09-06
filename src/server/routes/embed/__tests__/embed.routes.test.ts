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
    getTracksByAlbum: jest.fn(),
  };

  const mockContainer: any = {
    database: mockDatabase,
    config: {
      siteName: "Sudo Records",
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use("/embed", createEmbedRoutes(mockContainer));
  });

  test("renders release embed by slug with correct headers and player markup", async () => {
    mockDatabase.getReleaseBySlug.mockReturnValue({
      id: 24572,
      title: "Ragazzi in collera",
      slug: "ragazzi-in-collera",
      artist_name: "Homologo",
      is_release: true,
    });
    mockDatabase.getReleaseTracks.mockReturnValue([
      {
        id: 8283,
        title: "Ragazzi in collera",
        artist_name: "Homologo",
        duration: 186,
      },
    ]);

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

    const res = await request(app).get("/embed/track/8283");

    expect(res.status).toBe(200);
    expect(res.text).toContain("Waterflow");
    expect(res.text).toContain("Homologo");
    expect(res.text).toContain("/api/tracks/8283/stream");
    expect(res.text).toContain("/api/albums/24572/cover");
  });

  test("renders /embed/share/release/:slug alias properly", async () => {
    mockDatabase.getReleaseBySlug.mockReturnValue({
      id: 24572,
      title: "120 PUNK",
      slug: "120-punk",
      artist_name: "Homologo",
      is_release: true,
    });
    mockDatabase.getReleaseTracks.mockReturnValue([
      { id: 9001, title: "120 PUNK", artist_name: "Homologo", duration: 240 },
    ]);

    const res = await request(app).get("/embed/share/release/120-punk");

    expect(res.status).toBe(200);
    expect(res.text).toContain("120 PUNK");
    expect(res.text).toContain("/api/tracks/9001/stream");
  });

  test("returns 404 if item does not exist", async () => {
    mockDatabase.getReleaseBySlug.mockReturnValue(null);
    mockDatabase.getAlbumBySlug.mockReturnValue(null);

    const res = await request(app).get("/embed/release/non-existent");
    expect(res.status).toBe(404);
    expect(res.text).toContain("Release o Album non trovato");
  });
});
