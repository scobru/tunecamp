import { Router, json } from "express";
import type { ServiceContainer } from "../../core/container.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { FidChallengeManager, FidPassportIssuer, FidSsoHandler } from "fid";
import { UserRole } from "../../common/visibility.js";
import crypto from "node:crypto";

// Global FID challenge manager and passport issuer instances
const fidChallengeManager = new FidChallengeManager(10, 5);

/**
 * One-time authorization codes for the SSO code-exchange flow.
 *
 * The portal POSTs the SSO token and the derived ActivityPub seed straight to this
 * server and gets back a short-lived code instead of a session. Only the code travels
 * through the browser's address bar, so the seed never lands in history, in a Referer,
 * or in anything that reads `location`. The webapp then trades the code for its JWT.
 *
 * ponytail: in-process Map — matches the single-process SQLite deployment this instance
 * targets. Move to the DB (or Redis) if the server is ever run in cluster mode, otherwise
 * a code minted by one worker is unredeemable on another.
 */
const SSO_CODE_TTL_MS = 2 * 60 * 1000;
const ssoCodes = new Map<string, { session: Record<string, unknown>; expiresAt: number }>();

function mintSsoCode(session: Record<string, unknown>): string {
    const code = crypto.randomBytes(32).toString("base64url");
    ssoCodes.set(code, { session, expiresAt: Date.now() + SSO_CODE_TTL_MS });
    return code;
}

/** Redeems a code. Returns undefined if unknown, already used, or expired — codes are single-use. */
function redeemSsoCode(code: string): Record<string, unknown> | undefined {
    const entry = ssoCodes.get(code);
    if (!entry) return undefined;
    ssoCodes.delete(code);
    if (Date.now() > entry.expiresAt) return undefined;
    return entry.session;
}

