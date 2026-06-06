import request from "supertest";
import express from "express";
import { jest } from '@jest/globals';
import path from "path";

// Mock fs-extra before importing the router
jest.unstable_mockModule("fs-extra", () => ({
    default: {
        pathExists: jest.fn(),
        stat: jest.fn(),
        readdir: jest.fn(),
        remove: jest.fn(),
        move: jest.fn(),
        createReadStream: jest.fn(),
    }
}));

const fs = (await import("fs-extra")).default;
const { createBrowserRoutes } = await import("../browser.js");

describe("Browser Routes Security", () => {
    let app: any;
    const musicDir = "/music"; // Simulate music directory

    beforeEach(() => {
        app = express();
        app.use(express.json());
        
        const mockDatabase = {
            updateTrackPathsPrefix: jest.fn()
        } as any;
        
        app.use("/", createBrowserRoutes({
            musicDir,
            database: mockDatabase
        } as any));
        jest.clearAllMocks();

        // Default mocks
        (fs.pathExists as any).mockResolvedValue(true);
        (fs.stat as any).mockResolvedValue({
            isDirectory: () => true,
            isFile: () => false,
            mtime: new Date(),
            size: 100
        });
        (fs.readdir as any).mockResolvedValue([]);
    });

    test("should allow valid relative path", async () => {
        const res = await request(app).get("/?path=subdir");
        expect(res.status).toBe(200);
        expect(fs.pathExists).toHaveBeenCalledWith(path.resolve(musicDir, "subdir"));
    });

    test("should reject path traversal using ..", async () => {
        const res = await request(app).get("/?path=../etc/passwd");
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Invalid path/);
    });

    test("should reject path traversal attempting to go outside root", async () => {
        const res = await request(app).get("/?path=subdir/../../etc/passwd");
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Invalid path/);
    });

    test("should allow filenames containing .. if they resolve inside musicDir", async () => {
        const res = await request(app).get("/?path=My..Folder");
        // Should succeed (200) with robust check
        expect(res.status).toBe(200);
        expect(fs.pathExists).toHaveBeenCalledWith(path.resolve(musicDir, "My..Folder"));
    });

    test("should allow renaming a file", async () => {
        (fs.pathExists as any).mockImplementation((p: string) => {
            if (p.endsWith("old.mp3")) return Promise.resolve(true); // Source exists
            if (p.endsWith("new.mp3")) return Promise.resolve(false); // Dest doesn't exist
            return Promise.resolve(false);
        });

        const res = await request(app)
            .put("/")
            .send({ oldPath: "old.mp3", newPath: "new.mp3" });

        expect(res.status).toBe(200);
        expect(fs.move).toHaveBeenCalledWith(
            path.resolve(musicDir, "old.mp3"),
            path.resolve(musicDir, "new.mp3")
        );
    });

    test("should prevent renaming to existing file", async () => {
        (fs.pathExists as any).mockResolvedValue(true); // Both exist

        const res = await request(app)
            .put("/")
            .send({ oldPath: "old.mp3", newPath: "exists.mp3" });

        expect(res.status).toBe(409);
        expect(fs.move).not.toHaveBeenCalled();
    });
});
