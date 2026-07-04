import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import fs from '../../../utils/fs.js';
import { LocalDiskStorage } from './storage.engine.js';

describe('LocalDiskStorage', () => {
    let engine: LocalDiskStorage;
    let dir: string;

    beforeEach(async () => {
        engine = new LocalDiskStorage();
        dir = path.join(os.tmpdir(), `tc-storage-${crypto.randomBytes(6).toString('hex')}`);
        await fs.ensureDir(dir);
    });

    afterEach(async () => {
        await fs.remove(dir);
    });

    test('ensureDir creates nested directories and pathExists reflects it', async () => {
        const nested = path.join(dir, 'a', 'b', 'c');
        expect(await engine.pathExists(nested)).toBe(false);
        await engine.ensureDir(nested);
        expect(await engine.pathExists(nested)).toBe(true);
    });

    test('writeFile + readFile round-trips text content', async () => {
        const file = path.join(dir, 'note.txt');
        await engine.writeFile(file, 'hello world');
        expect(await engine.readFile(file, 'utf-8')).toBe('hello world');
    });

    test('readFileBuffer returns a Buffer with the raw bytes', async () => {
        const file = path.join(dir, 'bin.dat');
        const bytes = Buffer.from([0, 1, 2, 250]);
        await engine.writeFile(file, bytes);
        const read = await engine.readFileBuffer(file);
        expect(Buffer.isBuffer(read)).toBe(true);
        expect(read.equals(bytes)).toBe(true);
    });

    test('move relocates a file; overwrite controls clobbering', async () => {
        const src = path.join(dir, 'src.txt');
        const dest = path.join(dir, 'sub', 'dest.txt');
        await engine.writeFile(src, 'payload');
        await engine.move(src, dest);
        expect(await engine.pathExists(src)).toBe(false);
        expect(await engine.readFile(dest, 'utf-8')).toBe('payload');

        // Moving onto an existing file without overwrite rejects.
        const src2 = path.join(dir, 'src2.txt');
        await engine.writeFile(src2, 'newer');
        await expect(engine.move(src2, dest)).rejects.toBeDefined();
        await engine.move(src2, dest, { overwrite: true });
        expect(await engine.readFile(dest, 'utf-8')).toBe('newer');
    });

    test('remove deletes a file', async () => {
        const file = path.join(dir, 'gone.txt');
        await engine.writeFile(file, 'x');
        await engine.remove(file);
        expect(await engine.pathExists(file)).toBe(false);
    });

    test('remove is a no-op on a missing path (does not throw)', async () => {
        await expect(engine.remove(path.join(dir, 'nope.txt'))).resolves.toBeUndefined();
    });

    test('readdir lists directory entries', async () => {
        await engine.writeFile(path.join(dir, 'one.txt'), '1');
        await engine.writeFile(path.join(dir, 'two.txt'), '2');
        const entries = await engine.readdir(dir);
        expect(entries.sort()).toEqual(['one.txt', 'two.txt']);
    });

    test('stat reports file size', async () => {
        const file = path.join(dir, 'sized.txt');
        await engine.writeFile(file, 'abcde');
        const stats = await engine.stat(file);
        expect(stats.size).toBe(5);
        expect(stats.isFile()).toBe(true);
    });

    describe('writeFileStream', () => {
        test('pipes a readable stream to disk and resolves on finish', async () => {
            const file = path.join(dir, 'streamed.txt');
            const source = Readable.from(['chunk-1 ', 'chunk-2']);
            await engine.writeFileStream(file, source);
            expect(await engine.readFile(file, 'utf-8')).toBe('chunk-1 chunk-2');
        });

        test('rejects when the source stream errors', async () => {
            const file = path.join(dir, 'broken.txt');
            const source = new Readable({
                read() {
                    this.emit('error', new Error('stream blew up'));
                },
            });
            await expect(engine.writeFileStream(file, source)).rejects.toThrow('stream blew up');
        });
    });
});
