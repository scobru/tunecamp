import { jest, describe, test, expect, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";
import { createChatRoutes } from "../chat.js";

const mockChatService = {
    addMessage: jest.fn(),
    getHistory: jest.fn(),
    getMessage: jest.fn(),
    deleteMessage: jest.fn(),
    events: {
        on: jest.fn(),
        off: jest.fn()
    }
};

const mockApService = {
    broadcastBoardMessage: jest.fn<any>().mockResolvedValue(undefined)
};

const mockLibrary = {
    getArtists: jest.fn<any>().mockReturnValue([]),
    getTrackByExternalId: jest.fn()
};

const mockAuthMiddleware = {
    requireUser: (req: any, res: any, next: any) => {
        req.userId = 42;
        req.username = "testuser";
        req.role = "user";
        next();
    }
};

describe("Chat Routes - ActivityPub Federation Tests", () => {
    let app: express.Express;
    let customArtistId: number | undefined = undefined;

    beforeEach(() => {
        jest.clearAllMocks();
        customArtistId = undefined;
        app = express();
        app.use(express.json());

        // Middleware to inject artistId for testing
        app.use((req: any, res: any, next: any) => {
            if (customArtistId !== undefined) {
                req.artistId = customArtistId;
            }
            next();
        });

        app.use("/api/chat", createChatRoutes({
            chatService: mockChatService,
            apService: mockApService,
            library: mockLibrary,
            authMiddleware: mockAuthMiddleware
        } as any));
    });

    test("POST /api/chat/messages should not federate if req.artistId is not present", async () => {
        mockChatService.addMessage.mockReturnValue({
            id: 1,
            username: "testuser",
            message: "Hello world!",
            timestamp: Date.now()
        });

        const response = await request(app)
            .post("/api/chat/messages")
            .send({ message: "Hello world!" });

        expect(response.status).toBe(200);
        expect(mockChatService.addMessage).toHaveBeenCalledWith(
            "testuser",
            "user",
            "Hello world!",
            "webapp"
        );
        expect(mockApService.broadcastBoardMessage).not.toHaveBeenCalled();
    });

    test("POST /api/chat/messages should federate if req.artistId is present", async () => {
        customArtistId = 99;
        mockChatService.addMessage.mockReturnValue({
            id: 2,
            username: "testuser",
            message: "Hello Fediverse!",
            timestamp: Date.now()
        });

        const response = await request(app)
            .post("/api/chat/messages")
            .send({ message: "Hello Fediverse!" });

        expect(response.status).toBe(200);
        expect(mockChatService.addMessage).toHaveBeenCalledWith(
            "testuser",
            "user",
            "Hello Fediverse!",
            "webapp"
        );
        expect(mockApService.broadcastBoardMessage).toHaveBeenCalledWith(99, "Hello Fediverse!");
    });
});
