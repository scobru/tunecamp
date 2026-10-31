import { describe, test, expect, afterAll } from '@jest/globals';
import fs from 'fs';
import { createDatabase } from '../database.js';
import { createAuthService } from '../../modules/auth/auth.service.js';

const dbPath = './test-api-token-hash.db';
afterAll(() => { for (const s of ['', '-shm', '-wal']) fs.rmSync(dbPath + s, { force: true }); });

describe('tc_ API tokens are stored hashed', () => {
    test('a plaintext token from before the change is hashed on startup and still authenticates', async () => {
        const first = createDatabase(dbPath);
        first.db.prepare("INSERT INTO admin (username, password_hash, role) VALUES ('curator', 'x', 'super_user')").run();
        const userId = (first.db.prepare("SELECT id FROM admin WHERE username = 'curator'").get() as any).id;
        // Simulate a row written by the old code: the raw token in `token`.
        const legacy = 'tc_' + 'ab'.repeat(32);
        first.db.prepare("INSERT INTO api_tokens (user_id, token, name) VALUES (?, ?, 'old')").run(userId, legacy);
        first.db.close();

        const db = createDatabase(dbPath); // migration runs here
        const row = db.db.prepare("SELECT token, token_hint FROM api_tokens WHERE name = 'old'").get() as any;
        expect(row.token).toMatch(/^sha256:[a-f0-9]{64}$/);
        expect(row.token).not.toContain(legacy);
        expect(row.token_hint).toBe('tc_abab...abab');

        const auth = createAuthService(db.db, 'secret');
        expect((await auth.verifyToken(legacy))?.username).toBe('curator');
        expect(await auth.verifyToken(row.token)).toBeNull(); // the stored hash is not a credential
        db.db.close();
    });
});
