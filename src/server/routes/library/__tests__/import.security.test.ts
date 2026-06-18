import express from "express";
import request from "supertest";
import { jest } from "@jest/globals";

// Mock isSafeUrl to avoid real DNS queries which hang the tests
jest.unstable_mockModule("../../../../utils/networkUtils.js", () => ({
  isSafeUrl: jest.fn<any>().mockImplementation(async (urlStr: string) => {
    try {
      const url = new URL(urlStr);
      if (
        [
          "127.0.0.1",
          "localhost",
          "10.0.0.5",
          "192.168.1.100",
          "[::1]",
        ].includes(url.hostname)
      )
        return false;
      if (!["http:", "https:"].includes(url.protocol)) return false;
      return true;
    } catch {
      return false;
    }
  }),
}));

// Mock node-fetch so we don't actually hit the network
jest.unstable_mockModule("node-fetch", () => ({
  default: jest.fn<any>().mockResolvedValue({
    ok: true,
    text: jest.fn<any>().mockResolvedValue("<html><body>No data</body></html>"),
    headers: {
      get: jest.fn(),
    },
    body: {
      pipe: jest.fn(),
      on: jest.fn(),
    },
  }),
}));

let createImportRoutes: any;

beforeAll(async () => {
    ({ createImportRoutes } = await import("../import.js"));
});

describe("Import Routes Security", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api/import", createImportRoutes({} as any));
  });

  it("should reject malformed URLs", async () => {
    const response = await request(app)
      .post("/api/import/bandcamp")
      .send({ url: "not-a-url" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid Bandcamp URL");
  });

  it("should reject URLs with internal IPs", async () => {
    const response = await request(app)
      .post("/api/import/bandcamp")
      .send({ url: "http://127.0.0.1" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid Bandcamp URL");
  });

  it("should reject non-Bandcamp/bcbits URLs", async () => {
    const response = await request(app)
      .post("/api/import/bandcamp")
      .send({ url: "https://attacker.com" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid Bandcamp URL");
  });

  it("should reject subdomains spoofing Bandcamp via main domain", async () => {
    const response = await request(app)
      .post("/api/import/bandcamp")
      .send({ url: "https://bandcamp.com.attacker.com" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid Bandcamp URL");
  });

  it("should reject domains containing bandcamp in path", async () => {
    const response = await request(app)
      .post("/api/import/bandcamp")
      .send({ url: "https://attacker.com/bandcamp.com" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid Bandcamp URL");
  });

  it("should reject file scheme URLs", async () => {
    const response = await request(app)
      .post("/api/import/bandcamp")
      .send({ url: "file:///etc/passwd?bandcamp.com" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid Bandcamp URL");
  });

  it("should accept valid bandcamp.com URLs", async () => {
    const response = await request(app)
      .post("/api/import/bandcamp")
      .send({ url: "https://bandcamp.com/album/something" });

    expect(response.status).toBe(404); // 404 because our mock returns no tralbumData, but not 400
  });

  it("should accept valid subdomain.bandcamp.com URLs", async () => {
    const response = await request(app)
      .post("/api/import/bandcamp")
      .send({ url: "https://artist.bandcamp.com/album/something" });

    expect(response.status).toBe(404);
  });

  it("should accept valid bcbits.com URLs", async () => {
    const response = await request(app)
      .post("/api/import/bandcamp")
      .send({ url: "https://f4.bcbits.com/img/a123_10.jpg" });

    expect(response.status).toBe(404);
  });
});
