import { describe, test, expect, beforeEach } from '@jest/globals';
import { LiveService } from './live.service.js';

describe('LiveService', () => {
    let service: LiveService;

    beforeEach(() => {
        service = new LiveService();
    });

    test('list returns an empty array initially', () => {
        expect(service.list()).toEqual([]);
    });

    test('start creates and returns a valid session', () => {
        const session = service.start('testuser', 'Test Title', 'artist-123');
        expect(session).toBeDefined();
        expect(session.roomId).toBeDefined();
        expect(typeof session.roomId).toBe('string');
        expect(session.username).toBe('testuser');
        expect(session.title).toBe('Test Title');
        expect(session.artistId).toBe('artist-123');
        expect(session.startedAt).toBeDefined();

        expect(service.list()).toHaveLength(1);
        expect(service.list()[0]).toEqual(session);
    });

    test('start replaces an existing session for the same user', () => {
        const session1 = service.start('testuser', 'Title 1', 'artist-123');
        expect(service.list()).toHaveLength(1);

        const session2 = service.start('testuser', 'Title 2', 'artist-123');
        expect(service.list()).toHaveLength(1);
        expect(service.list()[0]).toEqual(session2);

        // The old room should no longer exist
        expect(service.list()[0].roomId).not.toEqual(session1.roomId);
        expect(service.list()[0].roomId).toEqual(session2.roomId);
    });

    test('getByUsername returns the correct session or undefined', () => {
        expect(service.getByUsername('nonexistent')).toBeUndefined();

        const session = service.start('testuser', 'Test Title');

        const found = service.getByUsername('testuser');
        expect(found).toBeDefined();
        expect(found).toEqual(session);
    });

    test('stop successfully removes a session by roomId and returns true/false correctly', () => {
        const session = service.start('testuser', 'Test Title');
        expect(service.list()).toHaveLength(1);

        // Stop with invalid ID
        expect(service.stop('invalid-id')).toBe(false);
        expect(service.list()).toHaveLength(1);

        // Stop with valid ID
        expect(service.stop(session.roomId)).toBe(true);
        expect(service.list()).toHaveLength(0);
        expect(service.getByUsername('testuser')).toBeUndefined();
    });
});
