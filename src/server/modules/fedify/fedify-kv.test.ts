import { jest, describe, it, expect, beforeEach, beforeAll, afterEach } from '@jest/globals';

// Mock better-sqlite3
const mockExec = jest.fn();
const mockPrepare = jest.fn();
const mockGet = jest.fn();
const mockRun = jest.fn();

const mockStmt = {
    get: mockGet,
    run: mockRun,
};

mockPrepare.mockReturnValue(mockStmt);

jest.unstable_mockModule('better-sqlite3', () => {
    return {
        default: jest.fn().mockImplementation(() => ({
            exec: mockExec,
            prepare: mockPrepare,
        })),
    };
});

describe('BetterSqliteKvStore', () => {
    let BetterSqliteKvStore: any;
    let mockDb: any;
    let store: any;

    beforeAll(async () => {
        const module = await import('./fedify-kv.js');
        BetterSqliteKvStore = module.BetterSqliteKvStore;
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        const BetterSqlite = (await import('better-sqlite3')).default;
        mockDb = new BetterSqlite();
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
            const key = ['user', 1];
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
            const key = ['session', 'abc'];
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

            const result = await store.get(['missing']);

            expect(result).toBeUndefined();
        });

        it('should return stored value if not expired', async () => {
            const key = ['test'];
            const value = { foo: 'bar' };
            mockGet.mockReturnValue({
                value: JSON.stringify(value),
                expires_at: Date.now() + 10000
            });

            const result = await store.get(key);

            expect(result).toEqual(value);
        });

        it('should return undefined and delete if expired', async () => {
            const key = ['expired'];
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

            const result = await store.get(['bad-json']);

            expect(result).toBeUndefined();
        });
    });

    describe('delete', () => {
        it('should delete a key', async () => {
            const key = ['to-delete'];

            await store.delete(key);

            expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM test_kv WHERE key = ?'));
            expect(mockRun).toHaveBeenCalledWith(JSON.stringify(key));
        });
    });
});
