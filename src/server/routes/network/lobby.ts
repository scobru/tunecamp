import { Router, json } from "express";
import crypto from "crypto";
import type { DatabaseService } from "../../core/database.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";

const LOBBY_TOKEN_SETTING = "lobbyToken";
const LOBBY_ROOM_FALLBACK = "public";

/**
 * Lobby chat routes.
 *
 * The lobby is a public, multi-user chat encrypted with a single shared
 * symmetric token. The token is held server-side and handed out ONLY to
 * authenticated (registered) users. Clients use it to encrypt/decrypt messages
 * stored on the shared Zen graph, so unregistered users and random peers see
 * only opaque ciphertext.
 *
 * This is NOT end-to-end encryption: the server knows the token and could
 * decrypt. It gates the room to registered users — nothing more. For that
 * reason the token is a dedicated, rotatable secret, never the DB/JWT secret.
 *
 * Mount with `requireUser` so the token is never exposed to guests.
 */
import type { ServiceContainer } from "../../core/container.js";

export function createLobbyRoutes(container: ServiceContainer): Router {
    const identity: ServiceContainer['identity'] = (container as any).identity || (container as any);
    const database: ServiceContainer['database'] = (container as any).database || (container as any);
    const router = Router();
    router.use(json());

    /** Lazily generate the shared lobby token on first request. */
    function getOrCreateToken(): string {
        let token = identity.getSetting(LOBBY_TOKEN_SETTING);
        if (!token) {
            token = crypto.randomBytes(32).toString("base64url");
            identity.setSetting(LOBBY_TOKEN_SETTING, token);
            console.log("🔐 [Lobby] Generated new shared lobby token.");
        }
        return token;
    }

    /** Stable room id, scoped to this instance so instances don't collide on the global graph. */
    function getRoom(): string {
        return identity.getSetting("siteId") || LOBBY_ROOM_FALLBACK;
    }

    /**
     * GET /api/lobby/token
     * Returns the shared lobby token + room id for the current instance.
     * Requires an authenticated user (enforced by the mount middleware).
     */
    router.get("/token", (req: AuthenticatedRequest, res) => {
        try {
            res.json({ token: getOrCreateToken(), room: getRoom() });
        } catch (error) {
            console.error("Lobby token error:", error);
            res.status(500).json({ error: "Failed to get lobby token" });
        }
    });

    return router;
}
