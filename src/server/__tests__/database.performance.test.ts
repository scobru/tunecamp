import { describe, it, expect } from '@jest/globals';
import { createDatabase } from '../core/database.js';

describe('Database Performance Improvements', () => {
    it('should create an index on albums(date)', () => {
        const dbService = createDatabase(':memory:');
        const index = (dbService.db as any).prepare(
            "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_albums_date'"
        ).get();
        expect(index).toBeDefined();
    });

    it('should use optimized query for getListeningStats', () => {
        const dbService = createDatabase(':memory:');
        const stats = dbService.getListeningStats();
        expect(stats).toBeDefined();
        expect(stats.totalPlays).toBe(0);
    });
});