// Codes are removed on redemption; this only clears the ones nobody ever came back for.
const ssoCodeSweeper = setInterval(() => {
    const now = Date.now();
    for (const [code, entry] of ssoCodes) {
        if (now > entry.expiresAt) ssoCodes.delete(code);
    }
}, SSO_CODE_TTL_MS);
ssoCodeSweeper.unref?.();

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
    const ssoHandler = new FidSsoHandler(passportSecret);

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
    router.post("/link", rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req: AuthenticatedRequest, res) => {
        const { zenPubKey, challenge, seaSignature } = req.body;

        if (!zenPubKey || !challenge || !challenge.nonce || !challenge.instanceDomain || !seaSignature) {
            return res.status(400).json({ error: "Missing zenPubKey, challenge, nonce, or seaSignature" });
        }

        // Look up the user by zen_pub — the portal authenticates via the
        // signed challenge, not a session cookie. This mirrors the /sso flow.
        const user = db.prepare(
            "SELECT id, username, artist_id, role, is_active, zen_pub, token_version FROM admin WHERE zen_pub = ?"
        ).get(zenPubKey) as any;

        if (!user) {
            return res.status(401).json({ error: "FID identity not found" });
        }

        const username = user.username;
        const profile = authService.getUserProfile?.(username);
        const displayUsername = profile?.alias || username;
        const instanceDomain = req.hostname || (config as any).host || "localhost";

        // Verify the Zen SEA signature over the challenge and consume the one-time nonce
        const isValid = await fidChallengeManager.consumeChallenge(displayUsername, challenge.nonce, seaSignature, zenPubKey);
        if (!isValid) {
            return res.status(400).json({ error: "Invalid signature, or invalid/expired challenge nonce" });
        }

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
     * GET /api/auth/zen/instances
     * Returns the FID registry entries for the authenticated user.
     * Used by the global portal to discover which instances a user has artists on.
     */
    router.get("/instances", authMiddleware.requireUser, async (req: AuthenticatedRequest, res) => {
        const username = req.username;
        if (!username) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const user = authService.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const entries = database.getFidRegistry(user.id);
        return res.json({
            success: true,
            instances: entries
        });
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

            // For WebAuthn, never trust the publicKeyPem embedded in the token itself
            // (client-supplied, forgeable) — verify against the key we stored the
            // first time this credentialId was seen (trust-on-first-use).
            let trustedWebauthnKey: string | undefined;
            let isFirstWebauthnSighting = false;
            if (ssoToken.masterKeySource?.type === 'webauthn') {
                trustedWebauthnKey = database.getFidWebauthnKey(ssoToken.masterKeySource.credentialId);
                if (!trustedWebauthnKey) {
                    // Nothing pinned yet for this credentialId, so the only key available is
                    // the one the token declares. validateSsoToken refuses to make that choice
                    // implicitly (it would let anyone self-sign), so we make it here and
                    // explicitly: the assertion still has to verify against that key, proving
                    // the caller holds the private half, and the key is pinned below.
                    isFirstWebauthnSighting = true;
                    trustedWebauthnKey = ssoToken.masterKeySource.publicKeyPem;
                }
            }

            // Verify SSO token using FidSsoHandler from fid package
            let validation;
            try {
                validation = await ssoHandler.validateSsoToken(ssoToken, undefined, trustedWebauthnKey);
            } catch (e) {
                // Handle buffer length mismatch in older fid package (fixed in f75135d)
                if (e instanceof RangeError && e.message.includes("Input buffers must have the same byte length")) {
                    return res.status(400).json({ error: "Invalid passport signature" });
                }
                // Re-throw other unexpected errors
                throw e;
            }

            if (!validation.valid) {
                const status = validation.error?.includes("expired") ? 401 : 400;
                return res.status(status).json({ error: validation.error });
            }

            // First successful login for this credentialId: pin its public key so
            // future /sso calls above verify against it instead of the token's own claim.
            if (isFirstWebauthnSighting) {
                database.registerFidWebauthnKey(ssoToken.masterKeySource.credentialId, ssoToken.masterKeySource.publicKeyPem);
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

            const desiredUsername = ssoToken.username;
            // Stable per-source identity key stored in zen_pub: Zen SEA uses the raw
            // pubKey, WebAuthn uses its credentialId (ssoToken.zenPubKey is always ''
            // for WebAuthn tokens, so it can't be used for lookup/storage there).
            const zenPubKey = ssoToken.masterKeySource?.type === 'webauthn'
                ? `webauthn:${ssoToken.masterKeySource.credentialId}`
                : ssoToken.zenPubKey;

            // Look up by FID identity (zen_pub) first, never by username: matching on
            // username/alias alone would let anyone log in as an unrelated existing
            // account (possibly a curator/admin) just by picking a colliding handle.
            let user = db.prepare(
                "SELECT id, username, artist_id, role, is_active, zen_pub, token_version FROM admin WHERE zen_pub = ?"
            ).get(zenPubKey) as any;

            let isNewUser = false;
            let userId: number;

            if (!user) {
                isNewUser = true;
                const randomPassword = crypto.randomBytes(16).toString("hex");
                const DEFAULT_QUOTA = 1024 * 1024 * 1024;
                const role = UserRole.NORMAL_USER;

                // If the desired handle is already taken by someone else, register
                // under a unique internal username but keep the requested handle as
                // the public alias/slug, and still map it to this FID identity.
                const collision = authService.getUserByUsername(desiredUsername);
                const username = collision ? `${desiredUsername}-${zenPubKey.slice(0, 6)}` : desiredUsername;

                const created = await authService.createUser(username, randomPassword, null, DEFAULT_QUOTA, zenPubKey, role);
                userId = created.id;
                if (collision) {
                    authService.updateUserProfile(username, { alias: desiredUsername });
                }
                user = authService.getUserByUsername(username);
            } else {
                userId = user.id;

                // Update ActivityPub keys on existing artist if present
                if (user.artist_id && publicKeyPem && privateKeyPem) {
                    const artist = db.prepare("SELECT public_key FROM artists WHERE id = ?").get(user.artist_id) as { public_key?: string } | undefined;
                    if (!artist || !artist.public_key) {
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
                username: user.username,
                artistId: user.artist_id,
                role: user.role,
                isActive: user.is_active === 1,
                tokenVersion: (user as any).token_version ?? 0
            });

            const session = {
                success: true,
                token,
                expiresIn: "7d",
                username: user.username,
                artistId: user.artist_id,
                role: user.role,
                isNewUser
            };

            // Code mode: the caller is the identity portal, a third party that must never
            // hold a session for this instance. Hand back only a one-time code, which the
            // user's own browser trades for the JWT on /sso/exchange.
            if (req.body?.mode === "code") {
                return res.json({ success: true, code: mintSsoCode(session), expiresIn: SSO_CODE_TTL_MS / 1000 });
            }

            return res.json(session);
        } catch (error: any) {
            console.error("SSO Login error:", error.message, error.stack);
            res.status(500).json({ error: "SSO Login failed" });
        }
    });

    /**
     * POST /api/auth/zen/sso/exchange
     * Trades a one-time code minted by POST /sso (mode: "code") for the session JWT.
     * Codes expire after 2 minutes and are burned on the first redemption.
     */
    router.post("/sso/exchange", rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }), (req, res) => {
        const { code } = req.body ?? {};
        if (typeof code !== "string" || !code) {
            return res.status(400).json({ error: "Missing code" });
        }

        const session = redeemSsoCode(code);
        if (!session) {
            return res.status(400).json({ error: "Invalid, expired or already used code" });
        }

        return res.json(session);
    });

    return router;
}