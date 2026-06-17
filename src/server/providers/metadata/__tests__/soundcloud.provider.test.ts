import { jest, describe, test, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../utils/soundcloud.js', () => ({
    scApiRequest: jest.fn(),
    resolveArtworkUrl: jest.fn(() => 'https://art.test/cover.jpg'),
}));

const { scApiRequest, resolveArtworkUrl } = await import('../../../utils/soundcloud.js');
const { SoundCloudMetadataProvider } = await import('../soundcloud.metadata.js');

const provider = new SoundCloudMetadataProvider();

beforeEach(() => {
    jest.clearAllMocks();
    (resolveArtworkUrl as any).mockReturnValue('https://art.test/cover.jpg');
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('SoundCloudMetadataProvider', () => {
    test('has the expected provider identity', () => {
        expect(provider.id).toBe('soundcloud');
        expect(provider.name).toBe('SoundCloud');
    });

    describe('searchRecording', () => {
        test('maps track results with derived year and resolved artwork', async () => {
            (scApiRequest as any).mockResolvedValueOnce({
                collection: [{
                    id: 555,
                    title: 'My Track',
                    user: { username: 'DJ' },
                    created_at: '2021-05-04T10:00:00Z',
                    genre: 'House',
                    description: 'desc',
                }],
            });

            const [r] = await provider.searchRecording('my track');

            expect(scApiRequest).toHaveBeenCalledWith('search/tracks', { q: 'my track', limit: '5' });
            expect(r).toEqual({
                id: '555',
                title: 'My Track',
                artist: 'DJ',
                albumTitle: undefined,
                date: '2021-05-04',
                year: 2021,
                genre: 'House',
                coverUrl: 'https://art.test/cover.jpg',
                description: 'desc',
                source: 'soundcloud',
            });
        });

        test('defaults the artist to "Unknown" and empty date when fields are missing', async () => {
            (scApiRequest as any).mockResolvedValueOnce({ collection: [{ id: 1, title: 'T' }] });
            const [r] = await provider.searchRecording('q');
            expect(r.artist).toBe('Unknown');
            expect(r.date).toBe('');
            expect(r.year).toBeUndefined();
        });

        test('returns [] on error', async () => {
            (scApiRequest as any).mockRejectedValueOnce(new Error('boom'));
            expect(await provider.searchRecording('q')).toEqual([]);
        });
    });

    describe('searchRelease', () => {
        test('delegates to track search', async () => {
            (scApiRequest as any).mockResolvedValueOnce({ collection: [] });
            await provider.searchRelease('q');
            expect(scApiRequest).toHaveBeenCalledWith('search/tracks', { q: 'q', limit: '5' });
        });
    });

    describe('getCoverUrl', () => {
        test('looks up the track and resolves its artwork', async () => {
            (scApiRequest as any).mockResolvedValueOnce({ id: 42 });
            const url = await provider.getCoverUrl('42');
            expect(scApiRequest).toHaveBeenCalledWith('tracks/42');
            expect(url).toBe('https://art.test/cover.jpg');
        });

        test('returns null for a non-numeric id without a request', async () => {
            expect(await provider.getCoverUrl('not-a-number')).toBeNull();
            expect(scApiRequest).not.toHaveBeenCalled();
        });

        test('returns null when the lookup throws', async () => {
            (scApiRequest as any).mockRejectedValueOnce(new Error('boom'));
            expect(await provider.getCoverUrl('42')).toBeNull();
        });
    });

    describe('searchArtist', () => {
        test('maps user results to artist metadata', async () => {
            (scApiRequest as any).mockResolvedValueOnce({
                collection: [{ id: 7, username: 'DJ', description: 'bio', permalink_url: 'https://soundcloud.com/dj' }],
            });
            const [r] = await provider.searchArtist('dj');
            expect(scApiRequest).toHaveBeenCalledWith('search/users', { q: 'dj', limit: '5' });
            expect(r).toEqual({
                id: '7',
                name: 'DJ',
                bio: 'bio',
                avatarUrl: 'https://art.test/cover.jpg',
                links: { soundcloud: 'https://soundcloud.com/dj' },
                source: 'soundcloud',
            });
        });

        test('returns [] on error', async () => {
            (scApiRequest as any).mockRejectedValueOnce(new Error('boom'));
            expect(await provider.searchArtist('q')).toEqual([]);
        });
    });
});
