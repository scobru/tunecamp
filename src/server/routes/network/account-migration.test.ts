import { describe, test, expect } from '@jest/globals';
import { validateArchive, resolvePlaylists, ARCHIVE_VERSION } from './account-migration.js';

describe('account-migration archive', () => {
    test('validateArchive rejects wrong version and bad shape', () => {
        expect(() => validateArchive(null)).toThrow();
        expect(() => validateArchive({ version: 999, playlists: [] })).toThrow();
        expect(() => validateArchive({ version: ARCHIVE_VERSION, playlists: "nope" })).toThrow();
        expect(() => validateArchive({ version: ARCHIVE_VERSION, playlists: [{ name: 'x' }] })).toThrow();
        expect(validateArchive({ version: ARCHIVE_VERSION, playlists: [] })).toBeTruthy();
    });

    test('resolvePlaylists maps resolvable tracks and reports the rest', () => {
        // Local catalog: only "Song A" by "Artist" exists.
        const findTrack = (title: string, artist: string): number | null =>
            title.toLowerCase() === 'song a' && artist.toLowerCase() === 'artist' ? 42 : null;

        const { resolved, skipped } = resolvePlaylists([
            {
                name: 'Mix',
                is_public: true,
                tracks: [
                    { title: 'Song A', artist: 'Artist' },   // resolves -> 42
                    { title: 'Missing', artist: 'Nobody' },   // skipped
                ],
            },
        ], findTrack);

        expect(resolved).toHaveLength(1);
        expect(resolved[0]!.trackIds).toEqual([42]);
        expect(resolved[0]!.is_public).toBe(true);
        expect(skipped).toEqual([{ playlist: 'Mix', title: 'Missing', artist: 'Nobody' }]);
    });
});
