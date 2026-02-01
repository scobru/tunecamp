import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Database } from "better-sqlite3";

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = "7d";

export interface AuthService {
    hashPassword(password: string): Promise<string>;
    verifyPassword(password: string, hash: string): Promise<boolean>;
    generateToken(payload: { isAdmin: boolean; username: string; artistId: number | null }): string;
    verifyToken(token: string): { isAdmin: boolean; username: string; artistId: number | null } | null;
    // Multi-user management
    authenticateUser(username: string, password: string): Promise<{ success: boolean; artistId: number | null; isAdmin: boolean; id: number } | false>;
    createAdmin(username: string, password: string, artistId?: number | null): Promise<void>;
    updateAdmin(id: number, artistId: number | null): void;
    listAdmins(): { id: number; username: string; artist_id: number | null; created_at: string }[];
    deleteAdmin(id: number): void;
    changePassword(username: string, newPassword: string): Promise<void>;
    isFirstRun(): boolean;
    /** Returns true if the username belongs to the root admin (id=1, first created). */
    isRootAdmin(username: string): boolean;
}

export function createAuthService(
    db: Database,
    jwtSecret: string
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
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } else {
            // Check if username column exists (migration)
            const columns = db.prepare("PRAGMA table_info(admin)").all() as any[];
            const hasUsername = columns.some(c => c.name === 'username');
            const hasArtistId = columns.some(c => c.name === 'artist_id');

            if (!hasUsername || !hasArtistId) {
                console.log("📦 Migrating admin table to multi-user support (with artist linking)...");
                // We need to recreate the table
                // 1. Rename existing table
                db.exec("ALTER TABLE admin RENAME TO admin_old");

                // 2. Create new table
                db.exec(`
                    CREATE TABLE admin (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT NOT NULL UNIQUE,
                        password_hash TEXT NOT NULL,
                        artist_id INTEGER DEFAULT NULL,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // 3. Migrate data
                const oldAdmins = db.prepare("SELECT * FROM admin_old").all() as any[];
                const insertStmt = db.prepare("INSERT INTO admin (id, username, password_hash, created_at, updated_at, artist_id) VALUES (?, ?, ?, ?, ?, ?)");

                for (const old of oldAdmins) {
                    // If migrating from v1 (no username), default to 'admin' for id 1
                    let username = old.username;
                    if (!hasUsername && old.id === 1) username = 'admin';

                    // Preserve ID if possible, or let autoincrement handle it if conflicts (but usually we want to keep ID 1 as root)
                    insertStmt.run(old.id, username, old.password_hash, old.created_at, old.updated_at, old.artist_id || null);
                }

                // 4. Drop old table
                db.exec("DROP TABLE admin_old");
            }
        }
    } catch (e) {
        console.error("Database migration error:", e);
    }

    return {
        async hashPassword(password: string): Promise<string> {
            return bcrypt.hash(password, SALT_ROUNDS);
        },

        async verifyPassword(password: string, hash: string): Promise<boolean> {
            return bcrypt.compare(password, hash);
        },

        generateToken(payload: { isAdmin: boolean; username: string; artistId: number | null }): string {
            return jwt.sign(payload, jwtSecret, { expiresIn: JWT_EXPIRES_IN });
        },

        verifyToken(token: string): { isAdmin: boolean; username: string; artistId: number | null } | null {
            try {
                return jwt.verify(token, jwtSecret) as { isAdmin: boolean; username: string; artistId: number | null };
            } catch {
                return null;
            }
        },

        async authenticateUser(username: string, password: string): Promise<{ success: boolean; artistId: number | null; isAdmin: boolean; id: number } | false> {
            const user = db.prepare("SELECT id, password_hash, artist_id FROM admin WHERE username = ?").get(username) as { id: number; password_hash: string; artist_id: number | null } | undefined;
            if (!user) return false;
            const valid = await this.verifyPassword(password, user.password_hash);
            if (!valid) return false;

            return {
                success: true,
                id: user.id,
                isAdmin: true,
                artistId: user.artist_id
            };
        },

        async createAdmin(username: string, password: string, artistId: number | null = null): Promise<void> {
            const hash = await this.hashPassword(password);
            db.prepare("INSERT INTO admin (username, password_hash, artist_id) VALUES (?, ?, ?)").run(username, hash, artistId);
        },

        updateAdmin(id: number, artistId: number | null): void {
            db.prepare("UPDATE admin SET artist_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(artistId, id);
        },

        listAdmins(): { id: number; username: string; artist_id: number | null; artist_name: string | null; created_at: string; is_root: boolean }[] {
            const rows = db.prepare(`
                SELECT a.id, a.username, a.artist_id, a.created_at, ar.name as artist_name 
                FROM admin a
                LEFT JOIN artists ar ON a.artist_id = ar.id
                ORDER BY a.username
            `).all() as any[];

            return rows.map(r => ({
                ...r,
                is_root: r.id === 1
            }));
        },

        deleteAdmin(id: number): void {
            // Prevent deleting the root admin (id=1)
            if (id === 1) {
                throw new Error("Cannot delete the primary admin");
            }
            // Prevent deleting the last admin
            const count = (db.prepare("SELECT COUNT(*) as count FROM admin").get() as any).count;
            if (count <= 1) {
                throw new Error("Cannot delete the last admin user");
            }
            db.prepare("DELETE FROM admin WHERE id = ?").run(id);
        },

        async changePassword(username: string, newPassword: string): Promise<void> {
            const hash = await this.hashPassword(newPassword);
            db.prepare("UPDATE admin SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?").run(hash, username);
        },

        isFirstRun(): boolean {
            const count = (db.prepare("SELECT COUNT(*) as count FROM admin").get() as any).count;
            return count === 0;
        },

        isRootAdmin(username: string): boolean {
            const row = db.prepare("SELECT id FROM admin WHERE username = ?").get(username) as { id: number } | undefined;
            return row?.id === 1;
        },
    };
}
