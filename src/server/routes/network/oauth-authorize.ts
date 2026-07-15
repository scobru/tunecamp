import crypto from "crypto";
import { Router, json } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import type { ServiceContainer } from "../../core/container.js";

/**
 * Counterpart to tunecamp-sso's /auth/callback: signs an actor assertion so a
 * user already logged into this instance can prove that identity to the SSO
 * service without sharing the instance's JWT. redirect_uri is checked against
 * an operator-configured allowlist, not caller input, so a compromised SSO
 * deployment can't redirect a signed assertion to an arbitrary origin.
 */
export function createOAuthAuthorizeRoutes(container: ServiceContainer): Router {
    const db = container.database;
    const config = container.config;
    const authMiddleware = container.authMiddleware;
    const router = Router();
    router.use(json());

    router.post("/authorize", authMiddleware.requireUser, (req, res) => {
        const request = req as AuthenticatedRequest;
        const { redirect_uri, state } = req.body || {};

        if (!redirect_uri || typeof redirect_uri !== "string" || !state || typeof state !== "string") {
            return res.status(400).json({ error: "Missing redirect_uri or state" });
        }

        const allowed = config.ssoRedirectUris || [];
        if (!allowed.includes(redirect_uri)) {
            return res.status(403).json({ error: "redirect_uri not allowed" });
        }

        let slug: string | undefined;
        let privateKeyPem: string | null | undefined;
        const username = request.username;

        if (request.artistId != null) {
            const artist = db.getArtist(request.artistId);
            if (artist) {
                slug = artist.slug;
                privateKeyPem = artist.private_key;
            }
        }
        if (!privateKeyPem && username) {
            const user = db.getUserByUsername(username);
            if (user?.ap_private_key) {
                slug = username;
                privateKeyPem = user.ap_private_key;
            }
        }

        if (!slug || !privateKeyPem) {
            return res.status(400).json({ error: "No ActivityPub identity/keys linked to this account" });
        }

        const publicUrl = db.getSetting("publicUrl") || config.publicUrl;
        if (!publicUrl) {
            return res.status(500).json({ error: "Instance publicUrl is not configured" });
        }

        const actorUrl = new URL(`/users/${slug}`, publicUrl).href;
        const iat = Math.floor(Date.now() / 1000);
        const assertion = crypto
            .sign("RSA-SHA256", Buffer.from(`${actorUrl}\n${state}\n${iat}`), privateKeyPem)
            .toString("base64");

        const redirectUrl = new URL(redirect_uri);
        redirectUrl.searchParams.set("state", state);
        redirectUrl.searchParams.set("actor", actorUrl);
        redirectUrl.searchParams.set("username", username || slug);
        redirectUrl.searchParams.set("iat", String(iat));
        redirectUrl.searchParams.set("assertion", assertion);

        res.json({ redirectUrl: redirectUrl.href });
    });

    return router;
}
