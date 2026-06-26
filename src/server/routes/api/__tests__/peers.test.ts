import { jest, describe, test, expect, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";
import { createPeersRoutes } from "../peers.js";

const mockAuthMiddleware = {
    requireUser: (req: any, res: any, next: any) => {
        req.userId = 42;
        req.username = "testuser";
        req.role = req.headers["test-role"] || "user";
        next();
    }
};

const mockPeerService = {
    getSessions: jest.fn(),
    searchTracks: jest.fn(),
    getTracksBySession: jest.fn(),
    requestStream: jest.fn(),
    requestDownload: jest.fn(),
    requestImport: jest.fn(),
    unregisterSession: jest.fn()
};

const mockScannerService = {
    processAudioFile: jest.fn()
};

const mockAuthService = {
    revokeTokens: jest.fn()
};

const mockRun = jest.fn();
const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });
const mockDatabase = {
    db: {
        prepare: mockPrepare
    }
};

const mockIdentity = {
    getSetting: jest.fn()
};

describe("Peers API Routes Tests", () => {
    let app: express.Express;

    beforeEach(() => {
        jest.clearAllMocks();
        app = express();
        app.use(express.json());
        
        app.use("/api/peers", createPeersRoutes({
            authService: mockAuthService,
            peerService: mockPeerService,
            database: mockDatabase,
            identity: mockIdentity,
            scannerService: mockScannerService,
            musicDir: "/music",
            authMiddleware: mockAuthMiddleware
        } as any));
    });

    test("GET /api/peers/status should return status when enabled", async () => {
        mockIdentity.getSetting.mockImplementation((k: string) => {
            if (k === "peerEnabled") return "true";
            if (k === "peerAllowDownloads") return "true";
            return null;
        });

        const response = await request(app).get("/api/peers/status");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ enabled: true, allowDownloads: true });
        expect(mockIdentity.getSetting).toHaveBeenCalledWith("peerEnabled");
    });

    test("GET /api/peers should return active sessions", async () => {
        const mockSessions = [
            { id: "sess-1", username: "peer1", trackCount: 5 }
        ];
        mockPeerService.getSessions.mockReturnValue(mockSessions);

        const response = await request(app).get("/api/peers");

        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockSessions);
        expect(mockPeerService.getSessions).toHaveBeenCalled();
    });

    test("GET /api/peers/search should return query matches", async () => {
        const mockResults = [
            { id: "track-1", title: "Test Song", artist: "Artist" }
        ];
        mockPeerService.searchTracks.mockReturnValue(mockResults);

        const response = await request(app).get("/api/peers/search?q=test");

        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockResults);
        expect(mockPeerService.searchTracks).toHaveBeenCalledWith("test");
    });

    test("GET /api/peers/search should reject empty queries", async () => {
        const response = await request(app).get("/api/peers/search?q=");
        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Query parameter 'q' is required");
    });

    test("GET /api/peers/:sessionId/tracks should return peer tracks", async () => {
        const mockTracks = [
            { id: "track-1", title: "Test Song" }
        ];
        mockPeerService.getTracksBySession.mockReturnValue(mockTracks);

        const response = await request(app).get("/api/peers/sess-123/tracks");

        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockTracks);
        expect(mockPeerService.getTracksBySession).toHaveBeenCalledWith("sess-123");
    });

    test("PUT /api/peers/users/:id/can-peer should toggle user flag (admin only)", async () => {
        const response = await request(app)
            .put("/api/peers/users/5/can-peer")
            .set("test-role", "root_admin")
            .send({ canPeer: true });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, canPeer: true });
        expect(mockPrepare).toHaveBeenCalledWith("UPDATE admin SET can_peer = ? WHERE id = ?");
        expect(mockRun).toHaveBeenCalledWith(1, 5);
        expect(mockAuthService.revokeTokens).toHaveBeenCalledWith(5);
    });

    test("PUT /api/peers/users/:id/can-peer should block normal users", async () => {
        const response = await request(app)
            .put("/api/peers/users/5/can-peer")
            .set("test-role", "user")
            .send({ canPeer: true });

        expect(response.status).toBe(403);
        expect(mockPrepare).not.toHaveBeenCalled();
    });

    test("GET federated-stream streams when peer federation is enabled", async () => {
        mockIdentity.getSetting.mockImplementation((k: string) => {
            if (k === "peerEnabled") return "true";
            if (k === "peerFederation") return "true";
            return null;
        });
        (mockPeerService.requestStream as any).mockImplementation((_s: string, _t: string, res: any) => {
            res.json({ streaming: true });
        });

        const response = await request(app).get("/api/peers/sess-1/tracks/trk-1/federated-stream");

        expect(response.status).toBe(200);
        expect(mockPeerService.requestStream).toHaveBeenCalledWith("sess-1", "trk-1", expect.anything());
    });

    test("GET federated-stream is blocked when peer federation is disabled", async () => {
        mockIdentity.getSetting.mockImplementation((k: string) => {
            if (k === "peerEnabled") return "true";
            if (k === "peerFederation") return "false";
            return null;
        });

        const response = await request(app).get("/api/peers/sess-1/tracks/trk-1/federated-stream");

        expect(response.status).toBe(403);
        expect(mockPeerService.requestStream).not.toHaveBeenCalled();
    });

    test("GET federated-download streams the file when federation + downloads are on", async () => {
        mockIdentity.getSetting.mockImplementation((k: string) => {
            if (k === "peerEnabled") return "true";
            if (k === "peerFederation") return "true";
            if (k === "peerAllowDownloads") return "true";
            return null;
        });
        (mockPeerService.requestDownload as any).mockImplementation((_s: string, _t: string, res: any) => {
            res.json({ downloading: true });
        });

        const response = await request(app).get("/api/peers/sess-1/tracks/trk-1/federated-download");

        expect(response.status).toBe(200);
        expect(mockPeerService.requestDownload).toHaveBeenCalledWith("sess-1", "trk-1", expect.anything());
    });

    test("GET federated-download is blocked when downloads are disabled", async () => {
        mockIdentity.getSetting.mockImplementation((k: string) => {
            if (k === "peerEnabled") return "true";
            if (k === "peerFederation") return "true";
            if (k === "peerAllowDownloads") return "false";
            return null;
        });

        const response = await request(app).get("/api/peers/sess-1/tracks/trk-1/federated-download");

        expect(response.status).toBe(403);
        expect(mockPeerService.requestDownload).not.toHaveBeenCalled();
    });

    test("POST /api/peers/federated-import blocks non-admins", async () => {
        const response = await request(app)
            .post("/api/peers/federated-import")
            .set("test-role", "user")
            .send({ downloadUrl: "https://peer.example.com/file.mp3" });

        expect(response.status).toBe(403);
    });

    test("POST /api/peers/federated-import requires a downloadUrl", async () => {
        const response = await request(app)
            .post("/api/peers/federated-import")
            .set("test-role", "admin")
            .send({});

        expect(response.status).toBe(400);
    });

    test("POST /api/peers/:sessionId/tracks/:trackId/import imports into the library (manager/root only)", async () => {
        mockPeerService.requestImport.mockResolvedValue({
            filePath: "/music/peer-imports/Artist - Song-abcd1234.mp3",
            track: { id: "track-1", title: "Song" }
        } as any);
        mockScannerService.processAudioFile.mockResolvedValue({ trackId: 99 } as any);

        const response = await request(app)
            .post("/api/peers/sess-123/tracks/track-1/import")
            .set("test-role", "admin")
            .send({});

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mockPeerService.requestImport).toHaveBeenCalledWith("sess-123", "track-1", expect.stringMatching(/peer-imports$/));
        expect(mockScannerService.processAudioFile).toHaveBeenCalledWith(
            expect.stringMatching(/Artist - Song-abcd1234\.mp3$/),
            expect.stringMatching(/music$/),
            undefined,
            42
        );
    });

    test("POST /api/peers/:sessionId/tracks/:trackId/import blocks non-admins", async () => {
        const response = await request(app)
            .post("/api/peers/sess-123/tracks/track-1/import")
            .set("test-role", "user")
            .send({});

        expect(response.status).toBe(403);
        expect(mockPeerService.requestImport).not.toHaveBeenCalled();
    });

    test("DELETE /api/peers/:sessionId should disconnect peer (admin only)", async () => {
        const response = await request(app)
            .delete("/api/peers/sess-123")
            .set("test-role", "root_admin");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true });
        expect(mockPeerService.unregisterSession).toHaveBeenCalledWith("sess-123");
    });
});
