import { Router, json } from "express";
import type { ServiceContainer } from "../../core/container.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { FidChallengeManager, FidPassportIssuer } from "fid";
import { UserRole } from "../../common/visibility.js";
import crypto from "node:crypto";

// Global FID challenge manager and passport issuer instances
const fidChallengeManager = new FidChallengeManager(10, 5);

export function createZenRoutes(container: ServiceContainer): Router {
    const authMiddleware = container.authMiddleware;
    const authService = container.authService;
    const database = container.database;
    const db = (database as any).db || database;
    const config = container.config;
    const router = Router();
    router.use(json());

    const passportSecret = (config as any).jwtSecret || "tunecamp-zen-passport-secret";
    const passportIssuer = new FidPassportIssuer(passportSecret);

    /**
     * GET /api/auth/zen/challenge
     * Generates a cryptographic challenge for the logged-in user to sign with their Zen SEA key via FID.
     */
    router.get("/challenge", authMiddleware.requireUser, (req: AuthenticatedRequest, res) => {
        const username = req.username;
        if (!username) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const profile = authService.getUserProfile?.(username);
        const displayUsername = profile?.alias || username;
        const instanceDomain = req.hostname || (config as any).host || "localhost";

        const challenge = fidChallengeManager.createChallenge(displayUsername, instanceDomain);

        return res.json({
            success: true,
            challenge
        });
    });

    /**
     * POST /api/auth/zen/link
     * Verifies the SEA signed challenge and returns an Instance Passport Badge via FID.
     */
    router.post("/link", authMiddleware.requireUser, rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req: AuthenticatedRequest, res) => {
        const username = req.username;
        if (!username) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const { zenPubKey, challenge } = req.body;

        if (!zenPubKey || !challenge || !challenge.nonce || !challenge.instanceDomain) {
            return res.status(400).json({ error: "Missing zenPubKey, challenge, or nonce" });
        }

        const profile = authService.getUserProfile?.(username);
        const displayUsername = profile?.alias || username;

        // Consume one-time challenge nonce via FID Challenge Manager
        const isValid = fidChallengeManager.consumeChallenge(displayUsername, challenge.nonce);
        if (!isValid) {
            return res.status(400).json({ error: "Invalid or expired challenge nonce" });
        }

        const instanceDomain = req.hostname || (config as any).host || "localhost";
        const passport = passportIssuer.issuePassport(instanceDomain, displayUsername, zenPubKey);

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

            const profile = authService.getUserProfile?.(user.username);
            const userAlias = profile?.alias || user.username;

            // Get public artist profile if linked
            let artist: any = null;
            if (user.artist_id) {
                artist = db.prepare(`SELECT id, name, bio, photo_path as image_url FROM artists WHERE id = ?`).get(user.artist_id);
            }
            if (!artist && (user as any).artist_name) {
                artist = db.prepare(`SELECT id, name, bio, photo_path as image_url FROM artists WHERE LOWER(name) = LOWER(?)`).get((user as any).artist_name);
            }
            if (!artist) {
                artist = db.prepare(`SELECT id, name, bio, photo_path as image_url FROM artists WHERE LOWER(name) = LOWER(?) OR LOWER(name) = LOWER(?)`).get(user.username, userAlias);
            }

            // Collect all unique artist names associated with this user account
            const artistNames = Array.from(new Set([
                user.username,
                userAlias,
                (user as any).artist_name,
                artist?.name
            ].filter(Boolean) as string[]));

            // Collect all artist IDs linked to user or matching any of their artist names
            const artistIds: number[] = [];
            if (user.artist_id) artistIds.push(user.artist_id);
            if (artist?.id && !artistIds.includes(artist.id)) artistIds.push(artist.id);

            if (artistNames.length > 0) {
                try {
                    const nameConds = artistNames.map(() => 'LOWER(name) = LOWER(?)').join(' OR ');
                    const matchedArtists = db.prepare(`SELECT id FROM artists WHERE ${nameConds}`).all(...artistNames) || [];
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
                    SELECT DISTINCT id, title, cover_path as cover_url, date as release_date, type, status, visibility
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
                releases = db.prepare(albumQuery).all(...queryParams) || [];
            } catch (queryErr) {
                try {
                    releases = db.prepare(
                        `SELECT id, title, cover_path as cover_url, date as release_date, type FROM albums WHERE artist_id IN (${placeholders})`
                    ).all(...artistIds) || [];
                } catch(e) {}
            }

            // Get public playlists created by user
            let playlists: any[] = [];
            try {
                playlists = db.prepare(
                    `SELECT id, name, cover_path as cover_url, created_at FROM playlists WHERE (LOWER(username) = LOWER(?) OR LOWER(username) = LOWER(?)) AND is_public = 1`
                ).all(user.username, userAlias) || [];
            } catch(e) {
                console.warn("[ZEN-PUBLIC] Error querying playlists:", e);
            }

            // Get public likes / starred items created by user
            let likes: any[] = [];
            try {
                likes = db.prepare(`
                    SELECT s.item_type as type, s.item_id as id, s.created_at,
                           a.title as album_title, a.cover_path as album_cover,
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
                    artistName: artist?.name || (user as any).artist_name || userAlias || user.username,
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

        const valid = passportIssuer.verifyPassport({
            instanceDomain,
            localUsername,
            zenPubKey,
            issuedAt,
            passportSignature,
            publicDataEndpoint: ""
        });

        if (valid) {
            return res.json({ valid: true });
        } else {
            return res.status(400).json({ valid: false, error: "Invalid signature" });
        }
    });

    /**
     * POST /api/auth/zen/sso
     * Verifies the SSO Token from the Global Portal and registers/logs in the user.
     */
    router.post("/sso", rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
        try {
            const { ssoToken, apSeed } = req.body;
            if (!ssoToken || !apSeed) {
                return res.status(400).json({ error: "Missing ssoToken or apSeed payload" });
            }

            // Verify required SSO token fields
            if (!ssoToken.username || !ssoToken.issuedAt || !ssoToken.zenPubKey) {
                return res.status(400).json({ error: "Missing required ssoToken fields (username, issuedAt, zenPubKey)" });
            }

            // Verify token age (max 15 mins)
            if (Date.now() - ssoToken.issuedAt > 15 * 60 * 1000) {
                return res.status(401).json({ error: "SSO token expired" });
            }

            // Derive Ed25519 keypair from apSeed (Zero-Knowledge Proof of Master Key)
            const ED25519_PKCS8_HEADER = Buffer.from("302e020100300506032b657004220420", "hex");
            const seedBuffer = Buffer.from(apSeed, "hex");

            if (seedBuffer.length !== 32) {
                return res.status(400).json({ error: "Invalid apSeed length" });
            }

            const derPrivateKey = Buffer.concat([ED25519_PKCS8_HEADER, seedBuffer]);
            
            const privateKeyObj = crypto.createPrivateKey({
                key: derPrivateKey,
                format: "der",
                type: "pkcs8"
            });
            const publicKeyObj = crypto.createPublicKey(privateKeyObj);
            
            const privateKeyPem = privateKeyObj.export({ type: "pkcs8", format: "pem" }).toString();
            const publicKeyPem = publicKeyObj.export({ type: "spki", format: "pem" }).toString();

            const username = ssoToken.username;
            let user = authService.getUserByUsername(username);

            let isNewUser = false;
            let userId: number;

            // Register user if not exists
            if (!user) {
                isNewUser = true;
                const randomPassword = crypto.randomBytes(16).toString("hex");
                const DEFAULT_QUOTA = 1024 * 1024 * 1024;
                
                // Register as a standard listener (NORMAL_USER) without auto-creating an artist profile
                const role = UserRole.NORMAL_USER;
                const created = await authService.createUser(username, randomPassword, null, DEFAULT_QUOTA, ssoToken.zenPubKey, role);
                userId = created.id;
                user = authService.getUserByUsername(username);
            } else {
                userId = user.id;
                
                // 1. Check if user is linked to a different Zen PubKey
                const userGunPub = (user as any).gun_pub;
                if (userGunPub && ssoToken.zenPubKey && userGunPub !== ssoToken.zenPubKey) {
                    return res.status(401).json({ error: "This account is linked to a different Zen PubKey" });
                }

                // 2. Link Zen PubKey if not set yet
                if (!userGunPub && ssoToken.zenPubKey) {
                    db.prepare("UPDATE admin SET gun_pub = ? WHERE id = ?").run(ssoToken.zenPubKey, user.id);
                }

                // 3. Update ActivityPub keys on existing artist if present
                if (user.artist_id && publicKeyPem && privateKeyPem) {
                    const artist = db.prepare("SELECT public_key FROM artists WHERE id = ?").get(user.artist_id) as { public_key?: string } | undefined;
                    if (!artist || !artist.public_key || userGunPub !== ssoToken.zenPubKey) {
                        db.prepare("UPDATE artists SET public_key = ?, private_key = ? WHERE id = ?")
                          .run(publicKeyPem, privateKeyPem, user.artist_id);
                    }
                }
            }

            if (!user) {
                return res.status(500).json({ error: "Failed to retrieve user after creation" });
            }

            // Generate JWT Token
            const token = authService.generateToken({
                userId,
                isAdmin: user.role === 'admin' || user.role === 'root_admin',
                username,
                artistId: user.artist_id,
                role: user.role,
                isActive: user.is_active === 1,
                tokenVersion: 0
            });

            return res.json({
                success: true,
                token,
                expiresIn: "7d",
                username,
                artistId: user.artist_id,
                role: user.role,
                isNewUser
            });
        } catch (error: any) {
            console.error("SSO Login error:", error.message, error.stack);
            res.status(500).json({ error: "SSO Login failed" });
        }
    });

    return router;
}
