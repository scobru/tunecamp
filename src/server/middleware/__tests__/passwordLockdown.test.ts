import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createDatabase } from '../../core/database.js';
import { createAuthService } from '../../modules/auth/auth.service.js';
import { createAuthMiddleware } from '../auth.js';
import fs from 'fs-extra';

/**
 * The setup wizard that nags about the default password lives in the frontend,
 * so it protects nobody who talks to the API directly. These tests pin the
 * server-side half: a session holding a default-password account gets 403 on
 * everything except the endpoints that let it fix the password.
 */
describe('default password lockdown', () => {
    const dbPath = './test-password-lockdown.db';
    let database: any;
    let authService: any;
    let app: express.Express;
    let token: string;

    beforeAll(async () => {
        database = createDatabase(dbPath);
        // Bootstraps the root admin with the shipped default password "admin".
        authService = createAuthService(database.db, 'test-secret', 'admin', 'admin');
        await authService.init();

        const middleware = createAuthMiddleware(authService);
        app = express();
        app.use(express.json());
        app.use('/api', middleware.requirePasswordChanged);
        app.use('/rest', middleware.requirePasswordChanged);
        app.all('*', (_req, res) => { res.json({ reached: true }); });

        // token_version must match the row or verifyToken rejects the token and
        // the guard never sees a username at all.
        token = authService.generateToken({ username: 'admin', userId: 1, role: 'root_admin', tokenVersion: 0 });
    });

    afterAll(() => {
        database?.db?.close();
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    });

    test('blocks an authenticated request while the password is still default', async () => {
        const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('DEFAULT_PASSWORD_LOCKDOWN');
    });

    test('blocks Subsonic, which authenticates by username query param', async () => {
        const res = await request(app).get('/rest/ping.view?u=admin&p=admin');
        expect(res.status).toBe(403);
    });

    test('allows the endpoints needed to set a new password', async () => {
        for (const path of ['/api/auth/password', '/api/auth/status', '/api/auth/login']) {
            const res = await request(app).post(path).set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(200);
        }
    });

    test('leaves anonymous traffic alone so listeners keep streaming', async () => {
        const res = await request(app).get('/api/catalog/albums');
        expect(res.status).toBe(200);
    });

    // Regression guards for existing installs: the lockdown must be a no-op for
    // everyone who is not literally on a built-in default password.
    test('ignores an account with a real password', async () => {
        await authService.createUser('normale', 'una-password-vera', null);
        const row: any = database.db.prepare("SELECT id, token_version FROM admin WHERE username = ?").get('normale');
        const t = authService.generateToken({ username: 'normale', userId: row.id, role: 'user', tokenVersion: row.token_version });
        const res = await request(app).get('/api/catalog/albums').set('Authorization', `Bearer ${t}`);
        expect(res.status).toBe(200);
    });

    test('ignores FID/Zen-only accounts, whose password_hash is an empty string', async () => {
        await authService.createUser('zenuser', null, null, undefined, 'fake-zen-pub');
        const row: any = database.db.prepare("SELECT id, token_version, password_hash, zen_auth_mode FROM admin WHERE username = ?").get('zenuser');
        expect(row.password_hash).toBe('');
        expect(row.zen_auth_mode).toBe('zen');
        // Must resolve false rather than throw on the empty hash, or every
        // request by a FID user turns into a 500.
        await expect(authService.isDefaultPassword('zenuser')).resolves.toBe(false);
        const t = authService.generateToken({ username: 'zenuser', userId: row.id, role: 'user', tokenVersion: row.token_version });
        const res = await request(app).get('/api/catalog/albums').set('Authorization', `Bearer ${t}`);
        expect(res.status).toBe(200);
    });

    test('does not read `u` as an identity claim outside /rest', async () => {
        const res = await request(app).get('/api/catalog/search?u=admin');
        expect(res.status).toBe(200);
    });

    test('lifts the lockdown once the password is changed', async () => {
        await authService.changePassword('admin', 'a-real-password');
        const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
    });
});
