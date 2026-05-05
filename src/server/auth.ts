import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Database } from "better-sqlite3";
import fetch from "node-fetch";
import crypto from "crypto";
import { Zen } from "./zen.js";
// ZEN handles its own crypto natively
import { isSafeUrl } from "../utils/networkUtils.js";
import { UserRole } from "./common/visibility.js";

// Polyfill WebCrypto for Gun.SEA in Node.js ESM
if (typeof global !== 'undefined' && !global.crypto) {
    // Fallback to standard Node crypto if available (Node 18+)
    // @ts-ignore
    global.crypto = crypto.webcrypto || crypto;
    console.log("🔐 [AUTH] WebCrypto linked to standard Node crypto");
}

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = "7d";


export enum AuthProvider {
    MASTODON = "mastodon"
}
export interface TokenPayload {
    isAdmin: boolean;
    username: string;
    artistId: number | null;
    role: UserRole;
    isActive: boolean;
    userId: number;
    tokenVersion: number;
    isRootAdmin?: boolean;
}

export interface AuthService {
    hashPassword(password: string): Promise<string>;
    verifyPassword(password: string, hash: string): Promise<boolean>;
    generateToken(payload: TokenPayload): string;
    verifyToken(token: string): Promise<TokenPayload | null>;
    revokeTokens(userId: number): void;
    // ... rest of methods

    // Multi-user management
    authenticateUser(username: string, password: string, pubKey?: string, proof?: string): Promise<{ success: boolean; artistId: number | null; isAdmin: boolean; id: number; role: UserRole; isActive: boolean; tokenVersion: number; pair?: any } | false>;
    verifyZenSignature(message: any, pubKey: string, proof: string): Promise<boolean>;
    verifySubsonicToken(username: string, token: string, salt: string): Promise<boolean>;
    createAdmin(username: string, password: string, artistId?: number | null, role?: UserRole): Promise<{ id: number }>;
    createUser(username: string, password: string, artistId: number | null, storageQuota?: number, pubKey?: string, role?: UserRole): Promise<{ id: number }>;
    updateAdmin(id: number, artistId: number | null, role?: UserRole): void;
    updateStorageUsed(userId: number, bytesUsed: number): void;
    getStorageInfo(userId: number): { storage_quota: number; storage_used: number } | null;
    getAdminById(id: number): { id: number; username: string; artist_id: number | null; artist_name: string | null; role: UserRole; storage_quota: number; is_active: number; created_at: string; is_root: boolean } | undefined;
    getUserByUsername(username: string): { id: number; username: string; artist_id: number | null; artist_name: string | null; role: UserRole; storage_quota: number; is_active: number; created_at: string; is_root: boolean } | undefined;
    listAdmins(): { id: number; username: string; artist_id: number | null; role: UserRole; storage_quota: number; is_active: number; created_at: string }[];
    deleteAdmin(id: number): void;
    toggleUserStatus(id: number, active: boolean): void;
    changePassword(username: string, newPassword: string): Promise<void>;
    isFirstRun(): boolean;
    /** Returns true if the username belongs to the root admin (id=1, first created). */
    isRootAdmin(username: string): boolean;
    /** Returns the GunDB pair for a user if they have one. */
    getUserPair(username: string): any | null;
    /** Updates or sets the ZEN pair for a user. */
    updateZenPair(username: string, pair: any): void;

    // Mastodon
    registerMastodonApp(instanceUrl: string, redirectUri: string): Promise<{ clientId: string; clientSecret: string; redirectUri: string }>;
    getMastodonAuthUrl(instanceUrl: string, clientId: string, redirectUri: string): string;
    exchangeMastodonCode(instanceUrl: string, clientId: string, clientSecret: string, redirectUri: string, code: string): Promise<{ accessToken: string; user: { acct: string; display_name: string; url: string } }>;

    // Low-Level Mastodon Login (Sotto Banco)
    loginWithMastodon(instanceUrl: string, redirectUri: string, code: string): Promise<{ pair: any; alias: string }>;

    // ZEN Key Management
    encryptZenPriv(priv: any): string;
    decryptZenPriv(encrypted: string): any;

    /** Derives an Ethereum-compatible private key from a ZEN pair. */
    deriveZenWallet(pair: any, id?: string): Promise<string>;

    // Default password check
    isDefaultPassword(username: string): Promise<boolean>;
    init(): Promise<void>;
}

