import request from "supertest";
import express from "express";
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import path from "path";
import fsExtra from "../../../../utils/fs.js";
import { createBrowserRoutes } from "../browser.js";

const pathExistsSpy = jest.spyOn(fsExtra, 'pathExists' as any).mockResolvedValue(true as any);
const statSpy = jest.spyOn(fsExtra, 'stat' as any).mockResolvedValue({ isDirectory: () => true, isFile: () => false, mtime: new Date(), size: 100 } as any);
const readdirSpy = jest.spyOn(fsExtra, 'readdir' as any).mockResolvedValue([] as any);
const removeSpy = jest.spyOn(fsExtra, 'remove' as any).mockResolvedValue(undefined as any);
const moveSpy = jest.spyOn(fsExtra, 'move' as any).mockResolvedValue(undefined as any);

describe("Browser Routes Security", () => {
    let app: any;
    const musicDir = "/music";

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

        pathExistsSpy.mockResolvedValue(true as any);
        statSpy.mockResolvedValue({ isDirectory: () => true, isFile: () => false, mtime: new Date(), size: 100 } as any);
        readdirSpy.mockResolvedValue([] as any);
        moveSpy.mockResolvedValue(undefined as any);
    });

    test("should allow valid relative path", async () => {
        const res = await request(app).get("/?path=subdir");
        expect(res.status).toBe(200);
        expect(pathExistsSpy).toHaveBeenCalledWith(path.resolve(musicDir, "subdir"));
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
        expect(res.status).toBe(200);
        expect(pathExistsSpy).toHaveBeenCalledWith(path.resolve(musicDir, "My..Folder"));
    });

    test("should allow renaming a file", async () => {
        pathExistsSpy.mockImplementation((p) => {
            if (String(p).endsWith("old.mp3")) return Promise.resolve(true);
            if (String(p).endsWith("new.mp3")) return Promise.resolve(false);
            return Promise.resolve(false);
        });

        const res = await request(app)
            .put("/")
            .send({ oldPath: "old.mp3", newPath: "new.mp3" });

        expect(res.status).toBe(200);
        expect(moveSpy).toHaveBeenCalledWith(
            path.resolve(musicDir, "old.mp3"),
            path.resolve(musicDir, "new.mp3")
        );
    });

    test("should prevent renaming to existing file", async () => {
        pathExistsSpy.mockResolvedValue(true as any);

        const res = await request(app)
            .put("/")
            .send({ oldPath: "old.mp3", newPath: "exists.mp3" });

        expect(res.status).toBe(409);
        expect(moveSpy).not.toHaveBeenCalled();
    });
});
