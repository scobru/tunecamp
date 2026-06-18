import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { KvKey } from '@fedify/fedify';
import { BetterSqliteKvStore } from './fedify-kv.js';

// better-sqlite3 is imported as `import type` only in fedify-kv.ts,
// so no runtime dependency — we pass a plain mock object directly.

const k = (arr: string[]): KvKey => arr as unknown as KvKey;

describe('BetterSqliteKvStore', () => {
    let mockExec: jest.Mock;
    let mockGet: jest.Mock;
    let mockRun: jest.Mock;
    let mockPrepare: jest.Mock;
    let store: BetterSqliteKvStore;

    beforeEach(() => {
        mockGet = jest.fn();
        mockRun = jest.fn();
        mockPrepare = jest.fn().mockReturnValue({ get: mockGet, run: mockRun });
        mockExec = jest.fn();
        const mockDb: any = { exec: mockExec, prepare: mockPrepare };
        store = new BetterSqliteKvStore(mockDb, 'test_kv');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should initialize the database table', () => {
        expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS test_kv'));
    });

    describe('set', () => {
        it('should store a value without TTL', async () => {
            const key = k(['user', '1']);
            const value = { name: 'Alice' };

            await store.set(key, value);

            expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO test_kv'));
            expect(mockRun).toHaveBeenCalledWith(
                JSON.stringify(key),
                JSON.stringify(value),
                null
            );
        });

        it('should store a value with TTL', async () => {
            const key = k(['session', 'abc']);
            const value = 'data';
            const ttl = {
                total: jest.fn().mockReturnValue(3600000)
            };

            const now = 1000000;
            jest.spyOn(Date, 'now').mockReturnValue(now);

            await store.set(key, value, { ttl: ttl as any });

            expect(mockRun).toHaveBeenCalledWith(
                JSON.stringify(key),
                JSON.stringify(value),
                now + 3600000
            );
        });
    });

    describe('get', () => {
        it('should return undefined for non-existent key', async () => {
            mockGet.mockReturnValue(undefined);

            const result = await store.get(k(['missing']));

            expect(result).toBeUndefined();
        });

        it('should return stored value if not expired', async () => {
            const key = k(['test']);
            const value = { foo: 'bar' };
            mockGet.mockReturnValue({
                value: JSON.stringify(value),
                expires_at: Date.now() + 10000
            });

            const result = await store.get(key);

            expect(result).toEqual(value);
        });

        it('should return undefined and delete if expired', async () => {
            const key = k(['expired']);
            const now = 2000000;
            jest.spyOn(Date, 'now').mockReturnValue(now);

            mockGet.mockReturnValue({
                value: JSON.stringify('something'),
                expires_at: now - 1000
            });

            const result = await store.get(key);

            expect(result).toBeUndefined();
            expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM test_kv WHERE key = ?'));
            expect(mockRun).toHaveBeenCalledWith(JSON.stringify(key));
        });

        it('should return undefined if JSON parsing fails', async () => {
            mockGet.mockReturnValue({
                value: 'invalid-json',
                expires_at: null
            });

            const result = await store.get(k(['bad-json']));

            expect(result).toBeUndefined();
        });
    });

    describe('delete', () => {
        it('should delete a key', async () => {
            const key = k(['to-delete']);

            await store.delete(key);

            expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM test_kv WHERE key = ?'));
            expect(mockRun).toHaveBeenCalledWith(JSON.stringify(key));
        });
    });
});
