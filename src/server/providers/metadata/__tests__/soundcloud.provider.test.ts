import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import * as soundcloudUtils from '../../../utils/soundcloud.js';
import { SoundCloudMetadataProvider } from '../soundcloud.metadata.js';

const scApiRequestSpy = jest.spyOn(soundcloudUtils, 'scApiRequest' as any);
const resolveArtworkUrlSpy = jest.spyOn(soundcloudUtils, 'resolveArtworkUrl' as any);

const provider = new SoundCloudMetadataProvider();

beforeEach(() => {
    jest.clearAllMocks();
    resolveArtworkUrlSpy.mockReturnValue('https://art.test/cover.jpg' as any);
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('SoundCloudMetadataProvider', () => {
    test('has the expected provider identity', () => {
        expect(provider.id).toBe('soundcloud');
        expect(provider.name).toBe('SoundCloud');
    });

    describe('searchRecording', () => {
        test('maps track results with derived year and resolved artwork', async () => {
            scApiRequestSpy.mockResolvedValueOnce({
                collection: [{
                    id: 555,
                    title: 'My Track',
                    user: { username: 'DJ' },
                    created_at: '2021-05-04T10:00:00Z',
                    genre: 'House',
                    description: 'desc',
                }],
            } as any);

            const [r] = await provider.searchRecording('my track');

            expect(scApiRequestSpy).toHaveBeenCalledWith('search/tracks', { q: 'my track', limit: '5' });
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
            scApiRequestSpy.mockResolvedValueOnce({ collection: [{ id: 1, title: 'T' }] } as any);
            const [r] = await provider.searchRecording('q');
            expect(r.artist).toBe('Unknown');
            expect(r.date).toBe('');
            expect(r.year).toBeUndefined();
        });

        test('returns [] on error', async () => {
            scApiRequestSpy.mockRejectedValueOnce(new Error('boom'));
            expect(await provider.searchRecording('q')).toEqual([]);
        });
    });

    describe('searchRelease', () => {
        test('delegates to track search', async () => {
            scApiRequestSpy.mockResolvedValueOnce({ collection: [] } as any);
            await provider.searchRelease('q');
            expect(scApiRequestSpy).toHaveBeenCalledWith('search/tracks', { q: 'q', limit: '5' });
        });
    });

    describe('getCoverUrl', () => {
        test('looks up the track and resolves its artwork', async () => {
            scApiRequestSpy.mockResolvedValueOnce({ id: 42 } as any);
            const url = await provider.getCoverUrl('42');
            expect(scApiRequestSpy).toHaveBeenCalledWith('tracks/42');
            expect(url).toBe('https://art.test/cover.jpg');
        });

        test('returns null for a non-numeric id without a request', async () => {
            expect(await provider.getCoverUrl('not-a-number')).toBeNull();
            expect(scApiRequestSpy).not.toHaveBeenCalled();
        });

        test('returns null when the lookup throws', async () => {
            scApiRequestSpy.mockRejectedValueOnce(new Error('boom'));
            expect(await provider.getCoverUrl('42')).toBeNull();
        });
    });

    describe('searchArtist', () => {
        test('maps user results to artist metadata', async () => {
            scApiRequestSpy.mockResolvedValueOnce({
                collection: [{ id: 7, username: 'DJ', description: 'bio', permalink_url: 'https://soundcloud.com/dj' }],
            } as any);
            const [r] = await provider.searchArtist('dj');
            expect(scApiRequestSpy).toHaveBeenCalledWith('search/users', { q: 'dj', limit: '5' });
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
            scApiRequestSpy.mockRejectedValueOnce(new Error('boom'));
            expect(await provider.searchArtist('q')).toEqual([]);
        });
    });
});
