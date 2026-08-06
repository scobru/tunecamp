import sqlite3 from 'better-sqlite3';
import crypto from 'crypto';
import { jest } from '@jest/globals';
import { createAuthService, encryptZenPrivHelper } from './auth.service.js';

describe('createAuthService', () => {
    let db: any;

    beforeEach(() => {
        db = new sqlite3(':memory:');
    });

    afterEach(() => {
        db.close();
    });

    test('should create admin table with correct schema if it does not exist', () => {
        createAuthService(db, 'secret');
        const columns = db.prepare("PRAGMA table_info(admin)").all();
        expect(columns.length).toBeGreaterThan(0);
        const columnNames = columns.map((c: any) => c.name);
        expect(columnNames).toContain('id');
        expect(columnNames).toContain('username');
        expect(columnNames).toContain('password_hash');
        expect(columnNames).toContain('artist_id');
        expect(columnNames).toContain('artist_unlinked');
        expect(columnNames).toContain('role');
        expect(columnNames).toContain('storage_quota');
        expect(columnNames).toContain('storage_used');
        expect(columnNames).toContain('subsonic_token');
        expect(columnNames).toContain('subsonic_password');
        expect(columnNames).toContain('zen_pub');
        expect(columnNames).toContain('zen_priv');
        expect(columnNames).toContain('zen_auth_mode');
        expect(columnNames).toContain('is_active');
        expect(columnNames).toContain('token_version');
        expect(columnNames).toContain('created_at');
        expect(columnNames).toContain('updated_at');
    });

    test('should add token_version column if missing', () => {
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
                zen_pub TEXT,
                zen_priv TEXT,
                zen_auth_mode TEXT NOT NULL DEFAULT 'local',
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);
        createAuthService(db, 'secret');
        const columns = db.prepare("PRAGMA table_info(admin)").all();
        const columnNames = columns.map((c: any) => c.name);
        expect(columnNames).toContain('token_version');
    });

    test('should add artist_unlinked column if missing', () => {
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
                zen_pub TEXT,
                zen_priv TEXT,
                zen_auth_mode TEXT NOT NULL DEFAULT 'local',
                is_active INTEGER DEFAULT 1,
                token_version INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);
        createAuthService(db, 'secret');
        const columns = db.prepare("PRAGMA table_info(admin)").all();
        const columnNames = columns.map((c: any) => c.name);
        expect(columnNames).toContain('artist_unlinked');
    });

    test('should rename legacy gun_pub/gun_priv/gun_auth_mode columns to zen_* and preserve data', () => {
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
        db.exec(`INSERT INTO admin (username, password_hash, gun_pub, gun_priv) VALUES ('zenuser', 'testhash', 'pubkey123', 'privkey456')`);

        createAuthService(db, 'secret');

        const columns = db.prepare("PRAGMA table_info(admin)").all();
        const columnNames = columns.map((c: any) => c.name);
        expect(columnNames).toContain('zen_pub');
        expect(columnNames).toContain('zen_priv');
        expect(columnNames).toContain('zen_auth_mode');
        expect(columnNames).not.toContain('gun_pub');
        expect(columnNames).not.toContain('gun_priv');
        expect(columnNames).not.toContain('gun_auth_mode');

        const row = db.prepare("SELECT zen_pub, zen_priv FROM admin WHERE username = 'zenuser'").get() as any;
        expect(row.zen_pub).toBe('pubkey123');
        expect(row.zen_priv).toBe('privkey456');
    });

    test('should recreate table and migrate data if critical columns are missing', () => {
        // Create an old v1 table
        db.exec(`
            CREATE TABLE admin (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'admin'
            )
        `);
        db.exec(`INSERT INTO admin (username, password_hash) VALUES ('testuser', 'testhash')`);

        createAuthService(db, 'secret');

        const columns = db.prepare("PRAGMA table_info(admin)").all();
        const columnNames = columns.map((c: any) => c.name);

        // Assert new schema columns
        expect(columnNames).toContain('artist_id');
        expect(columnNames).toContain('subsonic_token');

        // Assert data migration
        const row = db.prepare("SELECT * FROM admin WHERE username = 'testuser'").get() as any;
        expect(row).toBeDefined();
        expect(row.password_hash).toBe('testhash');
        expect(row.role).toBe('admin');
        expect(row.storage_quota).toBe(0);
    });

    test('should recreate table without losing zen_auth_mode when legacy gun_pub triggers the multi-user migration', () => {
        // Simulates a DB updated straight from a pre-3.11.5 install: gun_pub/gun_priv
        // never got renamed, so hasZenPub is false and the recreate path fires.
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
                is_active INTEGER DEFAULT 1
            )
        `);
        db.exec(`INSERT INTO admin (username, password_hash, gun_pub, gun_priv) VALUES ('admin', 'testhash', 'pubkey123', 'privkey456')`);

        createAuthService(db, 'secret');

        const columns = db.prepare("PRAGMA table_info(admin)").all() as any[];
        const columnNames = columns.map((c) => c.name);
        expect(columnNames).toContain('zen_auth_mode');
        expect(columnNames).toContain('zen_pub');

        const row = db.prepare("SELECT password_hash, zen_pub, zen_priv, zen_auth_mode FROM admin WHERE username = 'admin'").get() as any;
        expect(row.password_hash).toBe('testhash');
        expect(row.zen_pub).toBe('pubkey123');
        expect(row.zen_priv).toBe('privkey456');
        expect(row.zen_auth_mode).toBe('local');
    });

    test('should upgrade storage_quota from 10MB to 1GB for existing users', () => {
        const TEN_MB = 10 * 1024 * 1024;
        const ONE_GB = 1024 * 1024 * 1024;

        db.exec(`
            CREATE TABLE admin (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                artist_id INTEGER DEFAULT NULL,
                artist_unlinked INTEGER DEFAULT 0,
                role TEXT NOT NULL DEFAULT 'admin',
                storage_quota INTEGER NOT NULL DEFAULT ${TEN_MB},
                storage_used INTEGER NOT NULL DEFAULT 0,
                subsonic_token TEXT,
                subsonic_password TEXT,
                zen_pub TEXT,
                zen_priv TEXT,
                zen_auth_mode TEXT NOT NULL DEFAULT 'local',
                is_active INTEGER DEFAULT 1,
                token_version INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);
        db.exec(`INSERT INTO admin (username, password_hash) VALUES ('quotauser', 'testhash')`);

        createAuthService(db, 'secret');

        const row = db.prepare("SELECT storage_quota FROM admin WHERE username = 'quotauser'").get() as any;
        expect(row.storage_quota).toBe(ONE_GB);
    });

    test('should handle database errors gracefully', () => {
        // A read-only DB or throwing mock
        const mockDb = {
            prepare: jest.fn().mockImplementation(() => {
                throw new Error("Mock DB Error");
            }),
            exec: jest.fn(),
        } as any;

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        expect(() => {
            createAuthService(mockDb, 'secret');
        }).not.toThrow();

        expect(consoleSpy).toHaveBeenCalledWith("Database migration error:", expect.any(Error));
        consoleSpy.mockRestore();
    });

    describe('Subsonic app password', () => {
        const md5 = (s: string) =>
            crypto.createHash('md5').update(s).digest('hex');

        const seedUser = async (auth: any) => {
            // authenticateUser consults the artist registry on login.
            db.exec(`
                CREATE TABLE IF NOT EXISTS artists (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT
                )
            `);
            await auth.createAdmin('subuser', 'AccountPassword123!');
        };

        test('login does not store the account password in cleartext', async () => {
            const auth = createAuthService(db, 'secret') as any;
            await seedUser(auth);

            const result = await auth.authenticateUser('subuser', 'AccountPassword123!');
            expect(result).toBeTruthy();

            const row = db
                .prepare("SELECT subsonic_password FROM admin WHERE username = 'subuser'")
                .get() as any;
            expect(row.subsonic_password).toBeFalsy();
        });

        test('token auth accepts the app password and rejects the account password', async () => {
            const auth = createAuthService(db, 'secret') as any;
            await seedUser(auth);

            const appPassword = auth.createSubsonicAppPassword('subuser');
            expect(typeof appPassword).toBe('string');
            expect(appPassword.length).toBeGreaterThan(20);

            const salt = 'abc123';
            await expect(
                auth.verifySubsonicToken('subuser', md5(appPassword + salt), salt)
            ).resolves.toBe(true);
            await expect(
                auth.verifySubsonicToken('subuser', md5('AccountPassword123!' + salt), salt)
            ).resolves.toBe(false);
        });

        test('p= auth accepts the app password', async () => {
            const auth = createAuthService(db, 'secret') as any;
            await seedUser(auth);
            const appPassword = auth.createSubsonicAppPassword('subuser');

            expect(auth.verifySubsonicPassword('subuser', appPassword)).toBe(true);
            expect(auth.verifySubsonicPassword('subuser', 'wrong')).toBe(false);
            // A multibyte guess must not throw on the timing-safe compare.
            expect(auth.verifySubsonicPassword('subuser', 'pàsswòrd')).toBe(false);
        });

        test('revoking clears both the app password and any legacy copy', async () => {
            const auth = createAuthService(db, 'secret') as any;
            await seedUser(auth);
            const appPassword = auth.createSubsonicAppPassword('subuser');
            expect(auth.hasSubsonicAppPassword('subuser')).toBe(true);

            auth.revokeSubsonicAppPassword('subuser');

            expect(auth.hasSubsonicAppPassword('subuser')).toBe(false);
            expect(auth.verifySubsonicPassword('subuser', appPassword)).toBe(false);
        });

        test('legacy stored password still authenticates during the deprecation window', async () => {
            const auth = createAuthService(db, 'secret') as any;
            await seedUser(auth);
            // Simulate a row written by a pre-migration release.
            db.prepare("UPDATE admin SET subsonic_password = ? WHERE username = 'subuser'")
                .run(encryptZenPrivHelper('LegacyPassword123!', 'secret'));

            const salt = 'zz99';
            await expect(
                auth.verifySubsonicToken('subuser', md5('LegacyPassword123!' + salt), salt)
            ).resolves.toBe(true);
        });
    });
});
