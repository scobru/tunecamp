import path from "path";
import fs from "fs";
import crypto from "crypto";

export interface ServerConfig {
    port: number;
    musicDir: string;
    dbPath: string;
    jwtSecret: string;
    corsOrigins: string[];
    publicUrl?: string;  // Public URL for Zen registration (e.g., https://mysite.com)
    siteName?: string;   // Site name for community registry    
    siteDescription?: string;
    relayUrl?: string;
    // Federated discovery bootstrap seeds (HTTP origins of known TuneCamp
    // instances). Used alongside ActivityPub-followed instances; no central
    // default — discovery is gossip-based from these starting points.
    federationSeeds?: string[];
    adminUser?: string;
    adminPass?: string;
    downloadDir?: string;
    stripeOnrampSecretKey?: string;
    telegramBotToken?: string;
    telegramMasterId?: string;
    openrouterApiKey?: string;
    openrouterModel?: string;
    stripeSecretKey?: string;
    stripeWebhookSecret?: string;
    gdriveClientId?: string;
    gdriveClientSecret?: string;

    // Live streaming (P2P WebRTC audio rooms). The server only announces
    // sessions; media flows browser-to-browser, so the cost of enabling
    // this is negligible. Opt-out via TUNECAMP_LIVE_ENABLED=false.
    liveEnabled: boolean;

    // Transcode cache (#2): on-the-fly transcodes are written here so repeat
    // requests for the same (track, format, bitrate) are served as plain file reads.
    transcodeCacheDir: string;
    transcodeCacheMaxBytes: number;

    // X-Accel-Redirect offload (#3): when enabled, local audio is handed to the
    // reverse proxy (nginx) to serve, taking Node out of the byte-pushing data path.
    // Opt-in: requires matching `internal` locations in the nginx config.
    xaccelRedirect: boolean;
    xaccelMediaPrefix: string;   // internal location aliased to musicDir
    xaccelCachePrefix: string;   // internal location aliased to transcodeCacheDir
}

/**
 * Load server configuration from environment variables or defaults
 */
