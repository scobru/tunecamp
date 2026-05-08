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
    zenPeers?: string[];
    adminUser?: string;
    adminPass?: string;
    downloadDir?: string;
    stripeOnrampSecretKey?: string;
    moonpayApiKey?: string;
    telegramBotToken?: string;
    telegramMasterId?: string;
    openrouterApiKey?: string;
    openrouterModel?: string;
    stripeSecretKey?: string;
    stripeWebhookSecret?: string;
    paypalClientId?: string;
    paypalClientSecret?: string;
    paypalEnvironment?: string;
}

/**
 * Load server configuration from environment variables or defaults
 */
export function loadConfig(overrides?: Partial<ServerConfig>): ServerConfig {
    const defaultDbPath = path.join(process.cwd(), "tunecamp.db");
    const defaultMusicDir = path.join(process.cwd(), "music");

    // Generate a random JWT secret if not provided
    let jwtSecret = process.env.TUNECAMP_JWT_SECRET || overrides?.jwtSecret;

    if (!jwtSecret) {
        // Bolt ⚡: Store the secret in the same directory as the database for stability
        const dbDir = path.dirname(process.env.TUNECAMP_DB_PATH || defaultDbPath);
        const secretFilePath = path.join(dbDir, '.jwt-secret');
        const legacySecretPath = path.join(process.cwd(), '.jwt-secret');

        if (fs.existsSync(secretFilePath)) {
            jwtSecret = fs.readFileSync(secretFilePath, 'utf-8').trim();
        } else if (fs.existsSync(legacySecretPath)) {
            // Migration: Move legacy secret to new stable location
            jwtSecret = fs.readFileSync(legacySecretPath, 'utf-8').trim();
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

    return {
        port: parseInt(process.env.TUNECAMP_PORT || "1970", 10),
        musicDir: finalMusicDir,
        dbPath: process.env.TUNECAMP_DB_PATH || defaultDbPath,
        jwtSecret,
        corsOrigins: process.env.TUNECAMP_CORS_ORIGINS?.split(",") || [],
        publicUrl: process.env.TUNECAMP_PUBLIC_URL || overrides?.publicUrl,
        siteName: process.env.TUNECAMP_SITE_NAME || overrides?.siteName,
        zenPeers: process.env.TUNECAMP_ZEN_PEERS?.split(/[,\s]+/).map(p => p.trim()).filter(p => p.length > 0) || overrides?.zenPeers,
        adminUser: process.env.TUNECAMP_ADMIN_USER || overrides?.adminUser || "admin",
        adminPass: process.env.TUNECAMP_ADMIN_PASS || overrides?.adminPass || "admin",
        downloadDir: process.env.TUNECAMP_DOWNLOAD_DIR || overrides?.downloadDir || defaultDownloadDir,
        stripeOnrampSecretKey: process.env.STRIPE_ONRAMP_SECRET_KEY || process.env.STRIPE_SECRET_KEY || overrides?.stripeOnrampSecretKey,
        moonpayApiKey: process.env.MOONPAY_API_KEY || overrides?.moonpayApiKey,
        telegramBotToken: process.env.TUNECAMP_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || overrides?.telegramBotToken,
        telegramMasterId: process.env.TUNECAMP_TELEGRAM_MASTER_ID || process.env.TELEGRAM_MASTER_ID || overrides?.telegramMasterId,
        openrouterApiKey: process.env.OPENROUTER_API_KEY || overrides?.openrouterApiKey,
        openrouterModel: process.env.OPENROUTER_MODEL || overrides?.openrouterModel || "openrouter/free",
        stripeSecretKey: process.env.STRIPE_SECRET_KEY || overrides?.stripeSecretKey,
        stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || overrides?.stripeWebhookSecret,
        paypalClientId: process.env.PAYPAL_CLIENT_ID || overrides?.paypalClientId,
        paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET || overrides?.paypalClientSecret,
        paypalEnvironment: process.env.PAYPAL_ENVIRONMENT || overrides?.paypalEnvironment || "sandbox",
    };
}
