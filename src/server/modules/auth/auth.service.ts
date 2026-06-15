import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Database } from "better-sqlite3";
import fetch from "node-fetch";
import crypto from "crypto";
import { isSafeUrl } from "../../../utils/networkUtils.js";
import { UserRole, VisibilityGuardian } from "../../common/visibility.js";

// Polyfill WebCrypto for Gun.SEA in Node.js ESM
if (typeof global !== 'undefined' && !global.crypto) {
    // Fallback to standard Node crypto if available (Node 18+)
    // @ts-ignore
    global.crypto = crypto.webcrypto || crypto;
    console.log("🔐 [AUTH] WebCrypto linked to standard Node crypto");
}

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = "7d";


enum AuthProvider {
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
    authenticateUser(username: string, password: string): Promise<{ success: boolean; artistId: number | null; isAdmin: boolean; id: number; role: UserRole; isActive: boolean; tokenVersion: number } | false>;
    verifySubsonicToken(username: string, token: string, salt: string): Promise<boolean>;
    createAdmin(username: string, password: string, artistId?: number | null, role?: UserRole): Promise<{ id: number }>;
    createUser(username: string, password: string, artistId: number | null, storageQuota?: number, pubKey?: string, role?: UserRole): Promise<{ id: number }>;
    updateAdmin(id: number, artistId: number | null, role?: UserRole, storageQuota?: number): void;
    updateStorageUsed(userId: number, bytesUsed: number): void;
    getStorageInfo(userId: number): { storage_quota: number; storage_used: number } | null;
    getAdminById(id: number): { id: number; username: string; artist_id: number | null; artist_name: string | null; role: UserRole; storage_quota: number; is_active: number; created_at: string; is_root: boolean } | undefined;
    getUserByUsername(username: string): { id: number; username: string; artist_id: number | null; artist_name: string | null; role: UserRole; storage_quota: number; is_active: number; created_at: string; is_root: boolean } | undefined;
    listAdmins(): { id: number; username: string; artist_id: number | null; role: UserRole; storage_quota: number; is_active: number; created_at: string }[];
    deleteAdmin(id: number): void;
    deleteUsersBatch(ids: number[]): void;
    toggleUserStatus(id: number, active: boolean): void;
    /** Marks (or clears) a listener's pending request for an artist profile. */
    setArtistRequest(userId: number, requested: boolean): void;
    /** Returns the timestamp of the user's pending artist request, or null. */
    getArtistRequest(userId: number): string | null;
    changePassword(username: string, newPassword: string): Promise<void>;
    isFirstRun(): boolean;
    /** Returns true if the username belongs to the root admin (id=1, first created). */
    isRootAdmin(username: string): boolean;
    /** Returns the Zen pair for a user if they have one. */
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
    /** Returns the avatar stored in gun_users for this username, or null. */
    getZenAvatar(username: string): string | null;
    /** Returns alias and avatar from the admin table. */
    getUserProfile(username: string): { alias: string | null; avatar: string | null } | null;
    /** Updates alias and/or avatar in the admin table. */
    updateUserProfile(username: string, data: { alias?: string; avatar?: string }): void;
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
                    artist_unlinked INTEGER DEFAULT 0,
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