export function createAuthService(
    db: Database,
    jwtSecret: string,
    adminUser: string = "admin",
    adminPass: string = "admin"
): AuthService {
    // Ensure admin table exists with new schema
    try {
        // Check if table exists
        const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admin'").get();

        if (!tableExists) {
            db.exec(`
                CREATE TABLE admin (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    artist_id INTEGER DEFAULT NULL,
                    role TEXT NOT NULL DEFAULT 'admin',
                    storage_quota INTEGER NOT NULL DEFAULT 0,
                    storage_used INTEGER NOT NULL DEFAULT 0,
                    subsonic_token TEXT,
                    subsonic_password TEXT,
                    gun_pub TEXT,
                    gun_priv TEXT,
                    gun_auth_mode TEXT NOT NULL DEFAULT 'local',
                    is_active INTEGER DEFAULT 1,
                    token_version INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } else {
            // Check if columns exist (migration)
            const columns = db.prepare("PRAGMA table_info(admin)").all() as any[];
            const hasUsername = columns.some(c => c.name === 'username');
            const hasArtistId = columns.some(c => c.name === 'artist_id');
            const hasRole = columns.some(c => c.name === 'role');
            const hasGunPub = columns.some(c => c.name === 'gun_pub');
            const hasSubsonic = columns.some(c => c.name === 'subsonic_token');
            const hasIsActive = columns.some(c => c.name === 'is_active');
            const hasTokenVersion = columns.some(c => c.name === 'token_version');

            if (!hasTokenVersion) {
                console.log("📦 Migrating admin table: Adding token_version column...");
                try {
                    db.exec("ALTER TABLE admin ADD COLUMN token_version INTEGER DEFAULT 0");
                } catch (e) {
                    console.error("Failed to add token_version column:", e);
                }
            }

            if (!hasUsername || !hasArtistId || !hasRole || !hasGunPub || !hasSubsonic || !hasIsActive) {
                console.log("📦 Migrating admin table to multi-user support (with roles, quotas, keys, and status)...");
                // We need to recreate the table
                // 1. Rename existing table
                db.exec("ALTER TABLE admin RENAME TO admin_old");

                // 2. Create new table with role + storage + gun keys
                db.exec(`
                    CREATE TABLE admin (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT NOT NULL UNIQUE,
                        password_hash TEXT NOT NULL,
                        artist_id INTEGER DEFAULT NULL,
                        role TEXT NOT NULL DEFAULT 'admin',
                        storage_quota INTEGER NOT NULL DEFAULT 0,
                        storage_used INTEGER NOT NULL DEFAULT 0,
                        subsonic_token TEXT,
                        subsonic_password TEXT,
                        gun_pub TEXT,
                        gun_priv TEXT,
                        is_active INTEGER DEFAULT 1,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // 3. Migrate data - existing users keep role='admin' and unlimited quota (0)
                const oldAdmins = db.prepare("SELECT * FROM admin_old").all() as any[];
                const insertStmt = db.prepare("INSERT INTO admin (id, username, password_hash, created_at, updated_at, artist_id, role, storage_quota, storage_used, gun_pub, gun_priv, subsonic_token, subsonic_password, is_active) VALUES (?, ?, ?, ?, ?, ?, 'admin', 0, 0, ?, ?, ?, ?, ?)");

                for (const old of oldAdmins) {
                    let username = old.username;
                    if (!hasUsername && old.id === 1) username = 'admin';
                    insertStmt.run(
                        old.id, 
                        username, 
                        old.password_hash, 
                        old.created_at, 
                        old.updated_at, 
                        old.artist_id || null, 
                        old.gun_pub || null, 
                        old.gun_priv || null,
                        old.subsonic_token || null,
                        old.subsonic_password || null,
                        old.is_active !== undefined ? old.is_active : 1
                    );
                }

                // 4. Drop old table
                db.exec("DROP TABLE admin_old");
            } else {
                // Migration: Existing users with 10MB quota (likely early test users) get upgraded to 1GB
                const TEN_MB = 10 * 1024 * 1024;
                const ONE_GB = 1024 * 1024 * 1024;
                db.prepare("UPDATE admin SET storage_quota = ? WHERE storage_quota = ?").run(ONE_GB, TEN_MB);
            }
        }
    } catch (e) {
        console.error("Database migration error:", e);
    }

    return {
        async init(): Promise<void> {
            const user = db.prepare("SELECT id, password_hash, role FROM admin WHERE username = ?").get(adminUser) as { id: number; password_hash: string; role: UserRole } | undefined;
            
            if (!user) {
                console.log(`🔐 Admin user '${adminUser}' not found. Creating from configuration...`);
                await this.createAdmin(adminUser, adminPass);
            } else {
                // Ensure password matches the configuration (Source of Truth)
                const passwordMatches = await this.verifyPassword(adminPass, user.password_hash);
                if (!passwordMatches) {
                    console.log(`🔐 Updating password for admin user '${adminUser}' to match configuration...`);
                    await this.changePassword(adminUser, adminPass);
                }
                
                // Ensure role is admin
                if (user.role !== 'admin') {
                    console.log(`🔐 Updating role for user '${adminUser}' to 'admin'...`);
                    db.prepare("UPDATE admin SET role = 'admin' WHERE id = ?").run(user.id);
                }
            }

            const count = (db.prepare("SELECT COUNT(*) as count FROM admin").get() as any).count;
            if (count === 0) {
                console.log("🆕 First run detected: No users found in database.");
            }
        },

        async isDefaultPassword(username: string): Promise<boolean> {
            const user = db.prepare("SELECT password_hash FROM admin WHERE username = ?").get(username) as { password_hash: string } | undefined;
            if (!user) return false;
            return this.verifyPassword("tunecamp", user.password_hash);
        },

        async hashPassword(password: string): Promise<string> {
            return bcrypt.hash(password, SALT_ROUNDS);
        },

        async verifyPassword(password: string, hash: string): Promise<boolean> {
            return bcrypt.compare(password, hash);
        },

        generateToken(payload: TokenPayload): string {
            return jwt.sign(payload, jwtSecret, { expiresIn: JWT_EXPIRES_IN });
        },

        async verifyToken(token: string): Promise<TokenPayload | null> {
            try {
                const decoded = jwt.verify(token, jwtSecret) as TokenPayload;
                const role = (decoded.role as UserRole) || UserRole.NORMAL_USER;
                const isRoot = decoded.isRootAdmin ?? (role === UserRole.ROOT_ADMIN || decoded.userId === 1);
                
                // SECURITY CHECK: Verify token version against database
                const user = db.prepare("SELECT token_version, is_active FROM admin WHERE id = ?").get(decoded.userId) as { token_version: number; is_active: number } | undefined;
                
                if (!user || user.is_active === 0 || user.token_version !== decoded.tokenVersion) {
                    console.warn(`🚨 [AUTH] Token verification failed: User inactive or token revoked (User: ${decoded.username})`);
                    return null;
                }

                return {
                    isAdmin: decoded.isAdmin ?? (role === UserRole.ADMIN || role === UserRole.SUPER_USER || role === UserRole.ROOT_ADMIN || isRoot),
                    username: decoded.username,
                    artistId: decoded.artistId ?? null,
                    role: role,
                    isActive: user.is_active === 1, 
                    userId: decoded.userId || 0,
                    tokenVersion: user.token_version,
                    isRootAdmin: isRoot
                };
            } catch {
                return null;
            }
        },

        revokeTokens(userId: number): void {
            db.prepare("UPDATE admin SET token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(userId);
            console.log(`🛡️ [AUTH] Revoked all tokens for user ID: ${userId}`);
        },

        async authenticateUser(username: string, password: string, pubKey?: string, proof?: string): Promise<{ success: boolean; artistId: number | null; isAdmin: boolean; id: number; role: UserRole; isActive: boolean; tokenVersion: number; pair?: any } | false> {
            console.log(`[AUTH] Attempting login for user: ${username} (hasPubKey: ${!!pubKey}, hasProof: ${!!proof}, hasPassword: ${!!password})`);
            let user = db.prepare("SELECT id, password_hash, artist_id, role, gun_pub, gun_priv, is_active, token_version FROM admin WHERE username = ?").get(username) as { id: number; password_hash: string; artist_id: number | null; role: UserRole; gun_pub: string | null; gun_priv: string | null; is_active: number; token_version: number } | undefined;
            
            let gunVerified = false;

            // 1. Verify ZEN identity if provided
            if (pubKey && proof) {
                console.log(`🔐 [AUTH] Verifying ZEN proof for ${username}...`);
                const isValid = await this.verifyZenSignature(username, pubKey, proof);
                if (isValid) {
                    console.log(`✨ [AUTH] ZEN proof verified for ${username} (pub: ${pubKey.slice(0, 8)}...)`);
                    
                    // If user doesn't exist locally, lazy-create (Roaming)
                    if (!user) {
                        console.log(`📡 [AUTH] Roaming: Lazily creating local account for ZEN user ${username}`);
                        const tempPass = crypto.randomBytes(32).toString('hex');
                        const { id } = await this.createUser(username, tempPass, null as any); // artist creation below
                        
                        // Link the pubKey
                        db.prepare("UPDATE admin SET gun_pub = ? WHERE id = ?").run(pubKey, id);
                        
                        // Reload user record
                        user = db.prepare("SELECT id, password_hash, artist_id, role, gun_pub, gun_priv, is_active FROM admin WHERE id = ?").get(id) as any;
                    } else if (!user.gun_pub) {
                        // User exists but has no ZEN link yet - link it now
                        console.log(`🔗 [AUTH] Linking existing local user ${username} to ZEN identity`);
                        db.prepare("UPDATE admin SET gun_pub = ? WHERE id = ?").run(pubKey, user.id);
                        user.gun_pub = pubKey;
                    }

                    // Only allow proof to bypass password if it matches the linked pubKey (if any)
                    if (user && (!user.gun_pub || user.gun_pub === pubKey)) {
                        console.log(`✅ [AUTH] ZEN verified and pubKey matches for ${username}`);
                        gunVerified = true;
                    } else {
                        console.warn(`⚠️ [AUTH] ZEN pubKey mismatch for ${username}. Database: ${user?.gun_pub?.slice(0, 8)}, Provided: ${pubKey.slice(0, 8)}`);
                    }
                } else {
                    console.warn(`❌ [AUTH] ZEN signature invalid for ${username}`);
                }
            }

            if (!user) {
                console.log(`❌ [AUTH] User not found and no valid roaming proof for: ${username}`);
                return false;
            }

            // 2. Verification check: Either ZEN proof was verified OR local password must match
            if (!gunVerified) {
                console.log(`🔍 [AUTH] ZEN verification failed or skipped for ${username}, checking password...`);
                if (!password) {
                    console.log(`❌ [AUTH] No password provided and ZEN verification failed for: ${username}`);
                    return false;
                }
                const valid = await this.verifyPassword(password, user.password_hash);
                if (!valid) {
                    console.log(`❌ [AUTH] Password mismatch for ${username}`);
                    return false;
                }
                console.log(`✅ [AUTH] Password verified for ${username}`);

                // Check if the linked ZEN identity is LEGACY (P-256)
                if (user.gun_pub && user.gun_priv) {
                    try {
                        const existingPair = this.decryptZenPriv(user.gun_priv);
                        if (existingPair.curve !== 'secp256k1' || existingPair.pub.length < 80) {
                            console.warn(`🚨 [AUTH] User ${username} has a LEGACY (SEA/P-256) identity. Flagging for regeneration.`);
                            user.gun_priv = null; // Force regeneration
                            user.gun_pub = null;
                        }
                    } catch (e) {
                        user.gun_priv = null; 
                    }
                }
            } else {
                console.log(`✅ [AUTH] ZEN verification succeeded for ${username}, skipping password check`);
            }

            let userRole: UserRole = user.role ? (user.role as UserRole) : UserRole.ADMIN;
            if (user.id === 1) userRole = UserRole.ROOT_ADMIN;

            // Handle ZEN Key Management for all users
            let gunPair: any = undefined;
            if (user.gun_pub && user.gun_priv) {
                try {
                    gunPair = this.decryptZenPriv(user.gun_priv);
                } catch (e) {
                    console.error(`⚠️ Failed to decrypt ZEN keys for ${username}. This likely means the server's encryption secret changed.`);
                    console.log(`🔄 Attempting auto-recovery for ${username}...`);
                }
            }

            // Root admin synchronization with system identity
            if (user.id === 1) {
                try {
                    const systemPairRow = db.prepare("SELECT value FROM settings WHERE key = 'gunPair'").get() as { value: string } | undefined;
                    if (systemPairRow) {
                        const systemPair = JSON.parse(systemPairRow.value); // Fetch identity from settings
                        if (systemPair && systemPair.pub && (!gunPair || gunPair.pub !== systemPair.pub)) {
                            console.log(`🔗 Syncing Root Admin ${username} with instance ZEN Identity...`);
                            gunPair = systemPair;
                            const encryptedPriv = this.encryptZenPriv(gunPair);
                            db.prepare("UPDATE admin SET gun_pub = ?, gun_priv = ? WHERE id = ?").run(gunPair.pub, encryptedPriv, user.id);
                        }
                    }
                } catch (e) {
                    console.error("❌ Failed to sync root admin with system ZEN pair:", e);
                }
            }

            const isDefault = await this.isDefaultPassword(username);
            
            if (!gunPair && (user.id === 1 || !isDefault)) {
                // Lazy-generate or RE-generate ZEN identity (secp256k1)
                console.log(`🔐 Generating new ZEN Identity for ${userRole} ${username}...`);
                gunPair = await (Zen as any).pair();
                const encryptedPriv = this.encryptZenPriv(gunPair);
                db.prepare("UPDATE admin SET gun_pub = ?, gun_priv = ? WHERE id = ?").run(gunPair.pub, encryptedPriv, user.id);
            }

            // Also store encrypted cleartext password for Subsonic token+salt auth
            if (password) {
                const encryptedPass = encryptZenPrivHelper(password, jwtSecret);
                try {
                    db.prepare("UPDATE admin SET subsonic_password = ? WHERE id = ?").run(encryptedPass, user.id);
                } catch (e) {
                    // Column might not exist yet
                }
            }

            let artistId = user.artist_id;

            // Handle Artist Profile (Actor) Management - Only link if already exists or manually set
            if (!artistId) {
                console.log(`🔍 Checking for existing artist profile for ${userRole} ${username}...`);
                
                // Check if an artist with the same name exists (e.g. created manually by admin before user registered)
                const existingArtist = db.prepare("SELECT id FROM artists WHERE name = ? COLLATE NOCASE").get(username) as { id: number } | undefined;
                
                if (existingArtist) {
                    console.log(`🔗 Found existing artist profile for ${username}, linking it...`);
                    artistId = existingArtist.id;
                    db.prepare("UPDATE admin SET artist_id = ? WHERE id = ?").run(artistId, user.id);
                } else {
                    console.log(`👤 User ${username} is a standard listener (no artist profile).`);
                }
            }

            return {
                success: true,
                id: user.id,
                isAdmin: userRole === UserRole.ADMIN || userRole === UserRole.SUPER_USER || userRole === UserRole.ROOT_ADMIN,
                artistId: artistId,
                role: userRole,
                isActive: user.is_active === 1,
                tokenVersion: user.token_version,
                pair: gunPair
            };
        },

        async verifySubsonicToken(username: string, token: string, salt: string): Promise<boolean> {
            const user = db.prepare("SELECT subsonic_password FROM admin WHERE username = ?").get(username) as { subsonic_password: string } | undefined;
            if (!user || !token) return false;

            // Method 1: Use stored encrypted password (preferred, standard Subsonic auth)
            // Standard: token = md5(password + salt)
            if (user.subsonic_password) {
                try {
                    const clearPassword = decryptZenPrivHelper(user.subsonic_password, jwtSecret);
                    const expectedToken = crypto.createHash('md5').update(clearPassword + salt).digest('hex');
                    if (token.length === expectedToken.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken))) return true;
                } catch (e) {
                    // Decryption failed or lengths differ
                }
            }

            return false;
        },

        async verifyZenSignature(message: any, pubKey: string, proof: any): Promise<boolean> {
            try {
                if (!proof || !pubKey) return false;

                // Ensure proof is in the right format.
                let parsedProof = proof;
                if (typeof proof === 'string' && proof.trim().startsWith('{')) {
                    try {
                        parsedProof = JSON.parse(proof);
                    } catch (e) {}
                }

                // Diagnostic logs
                console.log(`[DEBUG] verifyZenSignature - Expected Message: "${message}"`);
                console.log(`[DEBUG] verifyZenSignature - PubKey: "${pubKey}"`);
                
                // Use ZEN verify (secp256k1)
                const verified = await (Zen as any).verify(parsedProof, pubKey);
                const isValid = !!verified;
                
                if (!isValid) {
                    console.warn(`❌ ZEN signature verification failed for ${message}.`);
                } else {
                    console.log(`✅ ZEN signature verified for ${message}`);
                }
                
                return isValid;
            } catch (e) {
                console.error("❌ Zen signature verification error:", e);
                return false;
            }
        },

        async createAdmin(username: string, password: string, artistId: number | null = null, role: UserRole = UserRole.ADMIN): Promise<{ id: number }> {
            const hash = await this.hashPassword(password);
            const result = db.prepare("INSERT INTO admin (username, password_hash, artist_id, role, storage_quota, is_active) VALUES (?, ?, ?, ?, 0, 1)").run(username, hash, artistId, role);
            return { id: Number(result.lastInsertRowid) };
        },

        async createUser(username: string, password: string, artistId: number | null, storageQuota: number = 1024 * 1024 * 1024, pubKey?: string, role: UserRole = UserRole.NORMAL_USER): Promise<{ id: number }> {
            const hash = await this.hashPassword(password);
            const result = db.prepare("INSERT INTO admin (username, password_hash, artist_id, role, storage_quota, storage_used, gun_pub, is_active) VALUES (?, ?, ?, ?, ?, 0, ?, 1)").run(username, hash, artistId, role, storageQuota, pubKey || null);
            return { id: Number(result.lastInsertRowid) };
        },

        updateAdmin(id: number, artistId: number | null, role?: UserRole): void {
            if (role) {
                if (id === 1 && role !== 'admin') {
                    throw new Error("Cannot demote the primary admin");
                }
                db.prepare("UPDATE admin SET artist_id = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(artistId, role, id);
            } else {
                db.prepare("UPDATE admin SET artist_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(artistId, id);
            }
        },

        updateStorageUsed(userId: number, bytesUsed: number): void {
            db.prepare("UPDATE admin SET storage_used = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(bytesUsed, userId);
        },

        getStorageInfo(userId: number): { storage_quota: number; storage_used: number } | null {
            return db.prepare("SELECT storage_quota, storage_used FROM admin WHERE id = ?").get(userId) as { storage_quota: number; storage_used: number } | null;
        },

        getAdminById(id: number): { id: number; username: string; artist_id: number | null; artist_name: string | null; role: UserRole; storage_quota: number; is_active: number; created_at: string; is_root: boolean } | undefined {
            const row = db.prepare(`
                SELECT a.id, a.username, a.artist_id, a.role, a.storage_quota, a.is_active, a.created_at, ar.name as artist_name
                FROM admin a
                LEFT JOIN artists ar ON a.artist_id = ar.id
                WHERE a.id = ?
            `).get(id) as any;

            if (!row) {
                return undefined;
            }

            return {
                ...row,
                role: row.role || 'admin',
                is_root: row.id === 1
            };
        },

        getUserByUsername(username: string): { id: number; username: string; artist_id: number | null; artist_name: string | null; role: UserRole; storage_quota: number; is_active: number; created_at: string; is_root: boolean } | undefined {
            const row = db.prepare(`
                SELECT a.id, a.username, a.artist_id, a.role, a.storage_quota, a.is_active, a.created_at, ar.name as artist_name
                FROM admin a
                LEFT JOIN artists ar ON a.artist_id = ar.id
                WHERE a.username = ?
            `).get(username) as any;

            if (!row) {
                return undefined;
            }

            return {
                ...row,
                role: row.role || 'admin',
                is_root: row.id === 1
            };
        },

        listAdmins(): { id: number; username: string; artist_id: number | null; artist_name: string | null; role: UserRole; storage_quota: number; is_active: number; created_at: string; is_root: boolean }[] {
            const rows = db.prepare(`
                SELECT a.id, a.username, a.artist_id, a.role, a.storage_quota, a.is_active, a.created_at, ar.name as artist_name 
                FROM admin a
                LEFT JOIN artists ar ON a.artist_id = ar.id
                ORDER BY a.username
            `).all() as any[];

            return rows.map(r => ({
                ...r,
                role: r.role || 'admin',
                is_root: r.id === 1
            }));
        },

        deleteAdmin(id: number): void {
            // Prevent deleting the root admin (id=1)
            if (id === 1) {
                throw new Error("Cannot delete the primary admin");
            }
            // Prevent deleting the last admin
            const adminCount = (db.prepare("SELECT COUNT(*) as count FROM admin WHERE role = 'admin'").get() as any).count;
            const user = db.prepare("SELECT role FROM admin WHERE id = ?").get(id) as { role: string } | undefined;
            if (user?.role === 'admin' && adminCount <= 1) {
                throw new Error("Cannot delete the last admin user");
            }
            db.prepare("DELETE FROM admin WHERE id = ?").run(id);
        },

        toggleUserStatus(id: number, active: boolean): void {
            // Cannot disable root admin
            if (id === 1 && !active) {
                throw new Error("Cannot disable the primary admin");
            }
            db.prepare("UPDATE admin SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(active ? 1 : 0, id);
        },

        async changePassword(username: string, newPassword: string): Promise<void> {
            const hash = await this.hashPassword(newPassword);
            db.prepare("UPDATE admin SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?").run(hash, username);

            // Generate ZEN identity if missing (First Login / Password Change flow)
            const user = db.prepare("SELECT id, gun_pub FROM admin WHERE username = ?").get(username) as { id: number, gun_pub: string | null } | undefined;
            if (user && !user.gun_pub) {
                console.log(`🔐 [AUTH] Generating new ZEN Identity for ${username} during password change...`);
                const gunPair = await (Zen as any).pair();
                this.updateZenPair(username, gunPair);
            }
        },

        isFirstRun(): boolean {
            const count = (db.prepare("SELECT COUNT(*) as count FROM admin").get() as any).count;
            return count === 0;
        },

        isRootAdmin(username: string): boolean {
            const row = db.prepare("SELECT id FROM admin WHERE username = ?").get(username) as { id: number } | undefined;
            return row?.id === 1;
        },

        getUserPair(username: string): any | null {
            const user = db.prepare("SELECT gun_priv FROM admin WHERE username = ?").get(username) as { gun_priv: string | null } | undefined;
            if (!user || !user.gun_priv) return null;
            try {
                return this.decryptZenPriv(user.gun_priv);
            } catch (e) {
                console.error(`⚠️ Failed to decrypt ZEN keys for ${username}. (Secret mismatch?)`);
                return null;
            }
        },

        updateZenPair(username: string, pair: any): void {
            const encryptedPriv = this.encryptZenPriv(pair);
            db.prepare("UPDATE admin SET gun_pub = ?, gun_priv = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?").run(pair.pub, encryptedPriv, username);
            
            // Also ensure it's in gun_users for profile lookups
            db.prepare(`INSERT OR IGNORE INTO gun_users (pub, epub, alias) VALUES (?, ?, ?)`).run(pair.pub, pair.epub, username);
        },

        // Mastodon
        async registerMastodonApp(instanceUrl: string, redirectUri: string): Promise<{ clientId: string; clientSecret: string; redirectUri: string }> {
            // Cleanup URL
            const url = new URL(instanceUrl.startsWith("http") ? instanceUrl : `https://${instanceUrl}`);
            const baseUrl = url.origin;

            // Validate SSRF
            if (!(await isSafeUrl(baseUrl))) {
                throw new Error("Invalid or unsafe instance URL");
            }

            // 1. Check DB for existing client
            const existing = db.prepare("SELECT * FROM oauth_clients WHERE instance_url = ?").get(baseUrl) as { client_id: string; client_secret: string; redirect_uri: string } | undefined;

            if (existing) {
                return {
                    clientId: existing.client_id,
                    clientSecret: existing.client_secret,
                    redirectUri: existing.redirect_uri
                };
            }

            // 2. Register if not found
            const response = await fetch(`${baseUrl}/api/v1/apps`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    client_name: "TuneCamp",
                    redirect_uris: redirectUri,
                    scopes: "read",
                    website: "https://github.com/scobru/tunecamp"
                })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Failed to register app on ${baseUrl}: ${text}`);
            }

            const data = await response.json() as any;

            // 3. Save to DB
            db.prepare("INSERT INTO oauth_clients (instance_url, client_id, client_secret, redirect_uri) VALUES (?, ?, ?, ?)").run(baseUrl, data.client_id, data.client_secret, redirectUri);

            return {
                clientId: data.client_id,
                clientSecret: data.client_secret,
                redirectUri: redirectUri
            };
        },

        getMastodonAuthUrl(instanceUrl: string, clientId: string, redirectUri: string): string {
            const url = new URL(instanceUrl.startsWith("http") ? instanceUrl : `https://${instanceUrl}`);
            return `${url.origin}/oauth/authorize?client_id=${clientId}&scope=read&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
        },

        async exchangeMastodonCode(instanceUrl: string, clientId: string, clientSecret: string, redirectUri: string, code: string): Promise<{ accessToken: string; user: { acct: string; display_name: string; url: string } }> {
            const url = new URL(instanceUrl.startsWith("http") ? instanceUrl : `https://${instanceUrl}`);

            // Validate SSRF
            if (!(await isSafeUrl(url.origin))) {
                throw new Error("Invalid or unsafe instance URL");
            }

            // 1. Get Token
            const tokenResp = await fetch(`${url.origin}/oauth/token`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    client_id: clientId,
                    client_secret: clientSecret,
                    redirect_uri: redirectUri,
                    grant_type: "authorization_code",
                    code: code
                })
            });

            if (!tokenResp.ok) {
                throw new Error(`Failed to exchange code: ${await tokenResp.text()}`);
            }

            const tokenData = await tokenResp.json() as any;
            const accessToken = tokenData.access_token;

            // 2. Verify Credentials (get user profile)
            const verifyResp = await fetch(`${url.origin}/api/v1/accounts/verify_credentials`, {
                headers: { "Authorization": `Bearer ${accessToken}` }
            });

            if (!verifyResp.ok) {
                throw new Error(`Failed to verify credentials: ${await verifyResp.text()}`);
            }

            const userData = await verifyResp.json() as any;

            // Normalize acct (some instances don't include domain for local users)
            let acct = userData.acct;
            if (!acct.includes("@")) {
                acct = `${acct}@${url.hostname}`;
            }

            return {
                accessToken,
                user: {
                    acct,
                    display_name: userData.display_name,
                    url: userData.url
                }
            };
        },

        async loginWithMastodon(instanceUrl: string, redirectUri: string, code: string): Promise<{ pair: any; alias: string }> {
            // 1. Get Client
            const client = await this.registerMastodonApp(instanceUrl, redirectUri);

            // 2. Exchange Code
            const { accessToken, user } = await this.exchangeMastodonCode(instanceUrl, client.clientId, client.clientSecret, redirectUri, code);

            const subject = user.acct;
            const provider = AuthProvider.MASTODON;

            // 3. Check for existing link
            const link = db.prepare("SELECT * FROM oauth_links WHERE provider = ? AND subject = ?").get(provider, subject) as { gun_pub: string; gun_priv: string } | undefined;

            if (link) {
                // Decrypt and return
                const pair = this.decryptZenPriv(link.gun_priv);
                console.log(`🔓 Mastodon Login: Found existing user ${subject} -> ${pair.pub.slice(0, 8)}...`);
                return { pair, alias: user.display_name || user.acct };
            }

            // 4. Create new library identity (ZEN / secp256k1)
            console.log(`🆕 Mastodon Login: Creating NEW ZEN identity for ${subject}`);
            const pair = await (Zen as any).pair();
            const encryptedPriv = this.encryptZenPriv(pair);

            db.prepare("INSERT INTO oauth_links (provider, subject, gun_pub, gun_priv) VALUES (?, ?, ?, ?)").run(provider, subject, pair.pub, encryptedPriv);

            // Register in gun_users table
            db.prepare(`INSERT OR IGNORE INTO gun_users (pub, epub, alias) VALUES (?, ?, ?)`).run(pair.pub, pair.epub, user.display_name || user.acct);

            return { pair, alias: user.display_name || user.acct };
        },


        // Encryption helpers
        encryptZenPriv(priv: any): string {
            return encryptZenPrivHelper(priv, jwtSecret);
        },

        decryptZenPriv(encrypted: string): any {
            return decryptZenPrivHelper(encrypted, jwtSecret);
        },

        async deriveZenWallet(pair: any, id?: string): Promise<string> {
            if (!pair || !pair.priv) {
                throw new Error("Valid ZEN pair with 'priv' key is required.");
            }
            // Logic ported from gun/lib/wallet.js but adapted for ZEN
            const text = String(pair.priv) + (id || '');
            const hashHex = crypto.createHash('sha256').update(text).digest('hex');
            return "0x" + hashHex;
        }
    };
}

