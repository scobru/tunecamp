import { describe, test, expect, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import multer from 'multer';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { discardUploadOnError } from '../uploads.js';

describe('discardUploadOnError', () => {
    let dir: string;
    afterEach(async () => { if (dir) await fs.remove(dir); });

    const appWith = (status: number) => {
        const app = express();
        const upload = multer({ dest: dir });
        app.post('/x', discardUploadOnError, upload.single('f'), (_req, res) => { res.status(status).end(); });
        return app;
    };

    test('removes the stored file when the route refuses the request', async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-upload-'));
        await request(appWith(403)).post('/x').attach('f', Buffer.from('data'), 'a.mp3');
        await new Promise(r => setTimeout(r, 50));
        expect(await fs.readdir(dir)).toEqual([]);
    });

    test('keeps the file when the route succeeds', async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tc-upload-'));
        await request(appWith(201)).post('/x').attach('f', Buffer.from('data'), 'a.mp3');
        await new Promise(r => setTimeout(r, 50));
        expect(await fs.readdir(dir)).toHaveLength(1);
    });
});
