import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { readJwtSecret } from '../config.js';

describe('readJwtSecret snippet tests', () => {
    const testDir = path.join(process.cwd(), '.test-secrets');
    const secretPath = path.join(testDir, 'secret1');
    const legacyPath = path.join(testDir, 'secret2');

    beforeAll(() => {
        if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);
    });

    afterAll(() => {
        if (fs.existsSync(secretPath)) fs.unlinkSync(secretPath);
        if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath);
        if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
    });

    it('should read from secretFilePath if it exists', async () => {
        fs.writeFileSync(secretPath, ' new-secret ');
        const result = await readJwtSecret(secretPath, legacyPath);
        expect(result).toBe('new-secret');
    });

    it('should read from legacySecretPath if secretFilePath does not exist', async () => {
        if (fs.existsSync(secretPath)) fs.unlinkSync(secretPath);
        fs.writeFileSync(legacyPath, ' legacy-secret ');
        const result = await readJwtSecret(secretPath, legacyPath);
        expect(result).toBe('legacy-secret');
    });
});
