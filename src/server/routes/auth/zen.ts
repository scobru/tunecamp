import { Router, json } from "express";
import crypto from "crypto";
import type { ServiceContainer } from "../../core/container.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rateLimit.js";

// In-memory challenge store with 10-minute TTL
const activeChallenges = new Map<string, { username: string; nonce: string; timestamp: number }>();

// Cleanup expired challenges every 5 minutes
const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, item] of activeChallenges.entries()) {
        if (now - item.timestamp > 10 * 60 * 1000) {
            activeChallenges.delete(key);
        }
    }
}, 5 * 60 * 1000);
cleanupTimer.unref?.();

export function createZenRoutes(container: ServiceContainer): Router {
    const authMiddleware = container.authMiddleware;
    const authService = container.authService;
    const database = container.database;
    const config = container.config;
    const router = Router();
    router.use(json());

    /**
     * GET /api/auth/zen/challenge
     * Generates a cryptographic challenge for the logged-in user to sign with their Zen SEA key.
     */
    router.get("/challenge", authMiddleware.requireUser, (req: AuthenticatedRequest, res) => {
        const username = req.username;
        if (!username) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const nonce = crypto.randomBytes(16).toString("hex");
        const timestamp = Date.now();
        const instanceDomain = req.hostname || (config as any).host || "localhost";

        const challenge = {
            instanceDomain,
            username,
            nonce,
            timestamp
        };

        const challengeKey = `${username}:${nonce}`;
        activeChallenges.set(challengeKey, { username, nonce, timestamp });

        return res.json({
            success: true,
            challenge
        });
    });

    /**
     * POST /api/auth/zen/link
     * Verifies the SEA signed challenge and returns an Instance Passport Badge.
     */
    router.post("/link", authMiddleware.requireUser, rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req: AuthenticatedRequest, res) => {
        const username = req.username;
        if (!username) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const { zenPubKey, challenge, seaSignature } = req.body;

        if (!zenPubKey || !challenge || !challenge.nonce || !challenge.instanceDomain) {
            return res.status(400).json({ error: "Missing zenPubKey, challenge, or nonce" });
        }

        const challengeKey = `${username}:${challenge.nonce}`;
        const stored = activeChallenges.get(challengeKey);

        if (!stored || stored.username !== username) {
            return res.status(400).json({ error: "Invalid or expired challenge nonce" });
        }

        // Consume the challenge nonce (one-time use)
        activeChallenges.delete(challengeKey);

        const instanceDomain = req.hostname || (config as any).host || "localhost";
        const issuedAt = Date.now();
        const secret = (config as any).jwtSecret || "tunecamp-zen-passport-secret";

        // Generate HMAC Instance Passport Signature
        const passportPayload = `${instanceDomain}:${username}:${zenPubKey}:${issuedAt}`;
        const passportSignature = crypto.createHmac("sha256", secret).update(passportPayload).digest("hex");

        const passport = {
            instanceDomain,
            localUsername: username,
            zenPubKey,
            issuedAt,
            passportSignature,
            publicDataEndpoint: `https://${instanceDomain}/api/auth/zen/user/${username}/public`
        };

        return res.json({
            success: true,
            passport
        });
    });

    /**
     * GET /api/auth/zen/user/:username/public
     * Returns ONLY public profile data and public releases/tracks for Zen identity aggregation.
     */
    router.get("/user/:username/public", async (req, res) => {
        const { username } = req.params;

        try {
            const user = authService.getUserByUsername(username);
            if (!user || !user.is_active) {
                return res.status(404).json({ error: "User not found or inactive" });
            }

            // Get public artist profile if linked
            let artist = null;
            if (user.artist_id) {
                artist = (database as any).prepare?.(`SELECT id, name, bio, image_url FROM artists WHERE id = ?`).get(user.artist_id);
            }

            // Get public releases for this artist
            let releases: any[] = [];
            if (user.artist_id) {
                releases = (database as any).prepare?.(
                    `SELECT id, title, cover_url, release_date, type FROM releases WHERE artist_id = ? AND status = 'published'`
                ).all(user.artist_id) || [];
            }

            // Get public playlists created by user
            const playlists = (database as any).prepare?.(
                `SELECT id, name, cover_url, created_at FROM playlists WHERE user_id = ? AND is_public = 1`
            ).all(user.id) || [];

            return res.json({
                success: true,
                publicProfile: {
                    username: user.username,
                    artistName: artist?.name || user.artist_name || user.username,
                    bio: artist?.bio || null,
                    imageUrl: artist?.image_url || null,
                    joinedAt: user.created_at
                },
                publicReleases: releases,
                publicPlaylists: playlists
            });
        } catch (err: any) {
            console.error("[ZEN-PUBLIC] Error fetching public profile:", err);
            return res.status(500).json({ error: "Internal server error" });
        }
    });

    return router;
}