            const hasArtistUnlinked = columns.some(c => c.name === 'artist_unlinked');
            if (!hasArtistUnlinked) {
                console.log("📦 Migrating admin table: Adding artist_unlinked column...");
                try {
                    db.exec("ALTER TABLE admin ADD COLUMN artist_unlinked INTEGER DEFAULT 0");
                } catch (e) {
                    console.error("Failed to add artist_unlinked column:", e);
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
                        artist_unlinked INTEGER DEFAULT 0,
                        role TEXT NOT NULL DEFAULT 'admin',
                        storage_quota INTEGER NOT NULL DEFAULT 0,
                        storage_used INTEGER NOT NULL DEFAULT 0,
                        subsonic_token TEXT,
                        subsonic_password TEXT,
                        gun_pub TEXT,
                        gun_priv TEXT,
                        is_active INTEGER DEFAULT 1,
                        token_version INTEGER DEFAULT 0,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // 3. Migrate data - existing users keep role='admin' and unlimited quota (0)
                const oldAdmins = db.prepare("SELECT * FROM admin_old").all() as any[];
                const insertStmt = db.prepare("INSERT INTO admin (id, username, password_hash, created_at, updated_at, artist_id, role, storage_quota, storage_used, gun_pub, gun_priv, subsonic_token, subsonic_password, is_active, token_version) VALUES (?, ?, ?, ?, ?, ?, 'admin', 0, 0, ?, ?, ?, ?, ?, ?)");

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
                        old.is_active !== undefined ? old.is_active : 1,
                        old.token_version || 0
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
                await this.createAdmin(adminUser, adminPass, null, UserRole.ROOT_ADMIN);
            } else {
                // We no longer overwrite the password from configuration if it exists.
                // This allows users to change their password via the UI without it being reset on restart.
                // Only enforce the role if it's the configured primary admin.
                if (user.role !== 'admin' && user.role !== 'root_admin') {
                    console.log(`🔐 Updating role for primary admin '${adminUser}' to 'admin'...`);
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
                if (token.startsWith("tc_")) {
                    const apiTokenRow = db.prepare("SELECT user_id FROM api_tokens WHERE token = ?").get(token) as { user_id: number } | undefined;
                    if (!apiTokenRow) {
                        return null;
                    }
                    const user = db.prepare("SELECT * FROM admin WHERE id = ?").get(apiTokenRow.user_id) as any;
                    if (!user || user.is_active === 0) {
                        return null;
                    }
                    const role = (user.role as UserRole) || UserRole.NORMAL_USER;
                    const isRoot = role === UserRole.ROOT_ADMIN || user.id === 1;

                    return {
                        isAdmin: role === UserRole.ADMIN || role === UserRole.SUPER_USER || role === UserRole.ROOT_ADMIN || isRoot,
                        username: user.username,
                        artistId: user.artist_id ?? null,
                        role: role,
                        isActive: user.is_active === 1,
                        userId: user.id,
                        tokenVersion: user.token_version,
                        isRootAdmin: isRoot
                    };
                }

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

        async authenticateUser(username: string, password: string): Promise<{ success: boolean; artistId: number | null; isAdmin: boolean; id: number; role: UserRole; isActive: boolean; tokenVersion: number } | false> {
            console.log(`[AUTH] Attempting login for user: '${username}'`);
            let user = db.prepare("SELECT id, username, password_hash, artist_id, artist_unlinked, role, is_active, token_version FROM admin WHERE username = ?").get(username) as { id: number; username: string; password_hash: string; artist_id: number | null; artist_unlinked?: number; role: UserRole; is_active: number; token_version: number } | undefined;

            if (!user) {
                // Try case-insensitive fallback
                user = db.prepare("SELECT id, username, password_hash, artist_id, artist_unlinked, role, is_active, token_version FROM admin WHERE username = ? COLLATE NOCASE").get(username) as any;
                if (user) console.log(`[AUTH] Found user '${user.username}' via case-insensitive lookup for '${username}'`);
            }

            if (!user) {
                console.log(`❌ [AUTH] User not found: '${username}'`);
                return false;
            }

            if (!password) {
                console.log(`❌ [AUTH] No password provided for: ${username}`);
                return false;
            }
            const valid = await this.verifyPassword(password, user.password_hash);
            if (!valid) {
                console.log(`❌ [AUTH] Password mismatch for ${username}`);
                return false;
            }
            console.log(`✅ [AUTH] Password verified for ${username}`);

            // Also store encrypted cleartext password for Subsonic token+salt auth
            const encryptedPass = encryptZenPrivHelper(password, jwtSecret);
            try {
                db.prepare("UPDATE admin SET subsonic_password = ? WHERE id = ?").run(encryptedPass, user.id);
            } catch (e) {
                // Column might not exist yet
            }

            let userRole: UserRole = user.role ? (user.role as UserRole) : UserRole.ADMIN;
            if (user.id === 1) userRole = UserRole.ROOT_ADMIN;

            let artistId = user.artist_id;

            // Handle Artist Profile (Actor) Management.
            // Reserved to curators and admins: listeners must never be auto-linked
            // to an artist that happens to share their username — they become
            // artists only through the request + approval flow (which promotes them).
            if (!artistId && !user?.artist_unlinked && (userRole === UserRole.SUPER_USER || userRole === UserRole.ROOT_ADMIN || userRole === UserRole.ADMIN)) {
                console.log(`🔍 Checking for existing artist profile for ${userRole} ${username}...`);

                // Check if an artist with the same name exists
                let existingArtist = db.prepare("SELECT id FROM artists WHERE name = ? COLLATE NOCASE").get(username) as { id: number } | undefined;

                if (!existingArtist) {
                    console.log(`🎨 Auto-creating artist profile for ${userRole}: ${username}`);
                    
                    const slug = username.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "artist";
                    let finalSlug = slug;
                    let attempt = 0;
                    
                    while (attempt < 100) {
                        try {
                            const result = db.prepare("INSERT INTO artists (name, slug, visibility) VALUES (?, ?, 'public')").run(username, finalSlug);
                            existingArtist = { id: Number(result.lastInsertRowid) };
                            break;
                        } catch (e: any) {
                            if (e.message && e.message.includes('UNIQUE constraint failed: artists.slug')) {
                                attempt++;
                                finalSlug = `${slug}-${attempt}`;
                                continue;
                            }
                            // If it's another error (like name collision), we let it fail or handle it
                            console.error(`❌ Failed to auto-create artist profile: ${e.message}`);
                            break;
                        }
                    }
                }


                if (existingArtist) {
                    console.log(`🔗 Linking artist profile for ${username}, id: ${existingArtist.id}`);
                    artistId = existingArtist.id;
                    db.prepare("UPDATE admin SET artist_id = ? WHERE id = ?").run(artistId, user.id);
                }
            }

            return {
                success: true,
                id: user.id,
                isAdmin: VisibilityGuardian.isAdminRole(userRole),
                artistId: artistId,
                role: userRole,
                isActive: user.is_active === 1,
                tokenVersion: user.token_version,
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

        updateAdmin(id: number, artistId: number | null, role?: UserRole, storageQuota?: number): void {
            const updates: string[] = ["artist_id = ?", "artist_unlinked = ?", "updated_at = CURRENT_TIMESTAMP"];
            const params: any[] = [artistId, artistId === null ? 1 : 0];
            
            if (role) {
                if (id === 1 && role !== 'admin' && role !== 'root_admin') {
                    throw new Error("Cannot demote the primary admin");
                }
                updates.push("role = ?");
                params.push(role);
            }
            
            if (storageQuota !== undefined) {
                updates.push("storage_quota = ?");
                params.push(storageQuota);
            }
            
            params.push(id);
            db.prepare(`UPDATE admin SET ${updates.join(", ")} WHERE id = ?`).run(...params);
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
                WHERE a.username = ? COLLATE NOCASE
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

        getZenAvatar(username: string): string | null {
            const row = db.prepare(`
                SELECT gu.avatar FROM admin a
                JOIN gun_users gu ON a.gun_pub = gu.pub
                WHERE a.username = ? COLLATE NOCASE
            `).get(username) as { avatar: string | null } | undefined;
            return row?.avatar ?? null;
        },

        getUserProfile(username: string): { alias: string | null; avatar: string | null } | null {
            const row = db.prepare("SELECT alias, avatar FROM admin WHERE username = ? COLLATE NOCASE").get(username) as { alias: string | null; avatar: string | null } | undefined;
            return row ?? null;
        },

        updateUserProfile(username: string, data: { alias?: string; avatar?: string }): void {
            const parts: string[] = [];
            const params: any[] = [];
            if (data.alias !== undefined) { parts.push("alias = ?"); params.push(data.alias); }
            if (data.avatar !== undefined) { parts.push("avatar = ?"); params.push(data.avatar); }
            if (parts.length === 0) return;
            params.push(username);
            db.prepare(`UPDATE admin SET ${parts.join(", ")} WHERE username = ? COLLATE NOCASE`).run(...params);
        },

        listAdmins(): { id: number; username: string; artist_id: number | null; artist_name: string | null; role: UserRole; storage_quota: number; is_active: number; created_at: string; is_root: boolean }[] {
            const rows = db.prepare(`
                SELECT a.id, a.username, a.artist_id, a.role, a.storage_quota, a.is_active, a.created_at, a.artist_requested_at, ar.name as artist_name
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

        setArtistRequest(userId: number, requested: boolean): void {
            if (requested) {
                db.prepare("UPDATE admin SET artist_requested_at = CURRENT_TIMESTAMP WHERE id = ?").run(userId);
            } else {
                db.prepare("UPDATE admin SET artist_requested_at = NULL WHERE id = ?").run(userId);
            }
        },

        getArtistRequest(userId: number): string | null {
            const row = db.prepare("SELECT artist_requested_at FROM admin WHERE id = ?").get(userId) as { artist_requested_at: string | null } | undefined;
            return row?.artist_requested_at ?? null;
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
            
            // Perform cleanups in a transaction to satisfy foreign key constraints
            db.transaction(() => {
                // 1. Re-assign tracks owned by this user to primary admin (id = 1)
                db.prepare("UPDATE tracks SET owner_id = 1 WHERE owner_id = ?").run(id);
                
                // 2. Re-assign albums owned by this user to primary admin (id = 1)
                db.prepare("UPDATE albums SET owner_id = 1 WHERE owner_id = ?").run(id);
                
                // 3. Clear explicit user ownerships
                db.prepare("DELETE FROM track_ownership WHERE owner_id = ?").run(id);
                db.prepare("DELETE FROM album_ownership WHERE owner_id = ?").run(id);
                
                // 4. Delete storage accounts (OAuth tokens)
                db.prepare("DELETE FROM storage_accounts WHERE user_id = ?").run(id);
                
                // 5. Delete soulseek downloads
                db.prepare("DELETE FROM soulseek_downloads WHERE user_id = ?").run(id);
                
                // 6. Reset torrent ownership
                db.prepare("UPDATE torrents SET owner_id = NULL WHERE owner_id = ?").run(id);
                
                // 7. Finally, delete the user
                db.prepare("DELETE FROM admin WHERE id = ?").run(id);
            })();
        },
        deleteUsersBatch(ids: number[]): void {
            db.transaction(() => {
                for (const id of ids) {
                    try {
                        this.deleteAdmin(id);
                    } catch (e) {
                        console.error(`Failed to delete user ${id}:`, e);
                        // Skip if it fails (e.g. root admin or last admin)
                    }
                }
            });
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
            db.prepare("UPDATE admin SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ? COLLATE NOCASE").run(hash, username);
        },

        isFirstRun(): boolean {
            const count = (db.prepare("SELECT COUNT(*) as count FROM admin").get() as any).count;
            return count === 0;
        },

        isRootAdmin(username: string): boolean {
            const row = db.prepare("SELECT id FROM admin WHERE username = ? COLLATE NOCASE").get(username) as { id: number } | undefined;
            return row?.id === 1;
        },

        getUserPair(username: string): any | null {
            const user = db.prepare("SELECT gun_priv FROM admin WHERE username = ? COLLATE NOCASE").get(username) as { gun_priv: string | null } | undefined;
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
            db.prepare("UPDATE admin SET gun_pub = ?, gun_priv = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ? COLLATE NOCASE").run(pair.pub, encryptedPriv, username);
            
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
            throw new Error("Mastodon login is not supported in Phase B");
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

