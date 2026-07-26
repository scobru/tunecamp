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

        const profile = authService.getUserProfile?.(username);
        const displayUsername = profile?.alias || username;

        const nonce = crypto.randomBytes(16).toString("hex");
        const timestamp = Date.now();
        const instanceDomain = req.hostname || (config as any).host || "localhost";

        const challenge = {
            instanceDomain,
            username: displayUsername,
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

        const profile = authService.getUserProfile?.(username);
        const displayUsername = profile?.alias || username;

        const instanceDomain = req.hostname || (config as any).host || "localhost";
        const issuedAt = Date.now();
        const secret = (config as any).jwtSecret || "tunecamp-zen-passport-secret";

        // Generate HMAC Instance Passport Signature
        const passportPayload = `${instanceDomain}:${displayUsername}:${zenPubKey}:${issuedAt}`;
        const passportSignature = crypto.createHmac("sha256", secret).update(passportPayload).digest("hex");

        const passport = {
            instanceDomain,
            localUsername: displayUsername,
            zenPubKey,
            issuedAt,
            passportSignature,
            publicDataEndpoint: `https://${instanceDomain}/api/auth/zen/user/${displayUsername}/public`
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

            const profile = authService.getUserProfile?.(user.username);
            const userAlias = profile?.alias || user.username;

            // Get public artist profile if linked
            let artist = null;
            if (user.artist_id) {
                artist = (database as any).prepare?.(`SELECT id, name, bio, image_url FROM artists WHERE id = ?`).get(user.artist_id);
            }
            if (!artist && user.artist_name) {
                artist = (database as any).prepare?.(`SELECT id, name, bio, image_url FROM artists WHERE LOWER(name) = LOWER(?)`).get(user.artist_name);
            }
            if (!artist) {
                artist = (database as any).prepare?.(`SELECT id, name, bio, image_url FROM artists WHERE LOWER(name) = LOWER(?) OR LOWER(name) = LOWER(?)`).get(user.username, userAlias);
            }

            // Collect all unique artist names associated with this user account
            const artistNames = Array.from(new Set([
                user.username,
                userAlias,
                user.artist_name,
                artist?.name
            ].filter(Boolean) as string[]));

            // Collect all artist IDs linked to user or matching any of their artist names
            const artistIds: number[] = [];
            if (user.artist_id) artistIds.push(user.artist_id);
            if (artist?.id && !artistIds.includes(artist.id)) artistIds.push(artist.id);

            if (artistNames.length > 0) {
                try {
                    const nameConds = artistNames.map(() => 'LOWER(name) = LOWER(?)').join(' OR ');
                    const matchedArtists = (database as any).prepare?.(`SELECT id FROM artists WHERE ${nameConds}`).all(...artistNames) || [];
                    for (const a of matchedArtists) {
                        if (a.id && !artistIds.includes(a.id)) artistIds.push(a.id);
                    }
                } catch(e) {}
            }

            const placeholders = artistIds.length > 0 ? artistIds.map(() => '?').join(',') : '0';
            const namePlaceholders = artistNames.length > 0 ? artistNames.map(() => 'LOWER(?)').join(',') : "''";

            // Get public releases/albums for this user or their artists
            let releases: any[] = [];
            try {
                const albumQuery = `
                    SELECT DISTINCT id, title, COALESCE(cover_path, external_artwork) as cover_url, date as release_date, type, status, visibility
                    FROM albums 
                    WHERE (
                        owner_id = ? 
                        OR (artist_id IS NOT NULL AND artist_id IN (${placeholders}))
                        OR (album_artist IS NOT NULL AND LOWER(album_artist) IN (${namePlaceholders}))
                        OR owner_id IS NULL
                    )
                    AND (
                        visibility = 'public' 
                        OR (visibility IS NOT NULL AND visibility != 'private')
                        OR is_public = 1 
                        OR is_release = 1 
                        OR status = 'published'
                        OR status = 'released'
                    )
                `;
                const queryParams = [user.id, ...artistIds, ...artistNames];
                releases = (database as any).prepare?.(albumQuery).all(...queryParams) || [];
            } catch (queryErr) {
                try {
                    releases = (database as any).prepare?.(
                        `SELECT id, title, cover_url, release_date, type FROM releases WHERE artist_id IN (${placeholders})`
                    ).all(...artistIds) || [];
                } catch(e) {}
            }

            // Get public playlists created by user
            let playlists: any[] = [];
            try {
                playlists = (database as any).prepare?.(
                    `SELECT id, name, cover_path as cover_url, created_at FROM playlists WHERE (LOWER(username) = LOWER(?) OR LOWER(username) = LOWER(?)) AND is_public = 1`
                ).all(user.username, userAlias) || [];
            } catch(e) {
                console.warn("[ZEN-PUBLIC] Error querying playlists:", e);
            }

            // Get public likes / starred items created by user
            let likes: any[] = [];
            try {
                likes = (database as any).prepare?.(`
                    SELECT s.item_type as type, s.item_id as id, s.created_at,
                           a.title as album_title, COALESCE(a.cover_path, a.external_artwork) as album_cover,
                           t.title as track_title, t.artist_name as track_artist
                    FROM starred_items s
                    LEFT JOIN albums a ON (s.item_type = 'album' OR s.item_type = 'release') AND CAST(a.id AS TEXT) = s.item_id
                    LEFT JOIN tracks t ON s.item_type = 'track' AND CAST(t.id AS TEXT) = s.item_id
                    WHERE LOWER(s.username) = LOWER(?) OR LOWER(s.username) = LOWER(?)
                    ORDER BY s.id DESC LIMIT 20
                `).all(user.username, userAlias) || [];
            } catch(e) {
                console.warn("[ZEN-PUBLIC] Error querying starred_items:", e);
            }

            return res.json({
                success: true,
                publicProfile: {
                    username: userAlias || user.username,
                    artistName: artist?.name || user.artist_name || userAlias || user.username,
                    bio: artist?.bio || null,
                    imageUrl: artist?.image_url || null,
                    joinedAt: user.created_at
                },
                publicReleases: releases,
                publicPlaylists: playlists,
                publicLikes: likes
            });
        } catch (err: any) {
            console.error("[ZEN-PUBLIC] Error fetching public profile:", err);
            return res.status(500).json({ error: "Internal server error" });
        }
    });

    /**
     * POST /api/auth/zen/verify
     * Verifies an Instance Passport JSON to cryptographically prove it was issued by this instance.
     * Accessible via public CORS so the global portal can call it.
     */
    router.post("/verify", (req, res) => {
        const { instanceDomain, localUsername, zenPubKey, issuedAt, passportSignature } = req.body;

        if (!instanceDomain || !localUsername || !zenPubKey || !issuedAt || !passportSignature) {
            return res.status(400).json({ valid: false, error: "Malformed passport" });
        }

        const secret = (config as any).jwtSecret || "tunecamp-zen-passport-secret";
        
        // Re-generate HMAC Instance Passport Signature
        const passportPayload = `${instanceDomain}:${localUsername}:${zenPubKey}:${issuedAt}`;
        const expectedSignature = crypto.createHmac("sha256", secret).update(passportPayload).digest("hex");

        if (passportSignature === expectedSignature) {
            return res.json({ valid: true });
        } else {
            return res.status(400).json({ valid: false, error: "Invalid signature" });
        }
    });

    return router;
}
