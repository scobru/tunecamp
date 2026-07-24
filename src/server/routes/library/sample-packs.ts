import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import os from "os";
import fs from "fs-extra";
import { resolveSafePath } from "../../../utils/fileUtils.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { wrapAsync } from "../../middleware/error-handling.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../common/errors.js";
import { VisibilityGuardian, Capability } from "../../common/visibility.js";
import { resolveService, type ServiceContainer } from "../../core/container.js";

const AUDIO_EXTENSIONS = new Set([".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac", ".opus"]);

function createTempStorage() {
    return multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, os.tmpdir()),
        filename: (_req, file, cb) => {
            const unique = Date.now() + "-" + crypto.randomBytes(8).toString("hex");
            cb(null, `sample-${unique}${path.extname(file.originalname).toLowerCase()}`);
        },
    });
}

export function createSamplePacksRoutes(container: ServiceContainer): Router {
    const samplePacksRepository = container.samplePacksRepository;
    const samplesRepository = container.samplesRepository;
    const musicDir = resolveService(container, "musicDir");
    const storage = resolveService(container, "storage");
    const authMiddleware = container.authMiddleware;

    const router = Router();

    const upload = multer({
        storage: createTempStorage(),
        fileFilter: (_req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            if (AUDIO_EXTENSIONS.has(ext)) cb(null, true);
            else cb(new Error(`Unsupported file type: ${ext}`));
        },
        limits: { fileSize: 100 * 1024 * 1024, files: 50 },
    });

    const rejectAs400 = (mw: any) => (req: any, res: any, next: any) =>
        mw(req, res, (err: any) => {
            if (!err) return next();
            res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "File too large (max 100MB)" : err.message || "Upload rejected" });
        });

    const canManage = (req: AuthenticatedRequest, pack: { ownerId: number | null; artistId: number | null }) =>
        VisibilityGuardian.canManageItem(req.context ?? VisibilityGuardian.deriveContext(req), {
            owner_id: pack.ownerId,
            artist_id: pack.artistId,
        });

    const canModerate = (req: AuthenticatedRequest) => {
        const context = req.context ?? VisibilityGuardian.deriveContext(req);
        return VisibilityGuardian.can(context, Capability.MANAGE_PRIVATE_LIBRARY);
    };

    /**
     * GET /api/sample-packs
     */
    router.get("/", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const mine = req.query.mine === "true";
        if (mine) {
            if (!req.userId) throw new ForbiddenError("Unauthorized");
            return res.json(samplePacksRepository.list({ ownerId: req.userId, search: req.query.q as string }));
        }
        res.json(samplePacksRepository.list({
            status: "approved",
            search: req.query.q as string,
            limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
            offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
        }));
    }));

    /**
     * GET /api/sample-packs/moderation/pending
     */
    router.get("/moderation/pending", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!canModerate(req)) throw new ForbiddenError("Unauthorized");
        res.json(samplePacksRepository.list({ status: "pending" }));
    }));

    /**
     * GET /api/sample-packs/:id
     */
    router.get("/:id(\\d+)", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const pack = samplePacksRepository.getById(parseInt(req.params.id, 10));
        if (!pack) throw new NotFoundError("Sample pack not found");
        const authorized = pack.status === "approved" || canManage(req, pack) || canModerate(req);
        if (!authorized) throw new ForbiddenError("Access denied");
        const samples = samplesRepository.list({
            packId: pack.id,
            status: authorized && pack.status !== "approved" ? undefined : "approved",
        });
        res.json({ ...pack, samples });
    }));

    /**
     * POST /api/sample-packs
     */
    router.post("/", authMiddleware.requireUser, rejectAs400(upload.array("files", 50)), wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const files = (req.files as Express.Multer.File[] | undefined) ?? [];
        try {
            const context = req.context ?? VisibilityGuardian.deriveContext(req);
            if (!VisibilityGuardian.canPublishContent(context)) throw new ForbiddenError("Publishing requires an artist profile");
            if (files.length === 0) throw new BadRequestError("No files uploaded");

            const { title, description, license, attributionName } = req.body;
            if (!title) throw new BadRequestError("Title is required");

            const trusted = req.isRootAdmin || req.isAdmin || req.isSuperUser;
            const identity = resolveService(container, "identity");
            const autoApprove = trusted || identity.getSetting("listenerSelfPublish") === "true";
            const status = autoApprove ? "approved" : "pending";

            const pack = samplePacksRepository.create({
                title,
                artistId: req.artistId ?? null,
                ownerId: req.userId ?? null,
                description: description ?? null,
                coverPath: null,
                license: license ?? "cc0",
                status,
            });

            const dir = path.join(musicDir, "samples");
            await storage.ensureDir(dir);
            for (const file of files) {
                const ext = path.extname(file.originalname).toLowerCase();
                const targetFilename = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
                const targetPath = path.join(dir, targetFilename);
                await storage.move(file.path, targetPath, { overwrite: true });
                const dbPath = path.relative(musicDir, targetPath).replace(/\\/g, "/");
                samplesRepository.create({
                    title: path.basename(file.originalname, ext),
                    artistId: req.artistId ?? null,
                    ownerId: req.userId ?? null,
                    packId: pack.id,
                    description: null,
                    filePath: dbPath,
                    format: ext.replace(".", ""),
                    duration: null,
                    fileSize: file.size,
                    bpm: null,
                    musicalKey: null,
                    tags: [],
                    license: license ?? "cc0",
                    attributionName: attributionName ?? null,
                    coverPath: null,
                    status,
                });
            }
            res.status(201).json(samplePacksRepository.getById(pack.id));
        } catch (err) {
            await Promise.all(files.map((f) => storage.remove(f.path).catch(() => {})));
            throw err;
        }
    }));

    /**
     * PUT /api/sample-packs/:id
     */
    router.put("/:id(\\d+)", authMiddleware.requireUser, wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const pack = samplePacksRepository.getById(parseInt(req.params.id, 10));
        if (!pack) throw new NotFoundError("Sample pack not found");
        if (!canManage(req, pack)) throw new ForbiddenError("Access denied");

        const { title, description, license } = req.body;
        const updated = samplePacksRepository.update(pack.id, {
            ...(title !== undefined && { title }),
            ...(description !== undefined && { description }),
            ...(license !== undefined && { license }),
        });
        res.json(updated);
    }));

    /**
     * DELETE /api/sample-packs/:id
     */
    router.delete("/:id(\\d+)", authMiddleware.requireUser, wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const pack = samplePacksRepository.getById(parseInt(req.params.id, 10));
        if (!pack) throw new NotFoundError("Sample pack not found");
        if (!canManage(req, pack)) throw new ForbiddenError("Access denied");

        const children = samplesRepository.list({ packId: pack.id, limit: 1000 });
        for (const sample of children) {
            const filePath = resolveSafePath(musicDir, sample.filePath);
            if (filePath) await storage.remove(filePath).catch(() => {});
            samplesRepository.delete(sample.id);
        }
        samplePacksRepository.delete(pack.id);
        res.status(204).end();
    }));

    /**
     * POST /api/sample-packs/:id/approve
     */
    router.post("/:id(\\d+)/approve", authMiddleware.requireUser, wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!canModerate(req)) throw new ForbiddenError("Unauthorized");
        const pack = samplePacksRepository.setModeration(parseInt(req.params.id, 10), "approved", req.body?.notes);
        if (!pack) throw new NotFoundError("Sample pack not found");
        res.json(pack);
    }));

    /**
     * POST /api/sample-packs/:id/reject
     */
    router.post("/:id(\\d+)/reject", authMiddleware.requireUser, wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!canModerate(req)) throw new ForbiddenError("Unauthorized");
        const pack = samplePacksRepository.setModeration(parseInt(req.params.id, 10), "rejected", req.body?.notes);
        if (!pack) throw new NotFoundError("Sample pack not found");
        res.json(pack);
    }));

    return router;
}
