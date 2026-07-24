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

export function createSamplesRoutes(container: ServiceContainer): Router {
    const samplesRepository = container.samplesRepository;
    const musicDir = resolveService(container, "musicDir");
    const storage = resolveService(container, "storage");
    const identity = resolveService(container, "identity");
    const waveformService = container.waveformService;
    const authMiddleware = container.authMiddleware;

    const router = Router();

    const upload = multer({
        storage: createTempStorage(),
        fileFilter: (_req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            if (AUDIO_EXTENSIONS.has(ext)) cb(null, true);
            else cb(new Error(`Unsupported file type: ${ext}`));
        },
        limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    });

    const rejectAs400 = (mw: any) => (req: any, res: any, next: any) =>
        mw(req, res, (err: any) => {
            if (!err) return next();
            res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "File too large (max 100MB)" : err.message || "Upload rejected" });
        });

    const canManage = (req: AuthenticatedRequest, sample: { ownerId: number | null; artistId: number | null }) =>
        VisibilityGuardian.canManageItem(req.context ?? VisibilityGuardian.deriveContext(req), {
            owner_id: sample.ownerId,
            artist_id: sample.artistId,
        });

    const canModerate = (req: AuthenticatedRequest) => {
        const context = req.context ?? VisibilityGuardian.deriveContext(req);
        return VisibilityGuardian.can(context, Capability.MANAGE_PRIVATE_LIBRARY);
    };

    /**
     * GET /api/samples
     */
    router.get("/", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const mine = req.query.mine === "true";
        if (mine) {
            if (!req.userId) throw new ForbiddenError("Unauthorized");
            const samples = samplesRepository.list({ ownerId: req.userId, search: req.query.q as string });
            return res.json(samples);
        }
        const samples = samplesRepository.list({ status: "approved", search: req.query.q as string, limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined, offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined });
        res.json(samples);
    }));

    /**
     * GET /api/samples/moderation/pending
     */
    router.get("/moderation/pending", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!canModerate(req)) throw new ForbiddenError("Unauthorized");
        res.json(samplesRepository.list({ status: "pending" }));
    }));

    /**
     * GET /api/samples/:id
     */
    router.get("/:id(\\d+)", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const sample = samplesRepository.getById(parseInt(req.params.id, 10));
        if (!sample) throw new NotFoundError("Sample not found");
        if (sample.status !== "approved" && !canManage(req, sample) && !canModerate(req)) {
            throw new ForbiddenError("Access denied");
        }
        res.json(sample);
    }));

    /**
     * GET /api/samples/:id/download
     */
    router.get("/:id(\\d+)/download", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const sample = samplesRepository.getById(parseInt(req.params.id, 10));
        if (!sample) throw new NotFoundError("Sample not found");
        if (sample.status !== "approved" && !canManage(req, sample) && !canModerate(req)) {
            throw new ForbiddenError("Access denied");
        }
        const filePath = resolveSafePath(musicDir, sample.filePath);
        if (!filePath || !(await fs.pathExists(filePath))) throw new NotFoundError("Sample file not found");
        samplesRepository.incrementDownloadCount(sample.id);
        const filename = `${sample.title}${path.extname(filePath)}`;
        res.download(filePath, filename);
    }));

    /**
     * GET /api/samples/:id/waveform
     */
    router.get("/:id(\\d+)/waveform", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const sample = samplesRepository.getById(parseInt(req.params.id, 10));
        if (!sample) throw new NotFoundError("Sample not found");
        if (sample.status !== "approved" && !canManage(req, sample) && !canModerate(req)) {
            throw new ForbiddenError("Access denied");
        }
        const filePath = resolveSafePath(musicDir, sample.filePath);
        if (!filePath || !(await fs.pathExists(filePath))) throw new NotFoundError("Sample file not found");
        const svg = await waveformService.getWaveformSVG(`sample-${sample.id}`, filePath);
        res.setHeader("Content-Type", "image/svg+xml");
        res.setHeader("Cache-Control", "public, max-age=31536000");
        res.send(svg);
    }));

    /**
     * POST /api/samples
     */
    router.post("/", authMiddleware.requireUser, rejectAs400(upload.single("file")), wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const file = req.file as Express.Multer.File | undefined;
        try {
            const context = req.context ?? VisibilityGuardian.deriveContext(req);
            if (!VisibilityGuardian.canPublishContent(context)) throw new ForbiddenError("Publishing requires an artist profile");
            if (!file) throw new BadRequestError("No file uploaded");

            const { title, description, bpm, musicalKey, license, attributionName } = req.body;
            if (!title) throw new BadRequestError("Title is required");

            const dir = path.join(musicDir, "samples");
            await storage.ensureDir(dir);
            const ext = path.extname(file.originalname).toLowerCase();
            const targetFilename = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
            const targetPath = path.join(dir, targetFilename);
            await storage.move(file.path, targetPath, { overwrite: true });
            const dbPath = path.relative(musicDir, targetPath).replace(/\\/g, "/");

            const trusted = req.isRootAdmin || req.isAdmin || req.isSuperUser;
            const autoApprove = trusted || identity.getSetting("listenerSelfPublish") === "true";

            const tags = req.body.tags ? String(req.body.tags).split(",").map((t: string) => t.trim()).filter(Boolean) : [];

            const sample = samplesRepository.create({
                title,
                artistId: req.artistId ?? null,
                ownerId: req.userId ?? null,
                description: description ?? null,
                filePath: dbPath,
                format: ext.replace(".", ""),
                duration: null,
                fileSize: file.size,
                bpm: bpm ? parseInt(bpm, 10) : null,
                musicalKey: musicalKey ?? null,
                tags,
                license: license ?? "cc0",
                attributionName: attributionName ?? null,
                coverPath: null,
                status: autoApprove ? "approved" : "pending",
            });
            res.status(201).json(sample);
        } catch (err) {
            if (file) await storage.remove(file.path).catch(() => {});
            throw err;
        }
    }));

    /**
     * PUT /api/samples/:id
     */
    router.put("/:id(\\d+)", authMiddleware.requireUser, wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const sample = samplesRepository.getById(parseInt(req.params.id, 10));
        if (!sample) throw new NotFoundError("Sample not found");
        if (!canManage(req, sample)) throw new ForbiddenError("Access denied");

        const { title, description, bpm, musicalKey, license, attributionName, tags } = req.body;
        const updated = samplesRepository.update(sample.id, {
            ...(title !== undefined && { title }),
            ...(description !== undefined && { description }),
            ...(bpm !== undefined && { bpm: bpm ? parseInt(bpm, 10) : null }),
            ...(musicalKey !== undefined && { musicalKey }),
            ...(license !== undefined && { license }),
            ...(attributionName !== undefined && { attributionName }),
            ...(tags !== undefined && { tags }),
        });
        res.json(updated);
    }));

    /**
     * DELETE /api/samples/:id
     */
    router.delete("/:id(\\d+)", authMiddleware.requireUser, wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const sample = samplesRepository.getById(parseInt(req.params.id, 10));
        if (!sample) throw new NotFoundError("Sample not found");
        if (!canManage(req, sample)) throw new ForbiddenError("Access denied");

        const filePath = resolveSafePath(musicDir, sample.filePath);
        if (filePath) await storage.remove(filePath).catch(() => {});
        samplesRepository.delete(sample.id);
        res.status(204).end();
    }));

    /**
     * POST /api/samples/:id/approve
     */
    router.post("/:id(\\d+)/approve", authMiddleware.requireUser, wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!canModerate(req)) throw new ForbiddenError("Unauthorized");
        const sample = samplesRepository.setModeration(parseInt(req.params.id, 10), "approved", req.body?.notes);
        if (!sample) throw new NotFoundError("Sample not found");
        res.json(sample);
    }));

    /**
     * POST /api/samples/:id/reject
     */
    router.post("/:id(\\d+)/reject", authMiddleware.requireUser, wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!canModerate(req)) throw new ForbiddenError("Unauthorized");
        const sample = samplesRepository.setModeration(parseInt(req.params.id, 10), "rejected", req.body?.notes);
        if (!sample) throw new NotFoundError("Sample not found");
        res.json(sample);
    }));

    return router;
}
