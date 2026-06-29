import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { NowPlayingService } from './now-playing.service.js';

describe('NowPlayingService', () => {
    let service: NowPlayingService;

    beforeEach(() => {
        service = new NowPlayingService();
        jest.useFakeTimers();
        jest.setSystemTime(100000); // arbitrary start time
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should be initially empty', () => {
        expect(service.list()).toEqual([]);
    });

    it('should set and list a users playing state', () => {
        service.set('alice', {
            trackId: 123,
            title: 'Song A',
            artist: 'Artist A'
        });

        const list = service.list();
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({
            username: 'alice',
            trackId: 123,
            title: 'Song A',
            artist: 'Artist A',
        });
    });

    it('should handle null trackId by keeping it as null', () => {
        service.set('bob', {
            trackId: null,
            title: 'Song B',
            artist: 'Artist B'
        });

        const list = service.list();
        expect(list[0].trackId).toBeNull();
    });

    it('should update an existing users state', () => {
        service.set('alice', {
            trackId: 123,
            title: 'Song A',
            artist: 'Artist A'
        });

        // time passes
        jest.setSystemTime(110000);

        service.set('alice', {
            trackId: 456,
            title: 'Song B',
            artist: 'Artist C'
        });

        const list = service.list();
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({
            username: 'alice',
            trackId: 456,
            title: 'Song B',
            artist: 'Artist C',
        });
    });

    it('should clear a users presence', () => {
        service.set('alice', {
            trackId: 123,
            title: 'Song A',
            artist: 'Artist A'
        });

        service.clear('alice');

        expect(service.list()).toEqual([]);
    });

    it('should clear only the specified user', () => {
        service.set('alice', { trackId: 1, title: 'A', artist: 'A' });
        service.set('bob', { trackId: 2, title: 'B', artist: 'B' });

        service.clear('alice');

        const list = service.list();
        expect(list).toHaveLength(1);
        expect(list[0].username).toBe('bob');
    });

    it('should prune stale entries when listing', () => {
        service.set('alice', { trackId: 1, title: 'A', artist: 'A' });

        // 59 seconds pass (TTL is 60s)
        jest.setSystemTime(100000 + 59000);
        service.set('bob', { trackId: 2, title: 'B', artist: 'B' });

        expect(service.list()).toHaveLength(2);

        // 2 more seconds pass. alice is now at 100000, current time is 161000.
        // Diff is 61000 > 60000, so alice should be pruned.
        jest.setSystemTime(100000 + 61000);

        const list = service.list();
        expect(list).toHaveLength(1);
        expect(list[0].username).toBe('bob');

        // bob should also be pruned eventually
        jest.setSystemTime(100000 + 59000 + 61000);
        expect(service.list()).toHaveLength(0);
    });

    it('should keep entries that are exactly TTL_MS old (cutoff inclusive behavior)', () => {
        service.set('alice', { trackId: 1, title: 'A', artist: 'A' });

        // Exactly 60 seconds pass
        jest.setSystemTime(100000 + 60000);

        const list = service.list();
        expect(list).toHaveLength(1);
        expect(list[0].username).toBe('alice');
    });

    it('should handle empty strings for title and artist gracefully', () => {
        service.set('charlie', {
            trackId: null,
            title: '',
            artist: ''
        });

        const list = service.list();
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({
            username: 'charlie',
            trackId: null,
            title: '',
            artist: ''
        });
    });

    it('should not throw if clearing a non-existent user', () => {
        expect(() => {
            service.clear('non-existent-user');
        }).not.toThrow();
        expect(service.list()).toEqual([]);
    });

    it('should return multiple active entries', () => {
        service.set('user1', { trackId: 1, title: 'Title1', artist: 'Artist1' });
        service.set('user2', { trackId: 2, title: 'Title2', artist: 'Artist2' });

        const list = service.list();
        expect(list).toHaveLength(2);

        expect(list).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ username: 'user1' }),
                expect.objectContaining({ username: 'user2' })
            ])
        );
    });
});
