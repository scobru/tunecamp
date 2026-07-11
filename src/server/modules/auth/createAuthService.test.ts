import sqlite3 from 'better-sqlite3';
import { jest } from '@jest/globals';
import { createAuthService } from './auth.service.js';

describe('createAuthService', () => {
    let db: any;

    beforeEach(() => {
        db = new sqlite3(':memory:');
    });

    afterEach(() => {
        db.close();
    });

    test('initializes and returns AuthService interface', () => {
        const authService = createAuthService(db, 'my-secret');
        expect(authService).toBeDefined();
        expect(typeof authService.init).toBe('function');
    });

    test('creates the admin table if it does not exist', () => {
        createAuthService(db, 'my-secret');
        const columns = db.prepare("PRAGMA table_info(admin)").all();
        expect(columns.length).toBeGreaterThan(0);
        const names = columns.map((c: any) => c.name);
        expect(names).toContain('id');
        expect(names).toContain('username');
        expect(names).toContain('password_hash');
        expect(names).toContain('role');
        expect(names).toContain('token_version');
    });

    test('adds missing token_version column to existing table', () => {
        db.exec(`
            CREATE TABLE admin (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL
            )
        `);
        createAuthService(db, 'secret');
        const columns = db.prepare("PRAGMA table_info(admin)").all();
        const names = columns.map((c: any) => c.name);
        expect(names).toContain('token_version');
    });

    test('migrates old admin_old table to new schema', () => {
        db.exec(`
            CREATE TABLE admin (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL
            )
        `);
        db.exec(`INSERT INTO admin (username, password_hash) VALUES ('testadmin', 'hash')`);

        createAuthService(db, 'secret');

        const user = db.prepare("SELECT * FROM admin WHERE username = 'testadmin'").get() as any;
        expect(user).toBeDefined();
        expect(user.role).toBe('admin');
        expect(user.storage_quota).toBe(0);
    });
});
