import express, { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import os from "os";
import fs from "fs-extra";
import { resolveSafePath } from "../../../utils/fileUtils.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { wrapAsync } from "../../middleware/error-handling.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../common/errors.js";
import { VisibilityGuardian } from "../../common/visibility.js";
import { resolveService, type ServiceContainer } from "../../core/container.js";

const AUDIO_EXTENSIONS = new Set([".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac", ".opus", ".webm"]);

function createTempStorage() {
    return multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, os.tmpdir()),
        filename: (_req, file, cb) => {
            const unique = Date.now() + "-" + crypto.randomBytes(8).toString("hex");
            cb(null, `stem-${unique}${path.extname(file.originalname).toLowerCase()}`);
        },
    });
}

export function createCollabRoutes(container: ServiceContainer): Router {
    const collabRepository = container.collabRepository;
    const musicDir = resolveService(container, "musicDir");
    const storage = resolveService(container, "storage");

    const router = Router();
    router.use(express.json());

    const upload = multer({
        storage: createTempStorage(),
        fileFilter: (_req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, AUDIO_EXTENSIONS.has(ext));
        },
        limits: { fileSize: 100 * 1024 * 1024 },
    });

    /**
     * GET /api/collab
     */
    router.get("/", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const mine = req.query.mine === "true";
        if (mine) {
            res.json(collabRepository.list({ ownerId: req.userId! }));
            return;
        }
        res.json(collabRepository.list({ visibility: "shared" }));
    }));

    /**
     * GET /api/collab/:id
     */
    router.get("/:id(\\d+)", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const project = collabRepository.getById(parseInt(req.params.id, 10));
        if (!project) throw new NotFoundError("Collab project not found");
        if (project.visibility !== "shared" && project.ownerId !== req.userId) {
            throw new ForbiddenError("Access denied");
        }
        res.json({
            ...project,
            versions: collabRepository.listVersions(project.id),
            stems: collabRepository.listStems(project.id),
        });
    }));

    /**
     * POST /api/collab
     */
    router.post("/", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const context = req.context ?? VisibilityGuardian.deriveContext(req);
        if (!VisibilityGuardian.canPublishContent(context)) throw new ForbiddenError("Publishing not permitted");
        const { title, description } = req.body;
        if (!title) throw new BadRequestError("Title is required");
        const project = collabRepository.create({ title, description: description ?? null, ownerId: req.userId! });
        res.status(201).json(project);
    }));

    /**
     * DELETE /api/collab/:id
     */
    router.delete("/:id(\\d+)", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const project = collabRepository.getById(parseInt(req.params.id, 10));
        if (!project) throw new NotFoundError("Collab project not found");
        if (project.ownerId !== req.userId) throw new ForbiddenError("Only the project creator can delete it");
        for (const stem of collabRepository.listStems(project.id)) {
            const filePath = resolveSafePath(musicDir, stem.filePath);
            if (filePath) await storage.remove(filePath).catch(() => {});
        }
        collabRepository.delete(project.id);
        res.status(204).end();
    }));

    /**
     * POST /api/collab/:id/versions
     */
    router.post("/:id(\\d+)/versions", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const project = collabRepository.getById(parseInt(req.params.id, 10));
        if (!project) throw new NotFoundError("Collab project not found");
        const context = req.context ?? VisibilityGuardian.deriveContext(req);
        if (!VisibilityGuardian.canPublishContent(context)) throw new ForbiddenError("Publishing not permitted");
        if (project.visibility !== "shared" && project.ownerId !== req.userId) throw new ForbiddenError("Access denied");
        const { state, note } = req.body;
        if (!state) throw new BadRequestError("State is required");
        const version = collabRepository.createVersion({
            projectId: project.id,
            authorId: req.userId!,
            state: typeof state === "string" ? state : JSON.stringify(state),
            note: note ?? null,
        });
        res.status(201).json(version);
    }));

    /**
     * POST /api/collab/:id/stems
     */
    router.post("/:id(\\d+)/stems", upload.single("file"), wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const project = collabRepository.getById(parseInt(req.params.id, 10));
        if (!project) throw new NotFoundError("Collab project not found");
        const context = req.context ?? VisibilityGuardian.deriveContext(req);
        if (!VisibilityGuardian.canPublishContent(context)) throw new ForbiddenError("Publishing not permitted");
        if (project.visibility !== "shared" && project.ownerId !== req.userId) throw new ForbiddenError("Access denied");
        const file = req.file as Express.Multer.File | undefined;
        if (!file) throw new BadRequestError("No audio file uploaded");

        try {
            const dir = path.join(musicDir, "collab", String(project.id));
            await storage.ensureDir(dir);
            const ext = path.extname(file.originalname).toLowerCase();
            const targetFilename = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
            const targetPath = path.join(dir, targetFilename);
            await storage.move(file.path, targetPath, { overwrite: true });
            const dbPath = path.relative(musicDir, targetPath).replace(/\\/g, "/");
            const stem = collabRepository.createStem({
                projectId: project.id,
                authorId: req.userId!,
                name: req.body.name || path.basename(file.originalname, ext),
                filePath: dbPath,
                mimeType: file.mimetype ?? null,
                duration: null,
            });
            res.status(201).json(stem);
        } catch (err) {
            await storage.remove(file.path).catch(() => {});
            throw err;
        }
    }));

    /**
     * GET /api/collab/:id/stems/:stemId/download
     */
    router.get("/:id(\\d+)/stems/:stemId(\\d+)/download", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const project = collabRepository.getById(parseInt(req.params.id, 10));
        if (!project) throw new NotFoundError("Collab project not found");
        if (project.visibility !== "shared" && project.ownerId !== req.userId) throw new ForbiddenError("Access denied");
        const stem = collabRepository.getStemById(parseInt(req.params.stemId, 10));
        if (!stem || stem.projectId !== project.id) throw new NotFoundError("Stem not found");
        const filePath = resolveSafePath(musicDir, stem.filePath);
        if (!filePath || !(await fs.pathExists(filePath))) throw new NotFoundError("Stem file missing");
        res.sendFile(path.resolve(filePath));
    }));

    /**
     * DELETE /api/collab/:id/stems/:stemId
     */
    router.delete("/:id(\\d+)/stems/:stemId(\\d+)", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const project = collabRepository.getById(parseInt(req.params.id, 10));
        if (!project) throw new NotFoundError("Collab project not found");
        const stem = collabRepository.getStemById(parseInt(req.params.stemId, 10));
        if (!stem || stem.projectId !== project.id) throw new NotFoundError("Stem not found");
        if (stem.authorId !== req.userId && project.ownerId !== req.userId) throw new ForbiddenError("Access denied");
        const filePath = resolveSafePath(musicDir, stem.filePath);
        if (filePath) await storage.remove(filePath).catch(() => {});
        collabRepository.deleteStem(stem.id);
        res.status(204).end();
    }));

    return router;
}