export async function loadConfig(overrides?: Partial<ServerConfig>): Promise<ServerConfig> {
    const defaultDbPath = path.join(process.cwd(), "tunecamp.db");
    const defaultMusicDir = path.join(process.cwd(), "music");

    // Generate a random JWT secret if not provided
    let jwtSecret = process.env.TUNECAMP_JWT_SECRET || overrides?.jwtSecret;

    if (!jwtSecret) {
        // Bolt ⚡: Store the secret in the same directory as the database for stability
        const dbDir = path.dirname(process.env.TUNECAMP_DB_PATH || defaultDbPath);
        const secretFilePath = path.join(dbDir, '.jwt-secret');
        const legacySecretPath = path.join(process.cwd(), '.jwt-secret');

        let secretFileExists = false;
        try {
            await fs.promises.access(secretFilePath);
            secretFileExists = true;
        } catch {}

        let legacySecretExists = false;
        try {
            await fs.promises.access(legacySecretPath);
            legacySecretExists = true;
        } catch {}

        if (secretFileExists) {
            jwtSecret = (await fs.promises.readFile(secretFilePath, 'utf-8')).trim();
        } else if (legacySecretExists) {
            // Migration: Move legacy secret to new stable location
            jwtSecret = (await fs.promises.readFile(legacySecretPath, 'utf-8')).trim();
            try {
                fs.promises.writeFile(secretFilePath, jwtSecret)
                    .then(() => console.log(`🔒 Migrated JWT secret to stable location: ${secretFilePath}`))
                    .catch((e) => console.warn("⚠️ Could not migrate JWT secret:", e));
            } catch (e) {
                console.warn("⚠️ Could not migrate JWT secret:", e);
            }
        } else {
            jwtSecret = crypto.randomBytes(32).toString("hex");
            try {
                (fs.existsSync(dbDir) ? Promise.resolve() : fs.promises.mkdir(dbDir, { recursive: true }))
                    .then(() => fs.promises.writeFile(secretFilePath, jwtSecret as string, { mode: 0o600 }))
                    .then(() => console.log(`🔒 Generated new JWT secret and saved to ${secretFilePath} (restricted permissions)`))
                    .catch((err) => console.warn("⚠️  Could not save JWT secret to file, sessions may be lost on restart:", err));
            } catch (err) {
                console.warn("⚠️  Could not save JWT secret to file, sessions may be lost on restart:", err);
            }
        }
    }

    const finalMusicDir = overrides?.musicDir || process.env.TUNECAMP_MUSIC_DIR || defaultMusicDir;
    const defaultDownloadDir = path.join(finalMusicDir, "downloads");

    // Transcode cache lives next to the database (same stable, writable location).
    const finalDbPath = process.env.TUNECAMP_DB_PATH || defaultDbPath;
    const defaultTranscodeCacheDir = path.join(path.dirname(finalDbPath), "cache", "transcode");
    const transcodeCacheDir = process.env.TUNECAMP_TRANSCODE_CACHE_DIR || overrides?.transcodeCacheDir || defaultTranscodeCacheDir;
    const transcodeCacheMaxBytes = parseInt(
        process.env.TUNECAMP_TRANSCODE_CACHE_MAX_BYTES || "",
        10
    ) || overrides?.transcodeCacheMaxBytes || 2 * 1024 * 1024 * 1024; // 2 GB

    return {
        port: parseInt(process.env.TUNECAMP_PORT || "1970", 10),
        musicDir: finalMusicDir,
        dbPath: process.env.TUNECAMP_DB_PATH || defaultDbPath,
        jwtSecret,
        corsOrigins: process.env.TUNECAMP_CORS_ORIGINS?.split(",") || [],
        publicUrl: process.env.TUNECAMP_PUBLIC_URL || overrides?.publicUrl,
        siteName: process.env.TUNECAMP_SITE_NAME || overrides?.siteName,
        federationSeeds: process.env.TUNECAMP_FEDERATION_SEEDS?.split(/[,\s]+/).map(p => p.trim()).filter(p => p.length > 0) || overrides?.federationSeeds,
        adminUser: process.env.TUNECAMP_ADMIN_USER || overrides?.adminUser || "admin",
        adminPass: process.env.TUNECAMP_ADMIN_PASS || overrides?.adminPass || "admin",
        downloadDir: process.env.TUNECAMP_DOWNLOAD_DIR || overrides?.downloadDir || defaultDownloadDir,
        stripeOnrampSecretKey: process.env.STRIPE_ONRAMP_SECRET_KEY || process.env.STRIPE_SECRET_KEY || overrides?.stripeOnrampSecretKey,
        telegramBotToken: process.env.TUNECAMP_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || overrides?.telegramBotToken,
        telegramMasterId: process.env.TUNECAMP_TELEGRAM_MASTER_ID || process.env.TELEGRAM_MASTER_ID || overrides?.telegramMasterId,
        openrouterApiKey: process.env.OPENROUTER_API_KEY || overrides?.openrouterApiKey,
        openrouterModel: process.env.OPENROUTER_MODEL || overrides?.openrouterModel || "openrouter/free",
        stripeSecretKey: process.env.STRIPE_SECRET_KEY || overrides?.stripeSecretKey,
        stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || overrides?.stripeWebhookSecret,
        gdriveClientId: process.env.TUNECAMP_GDRIVE_CLIENT_ID || overrides?.gdriveClientId,
        gdriveClientSecret: process.env.TUNECAMP_GDRIVE_CLIENT_SECRET || overrides?.gdriveClientSecret,
        liveEnabled: process.env.TUNECAMP_LIVE_ENABLED !== undefined
            ? process.env.TUNECAMP_LIVE_ENABLED !== "false"
            : (overrides?.liveEnabled ?? true),
        transcodeCacheDir,
        transcodeCacheMaxBytes,
        xaccelRedirect: process.env.TUNECAMP_XACCEL_REDIRECT === "true" || overrides?.xaccelRedirect || false,
        xaccelMediaPrefix: process.env.TUNECAMP_XACCEL_MEDIA_PREFIX || overrides?.xaccelMediaPrefix || "/_protected_media",
        xaccelCachePrefix: process.env.TUNECAMP_XACCEL_CACHE_PREFIX || overrides?.xaccelCachePrefix || "/_protected_cache",
    };
}
