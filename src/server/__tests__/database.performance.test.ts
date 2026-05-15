import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';

// Mock better-sqlite3
const mockExec = jest.fn();
const mockPrepare = jest.fn();
const mockGet = jest.fn();
const mockAll = jest.fn().mockReturnValue([]);
const mockRun = jest.fn().mockReturnValue({ changes: 0 });

// Mock return structure for prepared statements
const mockStmt = {
    get: mockGet,
    all: mockAll,
    run: mockRun,
};

mockPrepare.mockReturnValue(mockStmt);

// We need to use unstable_mockModule before import
// Note: This must be called before any imports that use the module
jest.unstable_mockModule('better-sqlite3', () => {
    return {
        default: jest.fn().mockImplementation(() => ({
            pragma: jest.fn(),
            function: jest.fn(),
            exec: mockExec,
            prepare: mockPrepare,
            transaction: (fn: any) => ((...args: any[]) => fn(...args)), // Simple pass-through
        })),
    };
});

describe('Database Performance Improvements', () => {
    let createDatabase: any;

    beforeAll(async () => {
        // Dynamic import after mocking
        const module = await import('../core/database.js');
        createDatabase = module.createDatabase;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset default mock behavior
        mockPrepare.mockReturnValue(mockStmt);
        mockGet.mockReturnValue({}); // Default empty object
    });

    it('should create an index on albums(date)', () => {
        const dbService = createDatabase(':memory:');

        // Verify the index creation SQL was executed
        const calls = mockExec.mock.calls.map(c => c[0]);
        const hasIndex = calls.some((sql: any) =>
            sql && typeof sql === 'string' && sql.includes('CREATE INDEX IF NOT EXISTS idx_albums_date ON albums(date DESC)')
        );

        expect(hasIndex).toBe(true);
    });

    it('should use optimized query for getListeningStats', () => {
        const dbService = createDatabase(':memory:');

        // Mock specific returns for getListeningStats calls
        // The order of db.prepare calls in getListeningStats matters.
        // It calls:
        // 1. Total Plays
        // 2. Plays Stats (Optimized)
        // 3. Unique Tracks
        // 4. Total Listening Time

        // We can just verify that prepare was called with the optimized SQL string

        try {
            dbService.getListeningStats();
        } catch (e) {
            // Ignore errors from return values structure mismatch if any
        }

        const prepareCalls = mockPrepare.mock.calls.map(c => c[0]);

        // Check for the optimized conditional aggregation query
        const optimizedQuery = prepareCalls.find((sql: any) =>
            sql && typeof sql === 'string' &&
            sql.includes('COUNT(CASE WHEN played_at >= ? THEN 1 END) as playsToday') &&
            sql.includes('COUNT(CASE WHEN played_at >= ? THEN 1 END) as playsThisWeek')
        );

        expect(optimizedQuery).toBeTruthy();
    });
});
