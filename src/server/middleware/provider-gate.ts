import type { Request, Response, NextFunction } from "express";
import { getDownloadService } from "../modules/catalog/download.service.js";

/**
 * Gates routes behind a download provider's plugin toggle.
 *
 * P2P sources (Soulseek, BitTorrent) are disabled by default: they are
 * legally grey for a music-selling platform and must be an explicit
 * admin opt-in (Admin → Integrations). This middleware enforces the
 * toggle on routes that talk to the underlying services directly,
 * bypassing the provider registry.
 */
export function requireDownloadProvider(providerId: string) {
    return (_req: Request, res: Response, next: NextFunction) => {
        const registry = getDownloadService()?.getRegistry();
        if (!registry || !registry.isEnabled(providerId)) {
            return res.status(403).json({
                error: `The '${providerId}' integration is disabled. An administrator can enable it under Admin → Integrations. Use it only for content you own the rights to.`
            });
        }
        next();
    };
}

/**
 * Param-based variant of requireDownloadProvider for generic provider routes
 * (/content/provider/:providerId/...): 404 for a provider that isn't
 * registered at all, 403 for one the admin has not enabled.
 */
export function requireDownloadProviderParam(paramName = "providerId") {
    return (req: Request, res: Response, next: NextFunction) => {
        const providerId = req.params[paramName];
        const registry = getDownloadService()?.getRegistry();
        if (!providerId || !registry || !registry.get(providerId)) {
            return res.status(404).json({ error: "Unknown download provider" });
        }
        if (!registry.isEnabled(providerId)) {
            return res.status(403).json({
                error: `The '${providerId}' integration is disabled. An administrator can enable it under Admin → Integrations. Use it only for content you own the rights to.`
            });
        }
        next();
    };
}

/** Non-middleware variant for startup logic and conditional code paths. */
export function isDownloadProviderEnabled(providerId: string): boolean {
    return getDownloadService()?.getRegistry().isEnabled(providerId) ?? false;
}
