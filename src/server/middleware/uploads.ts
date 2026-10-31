import type { Request, Response, NextFunction } from "express";
import fs from "fs-extra";

/**
 * Deletes whatever multer stored for this request when the response is an
 * error. Mount it before the multer middleware. Without it, a request refused
 * after multer ran (403, 404, 413…) left its file on disk for good, so any
 * account could fill the disk one rejected upload at a time.
 */
export function discardUploadOnError(req: Request, res: Response, next: NextFunction): void {
    res.on("finish", () => {
        if (res.statusCode < 400) return;
        const r = req as any;
        const many = Array.isArray(r.files) ? r.files : Object.values(r.files || {}).flat();
        for (const file of [r.file, ...many]) {
            if (file?.path) fs.remove(file.path).catch(() => {});
        }
    });
    next();
}