/**
 * Encrypts a private key using AES-256-GCM (Authenticated Encryption)
 */
export function encryptZenPrivHelper(priv: any, secret: string): string {
    const json = JSON.stringify(priv);
    // GCM standard IV is 12 bytes
    const iv = crypto.randomBytes(12);
    // Derive a 32-byte key from secret
    const key = crypto.createHash('sha256').update(secret).digest();
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(json, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag();
    // Format: IV:Data:AuthTag
    return `${iv.toString("hex")}:${encrypted}:${authTag.toString("hex")}`;
}

/**
 * Decrypts a private key using AES-256-GCM (or AES-256-CBC for legacy data)
 */
export function decryptZenPrivHelper(encrypted: string, secret: string): any {
    const parts = encrypted.split(":");
    const key = crypto.createHash('sha256').update(secret).digest();

    if (parts.length === 3) {
        // GCM (New Format)
        const [ivHex, dataHex, authTagHex] = parts;
        const iv = Buffer.from(ivHex, "hex");
        const authTag = Buffer.from(authTagHex, "hex");
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(dataHex, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return JSON.parse(decrypted);
    } else {
        // CBC (Legacy Format) - no auth tag
        const [ivHex, dataHex] = parts;
        const iv = Buffer.from(ivHex, "hex");
        const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
        let decrypted = decipher.update(dataHex, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return JSON.parse(decrypted);
    }
}
